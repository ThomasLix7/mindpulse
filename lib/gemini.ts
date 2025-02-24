import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

export const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-thinking-exp",
  generationConfig: {
    maxOutputTokens: 64000,
    temperature: 0.9,
  },
});
