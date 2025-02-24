import { NextResponse } from "next/server";
import { model } from "@/lib/gemini";

export const maxDuration = 30;

const sessionHistory = new Map<string, any[]>();

function getSessionHistory(sessionId: string) {
  return sessionHistory.get(sessionId) || [];
}

function updateSessionHistory(
  sessionId: string,
  userMessage: string,
  aiResponse: string
) {
  const history = getSessionHistory(sessionId);
  history.push({ role: "user", parts: [{ text: userMessage }] });
  history.push({ role: "model", parts: [{ text: aiResponse }] });
  sessionHistory.set(sessionId, history);
}

export async function POST(req: Request) {
  try {
    const { message, sessionId } = await req.json();

    if (!message?.trim() || !sessionId?.trim()) {
      return NextResponse.json(
        { error: "Message and session ID are required" },
        { status: 400 }
      );
    }

    const chatSession = model.startChat({
      generationConfig: model.generationConfig,
      history: getSessionHistory(sessionId),
    });

    const result = await chatSession.sendMessage(message);
    const text = result.response.text();

    updateSessionHistory(sessionId, message, text);

    return NextResponse.json({ text });
  } catch (e: any) {
    console.error("API Error:", e);
    return NextResponse.json(
      { error: e.message || "Failed to process request" },
      { status: 500 }
    );
  }
}
