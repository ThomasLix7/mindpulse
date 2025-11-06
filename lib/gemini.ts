import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextApiRequest, NextApiResponse } from "next";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

export const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-thinking-exp-01-21",
  generationConfig: {
    temperature: 0.7,
    topP: 0.95,
    topK: 64,
    maxOutputTokens: 65536,
    responseMimeType: "text/plain",
  },
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const prompt = req.body.prompt; // Assuming you send the prompt in the request body

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
    const result = await model.generateContentStream(prompt);
    res.setHeader("Content-Type", "text/event-stream;charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    for await (const chunk of result.stream) {
      const textChunk = chunk.text();
      if (textChunk) {
        res.write(`data: ${textChunk}\n\n`); // SSE format
      }
    }
    res.end(); // Signal the end of the stream
  } catch (error: any) {
    console.error("Error during Gemini stream:", error);
    res.status(500).json({
      error: "Error generating response",
      details: error.message || "Unknown error",
    });
  }
}
