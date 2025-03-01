-- Migration: Enhance Memory System (March 25, 2024)
-- This migration adds performance improvements and new features to the existing schema

-- Add indexes on commonly queried JSON paths in metadata
CREATE INDEX IF NOT EXISTS idx_ai_memories_metadata_userid ON public.ai_memories USING gin ((metadata -> 'userId'));
CREATE INDEX IF NOT EXISTS idx_ai_memories_metadata_convid ON public.ai_memories USING gin ((metadata -> 'conversationId'));
CREATE INDEX IF NOT EXISTS idx_ai_memories_metadata_longterm ON public.ai_memories USING gin ((metadata -> 'isLongterm'));

-- Add an index on conversations.user_id for faster user-specific queries
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations USING btree (user_id);

-- Add an index on archived status for faster filtering
CREATE INDEX IF NOT EXISTS idx_conversations_is_archived ON public.conversations USING btree (is_archived);

-- Add a timestamp column to ai_memories for improved chronological queries
ALTER TABLE public.ai_memories ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_ai_memories_created_at ON public.ai_memories USING btree (created_at);

-- Add a full-text search capability on memory content
ALTER TABLE public.ai_memories ADD COLUMN IF NOT EXISTS ts_content TSVECTOR 
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
CREATE INDEX IF NOT EXISTS idx_ai_memories_ts_content ON public.ai_memories USING GIN (ts_content);

-- Create a view for convenient access to memories with conversation details
CREATE OR REPLACE VIEW public.memory_view AS
SELECT 
    am.id,
    am.content,
    am.created_at,
    am.metadata,
    c.id AS conversation_id,
    c.title AS conversation_title,
    c.user_id,
    c.is_archived,
    (metadata->>'isLongterm')::boolean AS is_longterm
FROM 
    public.ai_memories am
LEFT JOIN 
    public.conversations c ON (am.metadata->>'conversationId')::uuid = c.id;

-- Add a function to search memories using full-text search
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
        c.id AS conversation_id,
        c.title AS conversation_title,
        ts_rank_cd(am.ts_content, websearch_to_tsquery('english', search_query)) AS similarity
    FROM 
        public.ai_memories am
    LEFT JOIN 
        public.conversations c ON (am.metadata->>'conversationId')::uuid = c.id
    WHERE
        am.ts_content @@ websearch_to_tsquery('english', search_query)
        AND (user_id_param IS NULL OR (am.metadata->>'userId')::uuid = user_id_param)
        AND (conversation_id_param IS NULL OR (am.metadata->>'conversationId')::uuid = conversation_id_param)
        AND (include_longterm = true OR (am.metadata->>'isLongterm')::boolean = false)
    ORDER BY
        similarity DESC
    LIMIT limit_param;
END;
$$;

-- Add a trigger to update conversations.updated_at when related memories are added
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
DECLARE
    conv_id UUID;
BEGIN
    -- Extract the conversationId from metadata
    conv_id := (NEW.metadata->>'conversationId')::uuid;
    
    -- If there's a valid conversation ID, update its timestamp
    IF conv_id IS NOT NULL THEN
        UPDATE public.conversations
        SET updated_at = now()
        WHERE id = conv_id;
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

-- Add RLS policies if not already present (these should match your existing policies)
ALTER TABLE public.ai_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Users can access their own memories" ON public.ai_memories
    FOR ALL TO authenticated
    USING ((metadata->>'userId')::uuid = auth.uid());

-- End of migration 