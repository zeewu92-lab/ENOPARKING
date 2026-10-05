let voicesPromise = null;

function getEnglishVoice() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve(null);
  }

  const synth = window.speechSynthesis;
  const pick = () => {
    const voices = synth.getVoices();
    return (
      voices.find(v => /^en-US$/i.test(v.lang)) ||
      voices.find(v => /^en-US/i.test(v.lang)) ||
      voices.find(v => /^en/i.test(v.lang)) ||
      null
    );
  };

  const immediate = pick();
  if (immediate) return Promise.resolve(immediate);

  if (!voicesPromise) {
    voicesPromise = new Promise(resolve => {
      const done = () => {
        synth.removeEventListener('voiceschanged', done);
        resolve(pick());
      };
      synth.addEventListener('voiceschanged', done);
      window.setTimeout(() => {
        synth.removeEventListener('voiceschanged', done);
        resolve(pick());
      }, 800);
    });
  }

  return voicesPromise;
}

export function isDanciSpeechActive() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking;
}

export async function speakDanci(word) {
  const text = String(word || '').trim();
  if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return false;
  }

  const synth = window.speechSynthesis;
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.82;
  utterance.pitch = 1;

  const voice = await getEnglishVoice();
  if (voice) utterance.voice = voice;

  synth.speak(utterance);
  return true;
}

export function tingzhiDanciSpeech() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
