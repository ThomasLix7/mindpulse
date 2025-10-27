-- Memory Enhancements
-- Adds columns to ai_memories and full-text search capabilities

-- Add dedicated columns to ai_memories table
ALTER TABLE public.ai_memories 
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_longterm BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS memory_type TEXT DEFAULT 'chat';

-- Add full-text search capability on memory content
ALTER TABLE public.ai_memories ADD COLUMN IF NOT EXISTS ts_content TSVECTOR 
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_memories_conversation_id ON public.ai_memories(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_memories_is_longterm ON public.ai_memories(is_longterm);
CREATE INDEX IF NOT EXISTS idx_ai_memories_user_id ON public.ai_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_memories_memory_type ON public.ai_memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_ai_memories_created_at ON public.ai_memories(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_memories_ts_content ON public.ai_memories USING GIN (ts_content);

-- Create indexes on commonly queried JSON paths in metadata
CREATE INDEX IF NOT EXISTS idx_ai_memories_metadata_userid ON public.ai_memories USING gin ((metadata -> 'userId'));
CREATE INDEX IF NOT EXISTS idx_ai_memories_metadata_convid ON public.ai_memories USING gin ((metadata -> 'conversationId'));
CREATE INDEX IF NOT EXISTS idx_ai_memories_metadata_longterm ON public.ai_memories USING gin ((metadata -> 'isLongterm'));

-- Create a view for convenient access to memories with conversation details
CREATE OR REPLACE VIEW public.memory_view AS
SELECT 
    am.id,
    am.content,
    am.created_at,
    am.metadata,
    am.conversation_id,
    c.title AS conversation_title,
    am.user_id,
    c.is_archived,
    am.is_longterm,
    am.memory_type
FROM 
    public.ai_memories am
LEFT JOIN 
    public.conversations c ON am.conversation_id = c.id;

-- Create a trigger function to automatically populate columns from metadata for new records
CREATE OR REPLACE FUNCTION populate_ai_memories_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Only set values from metadata if the dedicated columns are NULL
  IF NEW.conversation_id IS NULL AND NEW.metadata->>'conversationId' IS NOT NULL THEN
    NEW.conversation_id := (NEW.metadata->>'conversationId')::uuid;
  END IF;
  
  IF NEW.is_longterm IS NULL AND NEW.metadata->>'isLongterm' IS NOT NULL THEN
    NEW.is_longterm := (NEW.metadata->>'isLongterm')::boolean;
  END IF;
  
  IF NEW.user_id IS NULL AND NEW.metadata->>'userId' IS NOT NULL THEN
    NEW.user_id := (NEW.metadata->>'userId')::uuid;
  END IF;
  
  IF NEW.memory_type IS NULL AND NEW.metadata->>'type' IS NOT NULL THEN
    NEW.memory_type := NEW.metadata->>'type';
  END IF;
  
  -- If created_at is NULL and metadata has timestamp, convert timestamp to proper date
  IF NEW.created_at IS NULL AND NEW.metadata->>'timestamp' IS NOT NULL THEN
    NEW.created_at := to_timestamp((NEW.metadata->>'timestamp')::bigint / 1000.0);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_populate_ai_memories_columns ON public.ai_memories;
CREATE TRIGGER trigger_populate_ai_memories_columns
BEFORE INSERT OR UPDATE ON public.ai_memories
FOR EACH ROW
EXECUTE FUNCTION populate_ai_memories_columns();

-- Add a trigger to update conversations.updated_at when related memories are added
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    -- If there's a valid conversation ID, update its timestamp
    IF NEW.conversation_id IS NOT NULL THEN
        UPDATE public.conversations
        SET updated_at = now()
        WHERE id = NEW.conversation_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_update_conversation_timestamp ON public.ai_memories;
CREATE TRIGGER trigger_update_conversation_timestamp
AFTER INSERT ON public.ai_memories
FOR EACH ROW
EXECUTE FUNCTION update_conversation_timestamp();

-- Add RLS policies
CREATE POLICY IF NOT EXISTS "Users can access their own memories" ON public.ai_memories
    FOR ALL TO authenticated
    USING (user_id = auth.uid());
