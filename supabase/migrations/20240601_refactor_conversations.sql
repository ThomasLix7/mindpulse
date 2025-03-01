-- Create new conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL DEFAULT 'New Conversation',
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    is_archived BOOLEAN DEFAULT false
);

-- Add index for faster user-based queries
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);

-- Add direct columns to ai_memories instead of using metadata
ALTER TABLE ai_memories ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE;
ALTER TABLE ai_memories ADD COLUMN IF NOT EXISTS is_longterm BOOLEAN DEFAULT false;
ALTER TABLE ai_memories ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ai_memories ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT now();
ALTER TABLE ai_memories ADD COLUMN IF NOT EXISTS memory_type TEXT DEFAULT 'chat';

-- Update trigger function to set updated_at automatically for conversations
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to conversations table
DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Migration helper to convert existing session-based memories to the new system
-- This will run only once during migration and doesn't affect new data
-- It creates a new conversation for each distinct sessionId and associates the memories
DO $$
DECLARE
    session_id TEXT;
    conversation_uuid UUID;
    memory_user_id UUID;
BEGIN
    -- For each distinct sessionId in ai_memories
    FOR session_id, memory_user_id IN
        SELECT DISTINCT metadata->>'sessionId' as session_id, (metadata->>'userId')::UUID as user_id
        FROM ai_memories
        WHERE metadata->>'sessionId' IS NOT NULL
    LOOP
        -- Skip if session_id is null
        IF session_id IS NULL THEN
            CONTINUE;
        END IF;
        
        -- Create a new conversation for this session
        INSERT INTO conversations (id, title, user_id) 
        VALUES (
            gen_random_uuid(), 
            'Migrated Conversation: ' || session_id,
            memory_user_id
        )
        RETURNING id INTO conversation_uuid;
        
        -- Update all memories with this sessionId to point to the new conversation
        UPDATE ai_memories
        SET 
            conversation_id = conversation_uuid,
            user_id = memory_user_id,
            created_at = CASE 
                WHEN metadata->>'timestamp' IS NOT NULL THEN 
                    to_timestamp((metadata->>'timestamp')::bigint / 1000.0)
                ELSE 
                    now() 
                END,
            memory_type = COALESCE(metadata->>'type', 'chat')
        WHERE metadata->>'sessionId' = session_id;
    END LOOP;
    
    -- For long-term memories (no sessionId, but has userId)
    FOR memory_user_id IN
        SELECT DISTINCT (metadata->>'userId')::UUID as user_id
        FROM ai_memories
        WHERE 
            metadata->>'sessionId' IS NULL AND
            metadata->>'userId' IS NOT NULL
    LOOP
        -- Skip if user_id is null
        IF memory_user_id IS NULL THEN
            CONTINUE;
        END IF;
        
        -- Create a conversation for long-term memories
        INSERT INTO conversations (id, title, user_id)
        VALUES (
            gen_random_uuid(),
            'Long-term Memories',
            memory_user_id
        )
        RETURNING id INTO conversation_uuid;
        
        -- Update all long-term memories for this user
        UPDATE ai_memories
        SET 
            conversation_id = conversation_uuid,
            is_longterm = TRUE,
            user_id = memory_user_id,
            created_at = CASE 
                WHEN metadata->>'timestamp' IS NOT NULL THEN 
                    to_timestamp((metadata->>'timestamp')::bigint / 1000.0)
                ELSE 
                    now() 
                END,
            memory_type = COALESCE(metadata->>'type', 'chat')
        WHERE 
            (metadata->>'userId')::UUID = memory_user_id AND
            metadata->>'sessionId' IS NULL;
    END LOOP;
END
$$ LANGUAGE plpgsql;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_memories_user_id ON ai_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_memories_conversation_id ON ai_memories(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_memories_is_longterm ON ai_memories(is_longterm);
CREATE INDEX IF NOT EXISTS idx_ai_memories_created_at ON ai_memories(created_at); 