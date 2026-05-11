import { GoogleGenAI, type Content } from "@google/genai";

const apiKey = process.env.GOOGLE_GEMINI_API_KEY || "";

/** Override with `GEMINI_MODEL` in `.env` (e.g. `gemini-2.0-flash`). */
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export type GeminiResult = { text: string; error?: string };

export async function generateGeminiResponse(
  messages: { role: string; content: string }[],
  systemPrompt?: string
): Promise<GeminiResult> {
  try {
    if (!apiKey) {
      console.warn("No Gemini API key found");
      return {
        text: "Mock AI Response: set GOOGLE_GEMINI_API_KEY on the server and restart Next.js.",
        error: "missing_api_key",
      };
    }

    const ai = new GoogleGenAI({ apiKey });

    const formattedMessages: Content[] = messages.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }));

    const prompt = formattedMessages.pop();
    if (!prompt) return { text: "Error: No user message provided.", error: "no_prompt" };

    while (formattedMessages.length > 0 && formattedMessages[0].role === "model") {
      formattedMessages.shift();
    }

    if (prompt.role !== "user") {
      return {
        text: "I am currently unable to answer that. Please try again later.",
        error: "Last message must be from the user for Gemini chat; got role: " + prompt.role,
      };
    }

    const userMessage =
      prompt.parts?.map((p) => ("text" in p && p.text != null ? String(p.text) : "")).join("") ?? "";

    const chat = ai.chats.create({
      model: GEMINI_MODEL,
      config: {
        systemInstruction:
          systemPrompt || "You are a helpful AI CRM agent for a business acting on predefined instructions.",
      },
      history: formattedMessages,
    });

    const result = await chat.sendMessage({ message: userMessage });
    const text = result.text ?? "";
    return { text: text || "I am currently unable to answer that. Please try again later." };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Gemini API Error:", error);
    return {
      text: "I am currently unable to answer that. Please try again later.",
      error: msg.slice(0, 500),
    };
  }
}
