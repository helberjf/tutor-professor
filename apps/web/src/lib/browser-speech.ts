// Chrome silently stops an utterance after about 15 seconds, which cut a lesson
// paragraph short. Reading it as a queue of short sentence groups avoids that.
const MAX_CHUNK_LENGTH = 220;

// Bumped by every new reading and by stopBrowserSpeech, so a queue that was
// replaced or stopped does not go on to its next chunk.
let activeReading = 0;

type ChunkOutcome = 'done' | 'stopped' | 'failed';

export function splitSpeechIntoChunks(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const sentences = normalized.match(/\S.*?(?:[.!?]+(?=\s)|$)/g) ?? [];
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && current.length + sentence.length + 1 > MAX_CHUNK_LENGTH) {
      chunks.push(current);
      current = '';
    }
    current = current ? `${current} ${sentence}` : sentence;
  }
  if (current) chunks.push(current);
  return chunks;
}

function speakChunk(
  synthesis: SpeechSynthesis,
  text: string,
  lang: string,
  rate: number,
  voice: SpeechSynthesisVoice | undefined,
): Promise<ChunkOutcome> {
  return new Promise<ChunkOutcome>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = rate;
    utterance.pitch = 1;
    if (voice) utterance.voice = voice;

    utterance.onend = () => resolve('done');
    // Stopping or replacing the reading cancels the engine, which reports
    // `interrupted`/`canceled`. That is the reader's choice, not a failure.
    utterance.onerror = (event) => {
      resolve(event.error === 'interrupted' || event.error === 'canceled' ? 'stopped' : 'failed');
    };
    synthesis.speak(utterance);
  });
}

export function stopBrowserSpeech() {
  activeReading += 1;
  if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
}

export async function speakWithBrowserVoice(text: string, rate = 0.92, lang = 'en-US'): Promise<boolean> {
  if (typeof window === 'undefined' || !text.trim()) {
    return false;
  }

  const synthesis = window.speechSynthesis;
  if (!synthesis) {
    return false;
  }

  const reading = ++activeReading;
  synthesis.cancel();
  // A tab backgrounded mid-speech can leave the engine paused, and a paused
  // engine queues the new utterance without ever playing it.
  if (synthesis.paused) synthesis.resume();

  const requestedPrefix = lang.split('-')[0].toLowerCase();
  const voice = synthesis.getVoices().find((item) => item.lang.toLowerCase().startsWith(requestedPrefix));

  for (const chunk of splitSpeechIntoChunks(text)) {
    if (reading !== activeReading) return true;
    const outcome = await speakChunk(synthesis, chunk, lang, rate, voice);
    if (outcome === 'stopped') return true;
    if (outcome === 'failed') return false;
  }
  return true;
}

export async function playAudioWithFallback(
  audioUrl: string | null | undefined,
  fallbackText: string,
  rate = 1.0,
  lang?: string | null,
): Promise<boolean> {
  if (audioUrl) {
    try {
      const audio = new Audio(audioUrl);
      audio.playbackRate = rate;
      await audio.play();
      return true;
    } catch {
      return speakWithBrowserVoice(fallbackText, rate, lang || undefined);
    }
  }

  return speakWithBrowserVoice(fallbackText, rate, lang || undefined);
}
