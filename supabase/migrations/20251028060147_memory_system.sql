-- AI Memory System

-- Enable vector extension
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.ai_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  vector vector(1536) NOT NULL,
  metadata jsonb NOT NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  is_longterm BOOLEAN DEFAULT false,
  memory_type TEXT DEFAULT 'chat',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.ai_memories ADD COLUMN IF NOT EXISTS ts_content TSVECTOR 
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX ai_memories_vector_idx 
ON public.ai_memories 
USING ivfflat (vector vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_ai_memories_conversation_id ON public.ai_memories(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_memories_is_longterm ON public.ai_memories(is_longterm);
CREATE INDEX IF NOT EXISTS idx_ai_memories_user_id ON public.ai_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_memories_memory_type ON public.ai_memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_ai_memories_created_at ON public.ai_memories(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_memories_ts_content ON public.ai_memories USING GIN (ts_content);

CREATE INDEX IF NOT EXISTS idx_ai_memories_metadata_userid ON public.ai_memories USING gin ((metadata -> 'userId'));
CREATE INDEX IF NOT EXISTS idx_ai_memories_metadata_convid ON public.ai_memories USING gin ((metadata -> 'conversationId'));
CREATE INDEX IF NOT EXISTS idx_ai_memories_metadata_longterm ON public.ai_memories USING gin ((metadata -> 'isLongterm'));

-- Row Level Security
ALTER TABLE public.ai_memories ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "User access to own memories" ON public.ai_memories
FOR ALL USING (
  (metadata->>'userId')::uuid = auth.uid()
);

CREATE POLICY "Public read access to session memories" ON public.ai_memories
FOR SELECT USING (
  metadata->>'sessionId' IS NOT NULL
);

-- Memory View
CREATE OR REPLACE VIEW public.memory_view AS
SELECT 
    am.id,
    am.content,
    am.created_at,
    am.metadata,
    am.conversation_id,
    c.title AS conversation_title,
    am.user_id,
    c.status,
    am.is_longterm,
    am.memory_type
FROM 
    public.ai_memories am
LEFT JOIN 
    public.conversations c ON am.conversation_id = c.id;

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

DROP TRIGGER IF EXISTS trigger_populate_ai_memories_columns ON public.ai_memories;
CREATE TRIGGER trigger_populate_ai_memories_columns
BEFORE INSERT OR UPDATE ON public.ai_memories
FOR EACH ROW
EXECUTE FUNCTION populate_ai_memories_columns();

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

DROP TRIGGER IF EXISTS trigger_update_conversation_timestamp ON public.ai_memories;
CREATE TRIGGER trigger_update_conversation_timestamp
AFTER INSERT ON public.ai_memories
FOR EACH ROW
EXECUTE FUNCTION update_conversation_timestamp();

CREATE OR REPLACE FUNCTION match_documents(
    query_embedding vector,
    match_count int DEFAULT 5,
    filter jsonb DEFAULT '{}'
)
RETURNS TABLE (
    id UUID,
    content text,
    metadata jsonb,
    vector vector,
    similarity float
)
LANGUAGE plpgsql
AS $$
DECLARE
    query_text text;
    matched_ids UUID[];
BEGIN
    -- Start with a base query
    query_text := 'WITH matched_rows AS (
        SELECT 
            id,
            content,
            metadata,
            vector,
            1 - (vector <=> $1) AS similarity
        FROM 
            ai_memories
        WHERE 
            vector IS NOT NULL';
    
    -- Handle user ID filter
    IF filter->>'userId' IS NOT NULL THEN
        query_text := query_text || ' AND metadata->>''userId'' = ''' || (filter->>'userId')::text || '''';
    END IF;
    
    -- Handle session ID filter
    IF filter->>'sessionId' IS NOT NULL THEN
        query_text := query_text || ' AND metadata->>''sessionId'' = ''' || (filter->>'sessionId')::text || '''';
    END IF;
    
    -- Handle OR conditions
    IF filter->'or' IS NOT NULL AND jsonb_array_length(filter->'or') > 0 THEN
        query_text := query_text || ' AND (';
        
        FOR i IN 0..jsonb_array_length(filter->'or')-1 LOOP
            IF i > 0 THEN
                query_text := query_text || ' OR ';
            END IF;
            
            IF (filter->'or'->i->>'userId') IS NOT NULL THEN
                query_text := query_text || 'metadata->>''userId'' = ''' || (filter->'or'->i->>'userId')::text || '''';
            END IF;
            
            IF (filter->'or'->i->>'sessionId') IS NOT NULL THEN
                query_text := query_text || 'metadata->>''sessionId'' = ''' || (filter->'or'->i->>'sessionId')::text || '''';
            END IF;
        END LOOP;
        
        query_text := query_text || ')';
    END IF;
    
    -- Complete the query with ordering and limit
    query_text := query_text || '
        ORDER BY similarity DESC
        LIMIT $2
    )
    SELECT * FROM matched_rows';
    
    -- Execute the query
    RETURN QUERY EXECUTE query_text USING query_embedding, match_count;
END;
$$;

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


CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'system_action', 'consent_change', 'model_decision'
  action TEXT NOT NULL, -- 'assessment_started', 'consent_granted', 'difficulty_adjusted'
  resource_type TEXT, -- 'assessment', 'curriculum', 'goal', 'consent', 'model'
  resource_id UUID,
  old_values JSONB,
  new_values JSONB,
  metadata JSONB, -- Flexible data for different event types
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);


CREATE INDEX idx_audit_events_user_id ON audit_events(user_id);
CREATE INDEX idx_audit_events_created_at ON audit_events(created_at);
CREATE INDEX idx_audit_events_event_type ON audit_events(event_type);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their own audit events" ON audit_events FOR ALL USING (auth.uid() = user_id);
