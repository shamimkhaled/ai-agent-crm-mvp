/**
 * ElevenLabs Text-to-Speech — WebSocket stream-input client.
 *
 * Implements the stream-input WebSocket API for ultra-low-latency TTS.
 * Streams text in real-time as Gemini generates tokens, producing audio
 * chunks as quickly as possible for Twilio Media Streams playback.
 *
 * API endpoint: wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input
 * Docs: https://elevenlabs.io/docs/api-reference/websockets
 */

import EventEmitter from "events";

export interface TTSOptions {
  model?: string;
  outputFormat?: "mp3_44100_128" | "pcm_16000" | "pcm_22050" | "ulaw_8000";
  stability?: number;
  similarityBoost?: number;
  speed?: number;
  style?: number;
  useSpeakerBoost?: boolean;
  optimizeStreamingLatency?: 0 | 1 | 2 | 3 | 4;
}

export interface TTSEvents {
  audio: [chunk: Buffer];
  done: [];
  error: [err: Error];
}

const ELEVENLABS_WS_URL = "wss://api.elevenlabs.io/v1";

/**
 * ElevenLabs TTS WebSocket stream-input client.
 *
 * Usage:
 * ```ts
 * const tts = new ElevenLabsTTSStream(voiceId, apiKey, {
 *   model: "eleven_turbo_v2_5",
 *   outputFormat: "ulaw_8000",  // Ready for Twilio
 *   speed: 1.0,
 * });
 * await tts.connect();
 * tts.on("audio", (chunk) => sendToTwilio(chunk));
 * tts.on("done", () => console.log("TTS complete"));
 * tts.sendText("Hello, how can I help?");
 * tts.flush(); // Signals end of text
 * ```
 */
export class ElevenLabsTTSStream extends EventEmitter {
  private ws: import("ws").WebSocket | null = null;
  private voiceId: string;
  private apiKey: string;
  private options: Required<TTSOptions>;
  private connected = false;
  private closed = false;
  private textBuffer: string[] = [];

  constructor(voiceId: string, apiKey: string, options: TTSOptions = {}) {
    super();
    this.voiceId = voiceId;
    this.apiKey = apiKey;
    this.options = {
      model: options.model ?? "eleven_turbo_v2_5",
      outputFormat: options.outputFormat ?? "ulaw_8000",
      stability: options.stability ?? 0.5,
      similarityBoost: options.similarityBoost ?? 0.8,
      speed: options.speed ?? 1.0,
      style: options.style ?? 0,
      useSpeakerBoost: options.useSpeakerBoost ?? true,
      optimizeStreamingLatency: options.optimizeStreamingLatency ?? 4,
    };
  }

  /**
   * Connect to ElevenLabs TTS WebSocket and initialize the session.
   * Must be called before sendText().
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    const { WebSocket } = await import("ws");

    const url = new URL(
      `${ELEVENLABS_WS_URL}/text-to-speech/${this.voiceId}/stream-input`
    );
    url.searchParams.set("model_id", this.options.model);
    url.searchParams.set("output_format", this.options.outputFormat);
    url.searchParams.set(
      "optimize_streaming_latency",
      String(this.options.optimizeStreamingLatency)
    );

    this.ws = new WebSocket(url.toString(), {
      headers: { "xi-api-key": this.apiKey },
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("ElevenLabs TTS WebSocket connection timeout (5s)"));
        this.ws?.close();
      }, 5000);

      this.ws!.on("open", () => {
        clearTimeout(timeout);
        this.connected = true;

        // Send BOS (beginning of stream) initialization
        this.ws!.send(
          JSON.stringify({
            text: " ", // BOS marker — required by ElevenLabs
            voice_settings: {
              stability: this.options.stability,
              similarity_boost: this.options.similarityBoost,
              speed: this.options.speed,
              style: this.options.style,
              use_speaker_boost: this.options.useSpeakerBoost,
            },
            xi_api_key: this.apiKey,
          })
        );

        // Flush any text that was queued before connection
        for (const text of this.textBuffer) {
          this.sendTextImmediate(text);
        }
        this.textBuffer = [];

        resolve();
      });

      this.ws!.on("message", (data: Buffer | string) => {
        try {
          const event = JSON.parse(data.toString()) as {
            audio?: string;
            isFinal?: boolean;
            normalizedAlignment?: unknown;
            error?: string;
          };

          if (event.error) {
            this.emit("error", new Error(`ElevenLabs TTS error: ${event.error}`));
            return;
          }

          if (event.audio) {
            const audioChunk = Buffer.from(event.audio, "base64");
            this.emit("audio", audioChunk);
          }

          if (event.isFinal) {
            this.emit("done");
          }
        } catch (e) {
          // Non-JSON frame (binary audio) — handle as raw audio
          if (data instanceof Buffer) {
            this.emit("audio", data);
          }
        }
      });

      this.ws!.on("error", (err) => {
        clearTimeout(timeout);
        this.emit("error", err);
        if (!this.connected) reject(err);
      });

      this.ws!.on("close", (code, reason) => {
        this.connected = false;
        if (code !== 1000 && !this.closed) {
          this.emit(
            "error",
            new Error(`ElevenLabs TTS WebSocket closed [${code}]: ${reason}`)
          );
        }
      });
    });
  }

  /**
   * Send a text chunk to the TTS stream.
   * Text is automatically buffered if the connection is not yet open.
   *
   * @param text - Text to synthesize (can be partial sentence)
   */
  sendText(text: string): void {
    if (!text.trim()) return;

    if (!this.connected || !this.ws) {
      this.textBuffer.push(text);
      return;
    }

    this.sendTextImmediate(text);
  }

  private sendTextImmediate(text: string): void {
    if (!this.ws || this.closed) return;
    this.ws.send(
      JSON.stringify({
        text,
        flush: false,
      })
    );
  }

  /**
   * Signal end of text stream — ElevenLabs will synthesize remaining text
   * and send the final audio chunks + isFinal marker.
   */
  flush(): void {
    if (!this.ws || !this.connected || this.closed) return;
    this.ws.send(JSON.stringify({ text: "", flush: true }));
  }

  /**
   * Close the WebSocket connection gracefully.
   */
  async close(): Promise<void> {
    this.closed = true;
    if (this.ws && this.ws.readyState === 1 /* OPEN */) {
      this.ws.close(1000, "Normal closure");
    }
    this.ws = null;
    this.connected = false;
  }

  get isConnected(): boolean {
    return this.connected;
  }
}

/**
 * Convenience function: Generate TTS audio for a complete text string.
 * Collects all audio chunks into a single Buffer.
 * Use for preview/testing — not for realtime streaming.
 *
 * @param text - Text to synthesize
 * @param voiceId - ElevenLabs voice ID
 * @param apiKey - ElevenLabs API key
 * @param options - TTS options
 * @returns Combined audio buffer
 */
export async function generateTTSAudio(
  text: string,
  voiceId: string,
  apiKey: string,
  options: TTSOptions = {}
): Promise<Buffer> {
  const tts = new ElevenLabsTTSStream(voiceId, apiKey, options);
  const chunks: Buffer[] = [];

  await tts.connect();

  return new Promise((resolve, reject) => {
    tts.on("audio", (chunk) => chunks.push(chunk));
    tts.on("done", () => {
      tts.close().catch(() => {});
      resolve(Buffer.concat(chunks));
    });
    tts.on("error", (err) => {
      tts.close().catch(() => {});
      reject(err);
    });

    tts.sendText(text);
    tts.flush();

    // Timeout guard
    setTimeout(() => {
      tts.close().catch(() => {});
      if (chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error("ElevenLabs TTS timeout (10s)"));
      }
    }, 10_000);
  });
}
