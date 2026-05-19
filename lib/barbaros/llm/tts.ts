// lib/barbaros/llm/tts.ts
const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";
export interface TTSOptions {
  text: string; voiceId?: string; modelId?: string;
  stability?: number; similarityBoost?: number; style?: number; useSpeakerBoost?: boolean;
}
export interface TTSResult { success: boolean; audioBuffer?: ArrayBuffer; error?: string; }
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
export async function textToSpeech(opts: TTSOptions): Promise<TTSResult> {
  try {
    const response = await fetch(`${ELEVENLABS_BASE_URL}/text-to-speech/${getVoiceId(opts.voiceId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": getApiKey(), Accept: "audio/mpeg" },
      body: JSON.stringify({ text: opts.text, model_id: opts.modelId ?? "eleven_multilingual_v2", voice_settings: { stability: opts.stability ?? 0.5, similarity_boost: opts.similarityBoost ?? 0.75, style: opts.style ?? 0.0, use_speaker_boost: opts.useSpeakerBoost ?? true } }),
    });
    if (!response.ok) return { success: false, error: `ElevenLabs API error ${response.status}` };
    return { success: true, audioBuffer: await response.arrayBuffer() };
  } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
}
export async function textToSpeechBase64(opts: TTSOptions): Promise<{ success: boolean; base64?: string; error?: string }> {
  const result = await textToSpeech(opts);
  if (!result.success || !result.audioBuffer) return { success: false, error: result.error };
  const bytes = new Uint8Array(result.audioBuffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return { success: true, base64: btoa(binary) };
}
export async function synthesizeSpeech(text: string): Promise<string | null> {
  if (!text || text.trim().length === 0) return null;
  const result = await textToSpeechBase64({ text });
  if (!result.success || !result.base64) { console.warn("[tts] synthesizeSpeech failed:", result.error); return null; }
  return result.base64;
}
