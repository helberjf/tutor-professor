export async function speakWithBrowserVoice(text: string): Promise<boolean> {
  if (typeof window === 'undefined' || !text.trim()) {
    return false;
  }

  const synthesis = window.speechSynthesis;
  if (!synthesis) {
    return false;
  }

  synthesis.cancel();

  return new Promise<boolean>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.92;
    utterance.pitch = 1;

    const voices = synthesis.getVoices();
    const englishVoice = voices.find((voice) => voice.lang.toLowerCase().startsWith('en'));
    if (englishVoice) {
      utterance.voice = englishVoice;
    }

    utterance.onend = () => resolve(true);
    utterance.onerror = () => resolve(false);
    synthesis.speak(utterance);
  });
}

export async function playAudioWithFallback(audioUrl: string | null | undefined, fallbackText: string): Promise<boolean> {
  if (audioUrl) {
    try {
      const audio = new Audio(audioUrl);
      await audio.play();
      return true;
    } catch {
      return speakWithBrowserVoice(fallbackText);
    }
  }

  return speakWithBrowserVoice(fallbackText);
}
