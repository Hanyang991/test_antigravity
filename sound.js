let audioContext = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioContext) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioContext = new Ctor();
  }
  return audioContext;
}

export async function primeAudio() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      // Ignore gesture timing failures.
    }
  }
}

export function playDrawStart(mode = 'rune') {
  const ctx = getAudioContext();
  if (!ctx) return;
  playTone({
    ctx,
    frequency: mode === 'bone' ? 210 : 420,
    duration: 0.04,
    type: mode === 'bone' ? 'triangle' : 'sine',
    gain: 0.018,
    attack: 0.002,
    release: 0.03,
  });
}

export function playStrokeCommit(mode = 'rune', assistMode = 'free') {
  const ctx = getAudioContext();
  if (!ctx) return;
  const harmonic = assistMode === 'compass' ? 1.4 : assistMode === 'ruler' ? 1.15 : 1;
  playTone({
    ctx,
    frequency: (mode === 'bone' ? 250 : 520) * harmonic,
    duration: 0.08,
    type: mode === 'bone' ? 'triangle' : 'sawtooth',
    gain: 0.024,
    attack: 0.003,
    release: 0.06,
  });
}

export function playCast(result = 'neutral') {
  const ctx = getAudioContext();
  if (!ctx) return;
  const profile = {
    success: { a: 440, b: 660, g: 0.04, noise: false },
    wrong: { a: 180, b: 130, g: 0.05, noise: true },
    neutral: { a: 260, b: 520, g: 0.035, noise: false },
    overload: { a: 110, b: 70, g: 0.06, noise: true },
  }[result] || { a: 260, b: 520, g: 0.035, noise: false };

  playTone({
    ctx,
    frequency: profile.a,
    duration: 0.16,
    type: result === 'wrong' || result === 'overload' ? 'square' : 'sine',
    gain: profile.g,
    attack: 0.004,
    release: 0.12,
    sweepTo: profile.b,
  });

  if (profile.noise) {
    playNoise({
      ctx,
      duration: result === 'overload' ? 0.28 : 0.12,
      gain: result === 'overload' ? 0.018 : 0.012,
    });
  }
}

export function playRiftControl(action = 'start') {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (action === 'start') {
    playTone({ ctx, frequency: 280, sweepTo: 560, duration: 0.22, type: 'triangle', gain: 0.035, attack: 0.01, release: 0.18 });
    return;
  }
  playTone({ ctx, frequency: 420, sweepTo: 160, duration: 0.18, type: 'sine', gain: 0.03, attack: 0.005, release: 0.15 });
}

function playTone({
  ctx,
  frequency = 440,
  sweepTo = null,
  duration = 0.1,
  type = 'sine',
  gain = 0.03,
  attack = 0.005,
  release = 0.08,
}) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);
  if (sweepTo) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), now + duration);
  }

  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.linearRampToValueAtTime(gain, now + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(attack + 0.01, duration + release));

  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + release + 0.02);
}

function playNoise({ ctx, duration = 0.12, gain = 0.01 }) {
  const sampleRate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(sampleRate * duration)), sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }

  const source = ctx.createBufferSource();
  const amp = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 800;
  filter.Q.value = 0.6;

  const now = ctx.currentTime;
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.linearRampToValueAtTime(gain, now + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  source.buffer = buffer;
  source.connect(filter);
  filter.connect(amp);
  amp.connect(ctx.destination);
  source.start(now);
  source.stop(now + duration + 0.02);
}
