import axios from 'axios';
import FormData from 'form-data';

const SARVAM_BASE = 'https://api.sarvam.ai';
const API_KEY = process.env.SARVAM_API_KEY || '';

// ── Speech-to-Text ───────────────────────────────────────────────────────────
export interface STTResult {
  transcript: string;
  language_code: string;
}

/**
 * Transcribe audio buffer using Sarvam AI speech-recognition API.
 * @param audioBuffer - raw audio bytes (webm/opus from MediaRecorder)
 * @param languageCode - BCP-47 language code e.g. 'en-IN', 'hi-IN'
 */
export const speechToText = async (
  audioBuffer: Buffer,
  languageCode: string = 'en-IN'
): Promise<STTResult> => {
  try {
    const form = new FormData();
    form.append('file', audioBuffer, {
      filename: 'audio.webm',
      contentType: 'audio/webm',
    });
    form.append('language_code', languageCode);
    form.append('model', 'saarika:v2.5');
    form.append('with_timestamps', 'false');

    const response = await axios.post(
      `${SARVAM_BASE}/speech-to-text`,
      form,
      {
        headers: {
          'api-subscription-key': API_KEY,
          ...form.getHeaders(),
        },
        timeout: 30000,
      }
    );

    return {
      transcript: response.data.transcript || '',
      language_code: response.data.language_code || languageCode,
    };
  } catch (error: unknown) {
    const errObj = error as { response?: { data?: unknown }; message?: string };
    console.error('Sarvam STT error details:', errObj?.response?.data || errObj?.message || error);
    throw new Error('Speech-to-text failed. Please try again.');
  }
};

// ── Text-to-Speech ───────────────────────────────────────────────────────────
export interface TTSResult {
  audioBase64: string; // base64-encoded WAV
  contentType: string;
}

const LANGUAGE_TO_VOICE: Record<string, string> = {
  'en-IN': 'anushka',
  'hi-IN': 'manisha',
  'bn-IN': 'anushka',
  'gu-IN': 'anushka',
  'kn-IN': 'anushka',
  'ml-IN': 'anushka',
  'mr-IN': 'manisha',
  'od-IN': 'anushka',
  'pa-IN': 'manisha',
  'ta-IN': 'anushka',
  'te-IN': 'anushka',
};

/**
 * Convert text to speech using Sarvam AI TTS API.
 * Returns base64-encoded audio that can be passed directly to the frontend.
 */
export const textToSpeech = async (
  text: string,
  languageCode: string = 'en-IN'
): Promise<TTSResult> => {
  try {
    const speaker = LANGUAGE_TO_VOICE[languageCode] || 'anushka';

    // Sarvam TTS has a 500-char limit per request — chunk if needed
    const chunks = chunkText(text, 490);
    const audioChunks: string[] = [];

    for (const chunk of chunks) {
      const response = await axios.post(
        `${SARVAM_BASE}/text-to-speech`,
        {
          inputs: [chunk],
          target_language_code: languageCode,
          speaker,
          model: 'bulbul:v1',
          enable_preprocessing: true,
          speech_sample_rate: 22050,
        },
        {
          headers: {
            'api-subscription-key': API_KEY,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      const audios: string[] = response.data.audios || [];
      audioChunks.push(...audios);
    }

    return {
      audioBase64: audioChunks[0] || '',
      contentType: 'audio/wav',
    };
  } catch (error: unknown) {
    const errObj = error as { response?: { data?: unknown }; message?: string };
    console.error('Sarvam TTS error details:', errObj?.response?.data || errObj?.message || error);
    throw new Error('Text-to-speech failed.');
  }
};

// ── Helper ───────────────────────────────────────────────────────────────────
function chunkText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  let current = '';
  for (const s of sentences) {
    if ((current + s).length > maxLen) {
      if (current) chunks.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
