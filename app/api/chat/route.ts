import { NextResponse } from "next/server";
import { model } from "@/lib/gemini";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    if (!message?.trim()) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const result = await model.generateContent(message);
    const text = result.response.text();

    return NextResponse.json({ text });
  } catch (e: any) {
    console.error("API Error:", e);
    return NextResponse.json(
      { error: e.message || "Failed to process request" },
      { status: 500 }
    );
  }
}
