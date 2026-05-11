import { GoogleGenAI, type Content, ApiError } from "@google/genai";

const apiKey = process.env.GOOGLE_GEMINI_API_KEY || "";

/** Primary model — override with `GEMINI_MODEL`. */
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

/**
 * Used when the primary returns overloaded / rate-limit (503, 429).
 * Override with `GEMINI_MODEL_FALLBACK`; empty string disables fallback.
 */
const GEMINI_MODEL_FALLBACK =
  process.env.GEMINI_MODEL_FALLBACK === ""
    ? ""
    : process.env.GEMINI_MODEL_FALLBACK ?? "gemini-2.0-flash";

const PRIMARY_RETRIES = Math.min(8, Math.max(1, Number(process.env.GEMINI_RETRY_MAX) || 3));
const FALLBACK_RETRIES = 2;

export type GeminiResult = { text: string; error?: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientGeminiError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 503 || error.status === 429 || error.status === 500;
  }
  const msg = error instanceof Error ? error.message : String(error);
  return /503|429|500|UNAVAILABLE|high demand|Resource exhausted|overloaded|try again later/i.test(
    msg
  );
}

async function sendChatMessage(
  ai: GoogleGenAI,
  model: string,
  history: Content[],
  userMessage: string,
  systemInstruction: string
): Promise<string> {
  const chat = ai.chats.create({
    model,
    config: { systemInstruction },
    history,
  });
  const result = await chat.sendMessage({ message: userMessage });
  return result.text ?? "";
}

const friendlyFailure =
  "The AI service is busy right now. Please try again in a few seconds.";

async function generateWithModelRetries(
  ai: GoogleGenAI,
  model: string,
  history: Content[],
  userMessage: string,
  systemInstruction: string,
  maxAttempts: number
): Promise<GeminiResult> {
  let lastError = "";
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const text = await sendChatMessage(ai, model, history, userMessage, systemInstruction);
      if (text.trim()) return { text };
      lastError = "empty_response";
    } catch (error: unknown) {
      lastError = error instanceof Error ? error.message : String(error);
      if (!isTransientGeminiError(error)) {
        console.error("Gemini API Error:", error);
        return {
          text: "I am currently unable to answer that. Please try again later.",
          error: lastError.slice(0, 500),
        };
      }
      console.warn(
        `Gemini transient error (${model}), attempt ${attempt + 1}/${maxAttempts}:`,
        lastError.slice(0, 200)
      );
      if (attempt < maxAttempts - 1) {
        await sleep(400 * 2 ** attempt + Math.floor(Math.random() * 200));
      }
    }
  }
  return { text: friendlyFailure, error: lastError.slice(0, 500) };
}

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

    const systemInstruction =
      systemPrompt || "You are a helpful AI CRM agent for a business acting on predefined instructions.";

    const history = [...formattedMessages];

    const primary = await generateWithModelRetries(
      ai,
      GEMINI_MODEL,
      history,
      userMessage,
      systemInstruction,
      PRIMARY_RETRIES
    );

    if (!primary.error) return primary;

    const fallback = GEMINI_MODEL_FALLBACK.trim();
    if (!fallback || fallback === GEMINI_MODEL) return primary;

    console.warn(`Gemini: falling back from ${GEMINI_MODEL} to ${fallback}`);
    const secondary = await generateWithModelRetries(
      ai,
      fallback,
      history,
      userMessage,
      systemInstruction,
      FALLBACK_RETRIES
    );
    return secondary;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Gemini API Error:", error);
    return {
      text: "I am currently unable to answer that. Please try again later.",
      error: msg.slice(0, 500),
    };
  }
}
