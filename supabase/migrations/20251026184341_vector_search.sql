-- Vector Search
-- Adds pgvector support and similarity search functions

-- Add embedding column to ai_memories if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ai_memories' AND column_name = 'embedding'
    ) THEN
        ALTER TABLE ai_memories ADD COLUMN embedding vector(1536);
    END IF;
END $$;

-- Create vector similarity search index
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'ai_memories_embedding_idx'
    ) THEN
        CREATE INDEX ai_memories_embedding_idx ON ai_memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
    END IF;
END $$;

-- Create the match_documents function needed by SupabaseVectorStore
CREATE OR REPLACE FUNCTION match_documents(
    query_embedding vector,
    match_count int DEFAULT 5,
    filter jsonb DEFAULT '{}'
)
RETURNS TABLE (
    id bigint,
    content text,
    metadata jsonb,
    embedding vector,
    similarity float
)
LANGUAGE plpgsql
AS $$
DECLARE
    query_text text;
    matched_ids bigint[];
BEGIN
    -- Start with a base query
    query_text := 'WITH matched_rows AS (
        SELECT 
            id,
            content,
            metadata,
            embedding,
            1 - (embedding <=> $1) AS similarity
        FROM 
            ai_memories
        WHERE 
            embedding IS NOT NULL';
    
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
