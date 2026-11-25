import { midiToFreq } from "./musicTheory";

export interface DemoStemData {
  id: string;
  name: string;
  role: "vocal" | "harmony" | "instrument" | "bass" | "drums";
  color: string;
  channels: Float32Array[];
  sampleRate: number;
}

type Vowel = "a" | "e" | "i" | "o" | "u";

const FORMANT_TABLE: Record<Vowel, [number, number, number]> = {
  a: [720, 1140, 2480],
  e: [510, 1820, 2520],
  i: [310, 2180, 2940],
  o: [520, 880, 2400],
  u: [330, 890, 2250],
};

interface VocalNoteSpec {
  startBeat: number;
  durBeat: number;
  midi: number;
  vowel: Vowel;
  detuneCents: number; // deliberate realistic singing imperfection
  scoopCents?: number; // initial scoop
  vibratoDepth?: number; // semitones
}

function makeBandpassState() {
  return { x1: 0, x2: 0, y1: 0, y2: 0 };
}

function runBandpass(
  state: { x1: number; x2: number; y1: number; y2: number },
  x: number,
  freq: number,
  q: number,
  sr: number,
): number {
  const w0 = (2 * Math.PI * Math.min(sr * 0.42, freq)) / sr;
  const sin = Math.sin(w0);
  const cos = Math.cos(w0);
  const alpha = sin / (2 * q);
  const b0 = alpha;
  const b1 = 0;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;

  const y =
    (b0 * x + b1 * state.x1 + b2 * state.x2 - a1 * state.y1 - a2 * state.y2) /
    a0;
  state.x2 = state.x1;
  state.x1 = x;
  state.y2 = state.y1;
  state.y1 = y;
  return y;
}

function synthesizeVocalLine(
  notes: VocalNoteSpec[],
  bpm: number,
  totalSec: number,
  sr: number,
  stereoSpread = 0,
): Float32Array[] {
  const len = Math.round(totalSec * sr);
  const outL = new Float32Array(len);
  const outR = new Float32Array(len);
  const beatSec = 60 / bpm;

  // Pseudo-random breath noise generator
  let seed = 4219;
  const nextNoise = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed / 4294967296) * 2 - 1;
  };

  for (const note of notes) {
    const startIdx = Math.max(0, Math.round(note.startBeat * beatSec * sr));
    const endIdx = Math.min(len, Math.round((note.startBeat + note.durBeat) * beatSec * sr));
    const noteLen = endIdx - startIdx;
    if (noteLen <= 10) continue;

    const [f1, f2, f3] = FORMANT_TABLE[note.vowel];
    const bp1 = makeBandpassState();
    const bp2 = makeBandpassState();
    const bp3 = makeBandpassState();

    const vibDepth = note.vibratoDepth ?? 0.32;
    const scoopCents = note.scoopCents ?? -45;
    let phase = 0;
    let prevBreath = 0;

    for (let i = 0; i < noteLen; i++) {
      const tLocal = i / sr;
      const dur = noteLen / sr;

      // Smooth envelope (soft vocal onset & release)
      const attack = Math.min(1, tLocal / 0.038);
      const release = Math.min(1, (dur - tLocal) / 0.055);
      const env = Math.pow(attack, 0.8) * Math.pow(Math.max(0, release), 1.2);

      // Pitch contour: initial scoop + human pitch drift + delayed natural vibrato
      const scoop = scoopCents * Math.exp(-tLocal / 0.055);
      const vibDelay = Math.max(0, Math.min(1, (tLocal - 0.14) / 0.18));
      const vibrato = Math.sin(2 * Math.PI * 5.4 * tLocal) * vibDepth * vibDelay;
      const drift =
        Math.sin(2 * Math.PI * 0.9 * tLocal + note.startBeat) * 0.08;

      const curMidi =
        note.midi + (note.detuneCents + scoop) / 100 + vibrato + drift;
      const freq = midiToFreq(curMidi);

      phase += freq / sr;
      if (phase >= 1) phase -= 1;

      // Rosenberg-like glottal pulse (warm, rich harmonics without harsh digital buzz)
      const Tp = 0.42;
      const Tn = 0.16;
      let glottal = 0;
      if (phase < Tp) {
        glottal = 0.5 * (1 - Math.cos((Math.PI * phase) / Tp));
      } else if (phase < Tp + Tn) {
        glottal = Math.cos((Math.PI * (phase - Tp)) / (2 * Tn));
      }
      glottal = glottal * 2 - 0.55;

      // Subtle consonant / breath air at note attack
      const breathEnv = Math.exp(-tLocal / 0.025) * 0.24;
      const rawNoise = nextNoise();
      const hpNoise = rawNoise - prevBreath * 0.82;
      prevBreath = rawNoise;

      const v1 = runBandpass(bp1, glottal, f1, 6.5, sr) * 1.65;
      const v2 = runBandpass(bp2, glottal, f2, 9.0, sr) * 0.92;
      const v3 = runBandpass(bp3, glottal, f3, 12.0, sr) * 0.42;

      const sample = (v1 + v2 + v3 + glottal * 0.12 + hpNoise * breathEnv) * env * 0.52;
      if (stereoSpread === 0) {
        outL[startIdx + i] += sample;
        outR[startIdx + i] += sample;
      } else {
        // Gentle Haas/panning spread for backing harmonies
        outL[startIdx + i] += sample * (1 - stereoSpread * 0.25);
        outR[Math.max(0, startIdx + i - Math.round(sr * 0.008))] +=
          sample * (1 + stereoSpread * 0.25);
      }
    }
  }

  return stereoSpread === 0 ? [outL] : [outL, outR];
}

function synthesizeElectricPiano(
  chords: Array<{ startBeat: number; durBeat: number; notes: number[] }>,
  bpm: number,
  totalSec: number,
  sr: number,
): Float32Array[] {
  const len = Math.round(totalSec * sr);
  const outL = new Float32Array(len);
  const outR = new Float32Array(len);
  const beatSec = 60 / bpm;

  for (const ch of chords) {
    const startIdx = Math.max(0, Math.round(ch.startBeat * beatSec * sr));
    const endIdx = Math.min(len, Math.round((ch.startBeat + ch.durBeat) * beatSec * sr));
    const nLen = endIdx - startIdx;
    if (nLen <= 0) continue;

    for (let ni = 0; ni < ch.notes.length; ni++) {
      const midi = ch.notes[ni];
      const f = midiToFreq(midi);
      const pan = (ni / Math.max(1, ch.notes.length - 1) - 0.5) * 0.65;
      const gL = Math.cos(((pan + 1) * Math.PI) / 4);
      const gR = Math.sin(((pan + 1) * Math.PI) / 4);

      for (let i = 0; i < nLen; i++) {
        const t = i / sr;
        const dur = nLen / sr;
        const attack = Math.min(1, t / 0.008);
        const decay = Math.exp(-t / 1.45);
        const rel = Math.min(1, (dur - t) / 0.06);
        const env = attack * decay * Math.max(0, rel);

        // Rhodes FM tine + warm fundamental
        const tineEnv = Math.exp(-t / 0.14);
        const mod = Math.sin(2 * Math.PI * f * 7 * t) * 0.45 * tineEnv;
        const tone =
          Math.sin(2 * Math.PI * f * t + mod) * 0.72 +
          Math.sin(2 * Math.PI * f * 2 * t) * 0.18 * Math.exp(-t / 0.7);

        const s = tone * env * 0.19;
        outL[startIdx + i] += s * gL;
        outR[startIdx + i] += s * gR;
      }
    }
  }

  return [outL, outR];
}

function synthesizeBass(
  notes: Array<{ startBeat: number; durBeat: number; midi: number }>,
  bpm: number,
  totalSec: number,
  sr: number,
): Float32Array[] {
  const len = Math.round(totalSec * sr);
  const out = new Float32Array(len);
  const beatSec = 60 / bpm;

  for (const n of notes) {
    const startIdx = Math.max(0, Math.round(n.startBeat * beatSec * sr));
    const endIdx = Math.min(len, Math.round((n.startBeat + n.durBeat) * beatSec * sr));
    const nLen = endIdx - startIdx;
    if (nLen <= 0) continue;

    const f = midiToFreq(n.midi);
    let lp = 0;
    for (let i = 0; i < nLen; i++) {
      const t = i / sr;
      const dur = nLen / sr;
      const attack = Math.min(1, t / 0.01);
      const decay = 0.65 + 0.35 * Math.exp(-t / 0.35);
      const rel = Math.min(1, (dur - t) / 0.035);
      const env = attack * decay * Math.max(0, rel);

      const p1 = (f * t) % 1;
      const saw = p1 * 2 - 1;
      const sub = Math.sin(2 * Math.PI * f * t);
      const raw = sub * 0.65 + saw * 0.35;

      // Plucky lowpass sweep
      const cutoff = 280 + 750 * Math.exp(-t / 0.14);
      const rc = 1 / (2 * Math.PI * cutoff);
      const dt = 1 / sr;
      const alpha = dt / (rc + dt);
      lp += alpha * (raw - lp);

      out[startIdx + i] += lp * env * 0.48;
    }
  }

  return [out];
}

function synthesizeDrums(
  totalBeats: number,
  bpm: number,
  totalSec: number,
  sr: number,
): Float32Array[] {
  const len = Math.round(totalSec * sr);
  const outL = new Float32Array(len);
  const outR = new Float32Array(len);
  const beatSec = 60 / bpm;

  let seed = 918273;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed / 4294967296) * 2 - 1;
  };

  const addKick = (beat: number) => {
    const start = Math.round(beat * beatSec * sr);
    const durSamples = Math.round(0.28 * sr);
    let phase = 0;
    for (let i = 0; i < durSamples && start + i < len; i++) {
      const t = i / sr;
      const freq = 48 + 115 * Math.exp(-t / 0.032);
      phase += (2 * Math.PI * freq) / sr;
      const env = Math.exp(-t / 0.11) * Math.min(1, t / 0.002);
      const click = Math.exp(-t / 0.006) * 0.28;
      const s = (Math.sin(phase) * 0.85 + click) * env * 0.72;
      outL[start + i] += s;
      outR[start + i] += s;
    }
  };

  const addSnare = (beat: number) => {
    const start = Math.round(beat * beatSec * sr);
    const durSamples = Math.round(0.22 * sr);
    let hpPrev = 0;
    for (let i = 0; i < durSamples && start + i < len; i++) {
      const t = i / sr;
      const body = Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t / 0.045) * 0.42;
      const n = rand();
      const hp = n - hpPrev * 0.65;
      hpPrev = n;
      const noise = hp * Math.exp(-t / 0.095) * 0.45;
      const s = (body + noise) * Math.min(1, t / 0.002) * 0.62;
      outL[start + i] += s * 0.96;
      outR[start + i] += s * 1.04;
    }
  };

  const addHat = (beat: number, open = false, accent = 1) => {
    const start = Math.round(beat * beatSec * sr);
    const durSamples = Math.round((open ? 0.2 : 0.065) * sr);
    let hp1 = 0;
    let hp2 = 0;
    for (let i = 0; i < durSamples && start + i < len; i++) {
      const t = i / sr;
      const n = rand();
      const h1 = n - hp1 * 0.85;
      hp1 = n;
      const h2 = h1 - hp2 * 0.85;
      hp2 = h1;
      const env = Math.exp(-t / (open ? 0.08 : 0.022));
      const s = h2 * env * 0.16 * accent;
      outL[start + i] += s * 1.12; // subtle hi-hat pan slightly right/left
      outR[start + i] += s * 0.88;
    }
  };

  for (let bar = 0; bar < totalBeats / 4; bar++) {
    const b = bar * 4;
    // Pop/City-Pop groove
    addKick(b + 0);
    addKick(b + 1.5);
    addKick(b + 2.5);

    addSnare(b + 1);
    addSnare(b + 3);

    for (let step = 0; step < 8; step++) {
      const isOpen = step === 7 && bar % 2 === 1;
      const accent = step % 2 === 0 ? 1.0 : 0.6;
      addHat(b + step * 0.5, isOpen, accent);
    }
  }

  return [outL, outR];
}

export function createDemoStems(sampleRate = 44100): {
  bpm: number;
  duration: number;
  stems: DemoStemData[];
} {
  const bpm = 120;
  const totalBeats = 16; // 4 bars @ 120 BPM = 8.0 seconds crisp musical loop
  const duration = (totalBeats * 60) / bpm;

  // Expressive J-Pop / City-Pop melody in C Major (with realistic singing pitch nuances!)
  const leadNotes: VocalNoteSpec[] = [
    // Bar 1 (Fmaj7): C4 - E4 - G4 - C5
    { startBeat: 0.0, durBeat: 0.9, midi: 60, vowel: "a", detuneCents: -8, scoopCents: -40 },
    { startBeat: 1.0, durBeat: 0.9, midi: 64, vowel: "o", detuneCents: +18, scoopCents: -30 },
    { startBeat: 2.0, durBeat: 0.9, midi: 67, vowel: "e", detuneCents: -34, scoopCents: -50 }, // noticeable flat note for pitch demo!
    { startBeat: 3.0, durBeat: 0.85, midi: 72, vowel: "a", detuneCents: +14, vibratoDepth: 0.35 },

    // Bar 2 (G6): B4 - A4 - G4 - D4
    { startBeat: 4.0, durBeat: 1.4, midi: 71, vowel: "e", detuneCents: +32, scoopCents: -25 }, // slightly sharp!
    { startBeat: 5.5, durBeat: 0.45, midi: 69, vowel: "a", detuneCents: -10 },
    { startBeat: 6.0, durBeat: 1.8, midi: 67, vowel: "o", detuneCents: -28, vibratoDepth: 0.42 },

    // Bar 3 (Em7 -> Am7): E4 - G4 - A4 - C5 - F4
    { startBeat: 8.0, durBeat: 0.7, midi: 64, vowel: "i", detuneCents: -12 },
    { startBeat: 8.75, durBeat: 0.7, midi: 67, vowel: "e", detuneCents: +24 },
    { startBeat: 9.5, durBeat: 0.9, midi: 69, vowel: "a", detuneCents: -36, scoopCents: -55 }, // flat scoop
    { startBeat: 10.5, durBeat: 0.7, midi: 72, vowel: "o", detuneCents: +12 },
    { startBeat: 11.25, durBeat: 0.7, midi: 65, vowel: "a", detuneCents: -18 }, // F4 passing tone

    // Bar 4 (Dm7 -> G7 -> C): E4 - D4 - C5
    { startBeat: 12.0, durBeat: 0.95, midi: 64, vowel: "a", detuneCents: +26 },
    { startBeat: 13.0, durBeat: 0.95, midi: 62, vowel: "o", detuneCents: -22 },
    { startBeat: 14.0, durBeat: 1.8, midi: 60, vowel: "a", detuneCents: -6, vibratoDepth: 0.45 }, // resolves to C4!
  ];

  // Backing harmony (lower/upper thirds)
  const harmonyNotes: VocalNoteSpec[] = [
    { startBeat: 0.0, durBeat: 0.9, midi: 60, vowel: "o", detuneCents: 0, scoopCents: -15 },
    { startBeat: 1.0, durBeat: 0.9, midi: 64, vowel: "o", detuneCents: 0, scoopCents: -15 },
    { startBeat: 2.0, durBeat: 0.9, midi: 65, vowel: "a", detuneCents: 0, scoopCents: -15 },
    { startBeat: 3.0, durBeat: 0.85, midi: 69, vowel: "a", detuneCents: 0 },
    { startBeat: 4.0, durBeat: 1.4, midi: 67, vowel: "u", detuneCents: 0 },
    { startBeat: 6.0, durBeat: 1.8, midi: 64, vowel: "o", detuneCents: 0 },
    { startBeat: 8.0, durBeat: 1.4, midi: 60, vowel: "u", detuneCents: 0 },
    { startBeat: 9.5, durBeat: 1.6, midi: 65, vowel: "a", detuneCents: 0 },
    { startBeat: 12.0, durBeat: 1.9, midi: 67, vowel: "a", detuneCents: 0 },
    { startBeat: 14.0, durBeat: 1.8, midi: 64, vowel: "o", detuneCents: 0 },
  ];

  // Warm Electric Piano chords (Fmaj7 -> G6 -> Em7/Am7 -> Dm7/G7)
  const chords = [
    { startBeat: 0.0, durBeat: 2.0, notes: [53, 60, 64, 69] }, // Fmaj7
    { startBeat: 2.0, durBeat: 2.0, notes: [53, 60, 64, 69] },
    { startBeat: 4.0, durBeat: 2.0, notes: [55, 62, 64, 71] }, // G6
    { startBeat: 6.0, durBeat: 2.0, notes: [55, 62, 67, 71] },
    { startBeat: 8.0, durBeat: 2.0, notes: [52, 59, 64, 67] }, // Em7
    { startBeat: 10.0, durBeat: 2.0, notes: [57, 64, 67, 72] }, // Am7
    { startBeat: 12.0, durBeat: 2.0, notes: [50, 57, 60, 65] }, // Dm7
    { startBeat: 14.0, durBeat: 2.0, notes: [55, 59, 62, 65] }, // G7
  ];

  const bassNotes = [
    { startBeat: 0.0, durBeat: 1.4, midi: 41 }, // F2
    { startBeat: 1.5, durBeat: 0.45, midi: 41 },
    { startBeat: 2.0, durBeat: 1.4, midi: 41 },
    { startBeat: 3.5, durBeat: 0.45, midi: 45 }, // A2
    { startBeat: 4.0, durBeat: 1.4, midi: 43 }, // G2
    { startBeat: 5.5, durBeat: 0.45, midi: 43 },
    { startBeat: 6.0, durBeat: 1.4, midi: 43 },
    { startBeat: 7.5, durBeat: 0.45, midi: 47 }, // B2
    { startBeat: 8.0, durBeat: 1.4, midi: 40 }, // E2
    { startBeat: 9.5, durBeat: 0.45, midi: 43 },
    { startBeat: 10.0, durBeat: 1.4, midi: 45 }, // A2
    { startBeat: 11.5, durBeat: 0.45, midi: 40 },
    { startBeat: 12.0, durBeat: 1.4, midi: 38 }, // D2
    { startBeat: 13.5, durBeat: 0.45, midi: 41 },
    { startBeat: 14.0, durBeat: 1.8, midi: 43 }, // G2
  ];

  const normalizeChannels = (channels: Float32Array[], targetPeak = 0.84) => {
    let peak = 0;
    for (const ch of channels) {
      for (let i = 0; i < ch.length; i++) {
        const a = Math.abs(ch[i]);
        if (a > peak) peak = a;
      }
    }
    if (peak > targetPeak && peak > 1e-6) {
      const g = targetPeak / peak;
      for (const ch of channels) {
        for (let i = 0; i < ch.length; i++) ch[i] *= g;
      }
    }
    return channels;
  };

  return {
    bpm,
    duration,
    stems: [
      {
        id: "track_vocal",
        name: "リードボーカル",
        role: "vocal",
        color: "#38bdf8",
        channels: normalizeChannels(
          synthesizeVocalLine(leadNotes, bpm, duration, sampleRate, 0),
        ),
        sampleRate,
      },
      {
        id: "track_harmony",
        name: "ハモリ / コーラス",
        role: "harmony",
        color: "#c084fc",
        channels: normalizeChannels(
          synthesizeVocalLine(harmonyNotes, bpm, duration, sampleRate, 0.7),
          0.72,
        ),
        sampleRate,
      },
      {
        id: "track_ep",
        name: "エレピ / コード",
        role: "instrument",
        color: "#34d399",
        channels: normalizeChannels(
          synthesizeElectricPiano(chords, bpm, duration, sampleRate),
          0.76,
        ),
        sampleRate,
      },
      {
        id: "track_bass",
        name: "ベース",
        role: "bass",
        color: "#fbbf24",
        channels: normalizeChannels(
          synthesizeBass(bassNotes, bpm, duration, sampleRate),
          0.78,
        ),
        sampleRate,
      },
      {
        id: "track_drums",
        name: "ドラム",
        role: "drums",
        color: "#fb7185",
        channels: normalizeChannels(
          synthesizeDrums(totalBeats, bpm, duration, sampleRate),
          0.84,
        ),
        sampleRate,
      },
    ],
  };
}
