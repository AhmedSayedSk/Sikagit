let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

/** Short rising chime — success */
export function playSuccess() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'sine';
  osc.frequency.setValueAtTime(523, now);       // C5
  osc.frequency.setValueAtTime(659, now + 0.1); // E5
  osc.frequency.setValueAtTime(784, now + 0.2); // G5

  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

  osc.start(now);
  osc.stop(now + 0.4);
}

/** Short descending tone — error */
export function playError() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'sine';
  osc.frequency.setValueAtTime(440, now);       // A4
  osc.frequency.setValueAtTime(330, now + 0.15); // E4

  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

  osc.start(now);
  osc.stop(now + 0.35);
}
