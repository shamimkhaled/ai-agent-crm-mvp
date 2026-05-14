/**
 * Audio conversion utilities for ElevenLabs ↔ Twilio compatibility.
 *
 * Twilio Media Streams transmit μ-law encoded audio at 8kHz.
 * ElevenLabs STT expects PCM signed 16-bit little-endian at 16kHz.
 * ElevenLabs TTS can output μ-law 8kHz directly (output_format=ulaw_8000).
 */

// ============================================================
// G.711 μ-law decode table (256 entries)
// Pre-computed for maximum throughput on hot audio path
// ============================================================
const MULAW_DECODE_TABLE: Int16Array = (() => {
  const table = new Int16Array(256);
  for (let i = 0; i < 256; i++) {
    let ulaw = ~i;
    const sign = ulaw & 0x80;
    const exponent = (ulaw >> 4) & 0x07;
    const mantissa = ulaw & 0x0f;
    let sample = ((mantissa << 3) + 0x84) << exponent;
    sample -= 0x84;
    table[i] = sign !== 0 ? -sample : sample;
  }
  return table;
})();

// G.711 μ-law encode table (65536 entries for full int16 range)
const MULAW_ENCODE_TABLE: Uint8Array = (() => {
  const table = new Uint8Array(65536);
  const MU = 255;
  for (let i = -32768; i <= 32767; i++) {
    const idx = i < 0 ? i + 65536 : i;
    const sign = i < 0 ? 0x80 : 0;
    const abs = Math.min(Math.abs(i), 32635);
    const encoded = Math.round(
      (Math.log(1 + (MU * abs) / 32768) / Math.log(1 + MU)) * 127
    );
    table[idx] = (sign | encoded) ^ 0xff;
  }
  return table;
})();

/**
 * Convert μ-law 8kHz buffer to PCM signed 16-bit 16kHz.
 * Upsampling: simple linear interpolation (1 input → 2 outputs).
 *
 * @param mulaw - Raw μ-law bytes from Twilio Media Streams
 * @returns PCM s16le 16kHz buffer for ElevenLabs STT
 */
export function mulawToPcm16k(mulaw: Buffer): Buffer {
  const len = mulaw.length;
  // Each μ-law sample becomes 2 PCM samples (8kHz → 16kHz)
  const out = Buffer.alloc(len * 4); // len samples × 2 (upsample) × 2 bytes

  for (let i = 0; i < len; i++) {
    const curr = MULAW_DECODE_TABLE[mulaw[i]];
    const next = i + 1 < len ? MULAW_DECODE_TABLE[mulaw[i + 1]] : curr;
    const interpolated = Math.round((curr + next) / 2);

    out.writeInt16LE(curr, i * 4);
    out.writeInt16LE(interpolated, i * 4 + 2);
  }

  return out;
}

/**
 * Convert PCM signed 16-bit 8kHz buffer to μ-law 8kHz.
 * Used when ElevenLabs TTS does not support ulaw_8000 output natively.
 *
 * @param pcm - PCM s16le 8kHz buffer
 * @returns μ-law buffer ready for Twilio Media Streams
 */
export function pcm16ToMulaw(pcm: Buffer): Buffer {
  const numSamples = pcm.length / 2;
  const out = Buffer.alloc(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const sample = pcm.readInt16LE(i * 2);
    const idx = sample < 0 ? sample + 65536 : sample;
    out[i] = MULAW_ENCODE_TABLE[idx];
  }

  return out;
}

/**
 * Downsample PCM 16kHz to 8kHz by averaging pairs of samples.
 * Use when bridging ElevenLabs STT output back to Twilio.
 *
 * @param pcm16k - PCM s16le 16kHz buffer
 * @returns PCM s16le 8kHz buffer
 */
export function downsample16kTo8k(pcm16k: Buffer): Buffer {
  const numSamples = pcm16k.length / 2;
  const outSamples = Math.floor(numSamples / 2);
  const out = Buffer.alloc(outSamples * 2);

  for (let i = 0; i < outSamples; i++) {
    const s1 = pcm16k.readInt16LE(i * 4);
    const s2 = pcm16k.readInt16LE(i * 4 + 2);
    out.writeInt16LE(Math.round((s1 + s2) / 2), i * 2);
  }

  return out;
}

/**
 * Convert Float32Array (Web Audio API output) to Int16 PCM.
 * Used in the browser-based testing console for microphone input.
 *
 * @param input - Float32Array from AudioWorklet/ScriptProcessor
 * @returns Int16Array (PCM s16le)
 */
export function float32ToInt16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const clamped = Math.max(-1, Math.min(1, input[i]));
    output[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return output;
}

/**
 * Encode a PCM audio buffer as base64 for Twilio Media Streams JSON payload.
 *
 * @param buffer - Audio bytes (μ-law)
 * @returns base64 string
 */
export function bufferToBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

/**
 * Validate that an audio buffer has reasonable content (not silence).
 * Used to skip sending silent packets to STT.
 *
 * @param mulaw - μ-law audio buffer
 * @param threshold - RMS threshold below which buffer is considered silent
 */
export function isSilence(mulaw: Buffer, threshold = 200): boolean {
  let sumSq = 0;
  for (let i = 0; i < mulaw.length; i++) {
    const pcm = MULAW_DECODE_TABLE[mulaw[i]];
    sumSq += pcm * pcm;
  }
  const rms = Math.sqrt(sumSq / mulaw.length);
  return rms < threshold;
}
