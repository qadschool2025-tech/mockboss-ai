// lib/barbaros/llm/tts.ts
// ElevenLabs TTS wrapper for Barbaros.
//
// Exports:
//   - textToSpeech       — returns raw ArrayBuffer (low-level)
//   - textToSpeechBase64 — returns { success, base64, error } (used by API routes)
//   - synthesizeSpeech   — returns base64 string or null (used by engine.ts)

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TTSOptions {
  text: string;
  voiceId?: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
}

export interface TTSResult {
  success: boolean;
  audioBuffer?: ArrayBuffer;
  error?: string;
}

interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
}

interface ElevenLabsRequestBody {
  text: string;
  model_id: string;
  voice_settings: VoiceSettings;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
  return key;
}

function getVoiceId(override?: string): string {
  const id = override ?? process.env.ELEVENLABS_VOICE_ID;
  if (!id) throw new Error("ELEVENLABS_VOICE_ID is not set");
  return id;
}

function buildRequestBody(opts: TTSOptions): ElevenLabsRequestBody {
  return {
    text: opts.text,
    model_id: opts.modelId ?? "eleven_multilingual_v2",
    voice_settings: {
      stability: opts.stability ?? 0.5,
      similarity_boost: opts.similarityBoost ?? 0.75,
      style: opts.style ?? 0.0,
      use_speaker_boost: opts.useSpeakerBoost ?? true,
    },
  };
}

// ─── Low-level: ArrayBuffer ───────────────────────────────────────────────────

export async function textToSpeech(opts: TTSOptions): Promise<TTSResult> {
  try {
    const apiKey = getApiKey();
    const voiceId = getVoiceId(opts.voiceId);
    const body = buildRequestBody(opts);

    const response = await fetch(
      `${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
          Accept: "audio/mpeg",
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => "unknown error");
      return {
        success: false,
        error: `ElevenLabs API error ${response.status}: ${errText}`,
      };
    }

    const audioBuffer = await response.arrayBuffer();
    return { success: true, audioBuffer };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

// ─── Mid-level: { success, base64, error } ────────────────────────────────────

export async function textToSpeechBase64(opts: TTSOptions): Promise<{
  success: boolean;
  base64?: string;
  error?: string;
}> {
  const result = await textToSpeech(opts);
  if (!result.success || !result.audioBuffer) {
    return { success: false, error: result.error };
  }
  const bytes = new Uint8Array(result.audioBuffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return { success: true, base64 };
}

// ─── High-level: simple string-or-null (used by engine.ts) ────────────────────
// engine.ts expects: `await synthesizeSpeech(text)` → string | null

export async function synthesizeSpeech(text: string): Promise<string | null> {
  if (!text || text.trim().length === 0) return null;

  const result = await textToSpeechBase64({ text });
  if (!result.success || !result.base64) {
    console.warn("[tts] synthesizeSpeech failed:", result.error);
    return null;
  }
  return result.base64;
}
