export async function speakWithBrowserVoice(text: string, rate = 0.92): Promise<boolean> {
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
    utterance.rate = rate;
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

export async function playAudioWithFallback(audioUrl: string | null | undefined, fallbackText: string, rate = 1.0): Promise<boolean> {
  if (audioUrl) {
    try {
      const audio = new Audio(audioUrl);
      audio.playbackRate = rate;
      await audio.play();
      return true;
    } catch {
      return speakWithBrowserVoice(fallbackText, rate);
    }
  }

  return speakWithBrowserVoice(fallbackText, rate);
}
