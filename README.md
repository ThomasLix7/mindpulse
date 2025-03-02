This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

# MindPulse

## Long-Term Memory API

This codebase includes a unified API for working with long-term memories:

### Saving to Long-Term Memory

The system provides a single unified API for long-term memory operations:

```typescript
// To save a new long-term memory
const response = await fetch("/api/memory", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    userId: "user-123",
    userMessage: "What's the capital of France?",
    aiResponse: "The capital of France is Paris.",
  }),
});

// To promote an existing memory to long-term
const response = await fetch("/api/memory", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    userId: "user-123",
    memoryId: "memory-456",
  }),
});
```

### Smart Features

The API includes several smart features:

1. **Duplicate Detection**: Before creating a new long-term memory, the system checks for similar existing memories and promotes them instead of creating duplicates.

2. **Vector Search Integration**: Uses semantic vector search to find similar memories when available, falling back to text-based search.

3. **Unified API**: A single function and API endpoint handles both creating new memories and promoting existing ones.

4. **Metadata Management**: Automatically updates both the dedicated database columns and the metadata JSON for backward compatibility.

### Long-Term Memory Preservation

The system now preserves long-term memories even when the conversation they were created in is deleted:

1. **Memory Preservation**: When a conversation is deleted, all regular memories are deleted, but long-term memories are preserved.

2. **Database Implementation**:

   - The foreign key constraint between `ai_memories` and `conversations` uses `ON DELETE SET NULL` instead of `CASCADE`
   - When a conversation is deleted, its long-term memories have their `conversation_id` set to `NULL` rather than being deleted

3. **Memory Recall**: The memory recall functions are designed to retrieve long-term memories for a user regardless of whether they have an associated conversation.

This ensures important information is never lost, even as users clean up their conversation history.

### Internal API

For direct use in your code:

```typescript
import { saveToLongTermMemory } from "@/utils/memory";

// To create a new long-term memory
await saveToLongTermMemory("user-123", {
  userMessage: "What's the capital of France?",
  aiResponse: "The capital of France is Paris.",
});

// To promote an existing memory to long-term
await saveToLongTermMemory("user-123", {
  memoryId: "memory-456",
});
```
