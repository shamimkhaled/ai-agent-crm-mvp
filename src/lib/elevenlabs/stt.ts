/**
 * ElevenLabs Speech-to-Text — Scribe WebSocket streaming client.
 *
 * Streams PCM audio to ElevenLabs Scribe and emits transcript events.
 * Handles connection lifecycle, keepalive, and automatic reconnection.
 *
 * API endpoint: wss://api.elevenlabs.io/v1/speech-to-text/stream
 * Docs: https://elevenlabs.io/docs/api-reference/speech-to-text/websockets
 */

import EventEmitter from "events";

export interface STTOptions {
  model?: string;
  language?: string;        // BCP-47: "en", "bn", "ar", etc.
  diarize?: boolean;        // Speaker diarization (slower)
  tagAudioEvents?: boolean; // Tag non-speech audio events
  inactivityTimeout?: number; // Seconds before WS closes on silence
}

export interface TranscriptEvent {
  type: "transcript";
  text: string;
  isFinal: boolean;
  confidence?: number;
  words?: Array<{
    word: string;
    start: number;
    end: number;
    confidence: number;
  }>;
}

const ELEVENLABS_STT_URL = "wss://api.elevenlabs.io/v1/speech-to-text/stream";

/**
 * ElevenLabs STT WebSocket streaming client.
 *
 * Usage:
 * ```ts
 * const stt = new ElevenLabsSTTStream(apiKey, { language: "en" });
 * await stt.connect();
 * stt.on("transcript", (text, isFinal) => {
 *   if (isFinal) handleUtterance(text);
 * });
 * // Feed PCM 16kHz audio:
 * stt.sendAudio(pcm16kBuffer);
 * ```
 */
export class ElevenLabsSTTStream extends EventEmitter {
  private ws: import("ws").WebSocket | null = null;
  private apiKey: string;
  private options: Required<STTOptions>;
  private connected = false;
  private closed = false;
  private audioQueue: Buffer[] = [];
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(apiKey: string, options: STTOptions = {}) {
    super();
    this.apiKey = apiKey;
    this.options = {
      model: options.model ?? "scribe_v1",
      language: options.language ?? "en",
      diarize: options.diarize ?? false,
      tagAudioEvents: options.tagAudioEvents ?? false,
      inactivityTimeout: options.inactivityTimeout ?? 30,
    };
  }

  /**
   * Connect to ElevenLabs STT WebSocket.
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    const { WebSocket } = await import("ws");

    const url = new URL(ELEVENLABS_STT_URL);
    url.searchParams.set("xi-api-key", this.apiKey);

    this.ws = new WebSocket(url.toString());

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("ElevenLabs STT WebSocket connection timeout (5s)"));
        this.ws?.close();
      }, 5000);

      this.ws!.on("open", () => {
        clearTimeout(timeout);
        this.connected = true;

        // Send initial configuration
        this.ws!.send(
          JSON.stringify({
            model_id: this.options.model,
            language_code: this.options.language,
            diarize: this.options.diarize,
            tag_audio_events: this.options.tagAudioEvents,
            inactivity_timeout: this.options.inactivityTimeout,
          })
        );

        // Start keepalive ping every 25 seconds
        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === 1 /* OPEN */) {
            this.ws.ping();
          }
        }, 25_000);

        // Flush queued audio
        for (const chunk of this.audioQueue) {
          this.ws!.send(chunk);
        }
        this.audioQueue = [];

        resolve();
      });

      this.ws!.on("message", (data: Buffer | string) => {
        this.handleMessage(data);
      });

      this.ws!.on("pong", () => {
        // Connection is alive
      });

      this.ws!.on("error", (err) => {
        clearTimeout(timeout);
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.emit("error", err);
        if (!this.connected) reject(err);
      });

      this.ws!.on("close", (code, reason) => {
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.connected = false;

        if (code !== 1000 && !this.closed) {
          this.emit(
            "error",
            new Error(`ElevenLabs STT WebSocket closed [${code}]: ${reason}`)
          );
        }
      });
    });
  }

  private handleMessage(data: Buffer | string): void {
    try {
      const event = JSON.parse(
        Buffer.isBuffer(data) ? data.toString("utf8") : data
      ) as {
        type?: string;
        text?: string;
        is_final?: boolean;
        confidence?: number;
        words?: TranscriptEvent["words"];
        error?: string;
        message?: string;
      };

      if (event.error || event.type === "error") {
        this.emit(
          "error",
          new Error(`ElevenLabs STT error: ${event.message ?? event.error}`)
        );
        return;
      }

      if (event.type === "transcript" && event.text !== undefined) {
        this.emit("transcript", event.text, event.is_final ?? false, {
          confidence: event.confidence,
          words: event.words,
        });
      }
    } catch {
      // Ignore non-JSON messages
    }
  }

  /**
   * Send PCM audio data to ElevenLabs STT.
   * Audio must be: PCM signed 16-bit little-endian at 16kHz, mono.
   *
   * @param pcm16k - PCM audio buffer (see audio.ts mulawToPcm16k)
   */
  sendAudio(pcm16k: Buffer): void {
    if (!this.connected || !this.ws) {
      this.audioQueue.push(pcm16k);
      return;
    }

    if (this.ws.readyState === 1 /* OPEN */) {
      this.ws.send(pcm16k);
    }
  }

  /**
   * Close the WebSocket connection gracefully.
   */
  async close(): Promise<void> {
    this.closed = true;
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
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

// Typed event signatures (merged with class — must also be exported)
export interface ElevenLabsSTTStream {
  on(
    event: "transcript",
    listener: (
      text: string,
      isFinal: boolean,
      meta: { confidence?: number; words?: TranscriptEvent["words"] }
    ) => void
  ): this;
  on(event: "error", listener: (err: Error) => void): this;
  emit(
    event: "transcript",
    text: string,
    isFinal: boolean,
    meta: { confidence?: number; words?: TranscriptEvent["words"] }
  ): boolean;
  emit(event: "error", err: Error): boolean;
}
