-- Migration: Extract Metadata Fields to Dedicated Columns (March 26, 2024)
-- This migration extracts commonly used metadata fields to dedicated columns for better performance

-- Add the dedicated columns to ai_memories table
ALTER TABLE public.ai_memories 
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_longterm BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS memory_type TEXT DEFAULT 'chat';

-- Note: created_at was already added in the previous migration

-- Update existing records to populate the new columns with values from metadata
UPDATE public.ai_memories
SET 
  conversation_id = (metadata->>'conversationId')::uuid,
  is_longterm = (metadata->>'isLongterm')::boolean,
  user_id = (metadata->>'userId')::uuid,
  memory_type = COALESCE(metadata->>'type', 'chat'),
  created_at = CASE 
    WHEN metadata->>'timestamp' IS NOT NULL THEN 
      to_timestamp((metadata->>'timestamp')::bigint / 1000.0)
    ELSE 
      now() 
    END
WHERE 
  metadata IS NOT NULL;

-- Create indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_ai_memories_conversation_id ON public.ai_memories(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_memories_is_longterm ON public.ai_memories(is_longterm);
CREATE INDEX IF NOT EXISTS idx_ai_memories_user_id ON public.ai_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_memories_memory_type ON public.ai_memories(memory_type);

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

-- Update the memory_view to use the dedicated columns instead of extracting from metadata
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

-- Update search_memories function to use the dedicated columns
CREATE OR REPLACE FUNCTION search_memories(
    search_query TEXT,
    user_id_param UUID DEFAULT NULL,
    conversation_id_param UUID DEFAULT NULL,
    include_longterm BOOLEAN DEFAULT true,
    limit_param INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB,
    conversation_id UUID,
    conversation_title TEXT,
    similarity REAL
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        am.id,
        am.content,
        am.created_at,
        am.metadata,
        am.conversation_id,
        c.title AS conversation_title,
        ts_rank_cd(am.ts_content, websearch_to_tsquery('english', search_query)) AS similarity
    FROM 
        public.ai_memories am
    LEFT JOIN 
        public.conversations c ON am.conversation_id = c.id
    WHERE
        am.ts_content @@ websearch_to_tsquery('english', search_query)
        AND (user_id_param IS NULL OR am.user_id = user_id_param)
        AND (conversation_id_param IS NULL OR am.conversation_id = conversation_id_param)
        AND (include_longterm = true OR am.is_longterm = false)
    ORDER BY
        similarity DESC
    LIMIT limit_param;
END;
$$;

-- Update update_conversation_timestamp trigger to use the dedicated column
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

-- End of migration 