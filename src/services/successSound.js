let successAudios = null;
let lastPlayedAt = 0;
let keyAudioContext = null;
let keyMasterGain = null;
let lastKeyPlayedAt = 0;

function createWavUrl(duration, sampleFn, sampleRate = 44100) {
  const frameCount = Math.max(1, Math.floor(duration * sampleRate));
  const buffer = new ArrayBuffer(44 + frameCount * 2);
  const view = new DataView(buffer);

  const writeString = (offset, value) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + frameCount * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, frameCount * 2, true);

  for (let i = 0; i < frameCount; i += 1) {
    const t = i / sampleRate;
    const sample = Math.max(-1, Math.min(1, sampleFn(t)));
    view.setInt16(44 + i * 2, sample * 0x7fff, true);
  }

  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

function buildSuccessWavUrl(segment) {
  const segments = [
    [
      [523.25, 0.19],
      [659.25, 0.19],
      [783.99, 0.19]
    ],
    [
      [1046.5, 0.24],
      [783.99, 0.26]
    ]
  ];

  const notes = segments[segment];
  const duration = notes.reduce((total, [, length]) => total + length, 0);

  return createWavUrl(duration, (t) => {
    let noteStart = 0;
    let frequency = 0;
    let noteLength = 0;

    for (const [freq, length] of notes) {
      if (t < noteStart + length) {
        frequency = freq;
        noteLength = length;
        break;
      }
      noteStart += length;
    }

    if (!frequency) return 0;

    const localTime = t - noteStart;
    const attack = Math.min(1, localTime / 0.01);
    const release = Math.min(1, Math.max(0, (noteLength - localTime) / 0.045));
    const envelope = attack * release;
    const shimmer = 0.12 * Math.sin(2 * Math.PI * frequency * 2 * localTime);
    const tone = Math.sin(2 * Math.PI * frequency * localTime) + shimmer;

    return tone * 0.22 * envelope;
  });
}

function getSuccessAudios() {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;

  if (!successAudios) {
    successAudios = [0, 1].map((segment) => {
      const audio = new Audio(buildSuccessWavUrl(segment));
      audio.preload = 'auto';
      audio.volume = 0.55;
      return audio;
    });
  }

  return successAudios;
}

function huoquKeyYinpinContext() {
  if (typeof window === 'undefined') return null;
  if (!keyAudioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    keyAudioContext = new AudioContextClass();
    keyMasterGain = keyAudioContext.createGain();
    keyMasterGain.gain.value = 0.035;
    keyMasterGain.connect(keyAudioContext.destination);
  }
  if (keyAudioContext.state === 'suspended') {
    keyAudioContext.resume().catch(() => {});
  }
  return keyAudioContext;
}

export function playPhysicalKeyShengyin() {
  const now = performance.now();
  if (now - lastKeyPlayedAt < 18) return;
  lastKeyPlayedAt = now;

  const ctx = huoquKeyYinpinContext();
  if (!ctx || !keyMasterGain) return;

  const startAt = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(1850, startAt);
  osc.frequency.exponentialRampToValueAtTime(1150, startAt + 0.018);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.9, startAt + 0.0015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.026);

  osc.connect(gain);
  gain.connect(keyMasterGain);
  osc.start(startAt);
  osc.stop(startAt + 0.03);
}

export function playDanciChenggongShengyin() {
  const now = Date.now();
  if (now - lastPlayedAt < 160) return;
  lastPlayedAt = now;

  const audios = getSuccessAudios();
  if (!audios?.length) return;

  const audio = audios[Math.floor(Math.random() * audios.length)];

  try {
    audios.forEach((item) => {
      if (item !== audio) {
        item.pause();
        item.currentTime = 0;
      }
    });

    audio.pause();
    audio.currentTime = 0;
    const result = audio.play();
    if (result?.catch) result.catch(() => {});
  } catch {
    // 浏览器拒绝音讯播放时静默处理。
  }
}

function buildFailureWavUrl() {
  const duration = 0.42;

  return createWavUrl(duration, (t) => {
    const progress = t / duration;
    const attack = Math.min(1, t / 0.012);
    const release = Math.pow(Math.max(0, 1 - progress), 2.4);
    const envelope = attack * release;
    const phase = t;

    const tone =
      Math.sin(2 * Math.PI * 220 * phase) +
      0.16 * Math.sin(2 * Math.PI * 440 * phase);

    return Math.max(-0.92, Math.min(0.92, tone * 0.18 * envelope));
  });
}

let failureAudio = null;

function getFailureAudio() {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;

  if (!failureAudio) {
    failureAudio = new Audio(buildFailureWavUrl());
    failureAudio.preload = 'auto';
    failureAudio.volume = 0.45;
  }

  return failureAudio;
}

export function playDanciShibaiShengyin() {
  const audio = getFailureAudio();
  if (!audio) return;

  try {
    audio.pause();
    audio.currentTime = 0;
    const result = audio.play();
    if (result?.catch) result.catch(() => {});
  } catch {
    // 浏览器拒绝音讯播放时静默处理。
  }
}
