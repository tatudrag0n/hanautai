import type { CompSettings, EqSettings, SatMode } from "../types/studio";

interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a0: number;
  a1: number;
  a2: number;
}

function highpassCoeffs(freq: number, q: number, sr: number): BiquadCoeffs {
  const w0 = (2 * Math.PI * Math.max(10, Math.min(sr * 0.45, freq))) / sr;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * q);
  return {
    b0: (1 + cos) / 2,
    b1: -(1 + cos),
    b2: (1 + cos) / 2,
    a0: 1 + alpha,
    a1: -2 * cos,
    a2: 1 - alpha,
  };
}

function lowShelfCoeffs(freq: number, gainDb: number, sr: number): BiquadCoeffs {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * Math.max(10, Math.min(sr * 0.45, freq))) / sr;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = (sin / 2) * Math.sqrt((A + 1 / A) * (1 / 0.9 - 1) + 2);
  const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
  return {
    b0: A * (A + 1 - (A - 1) * cos + twoSqrtAAlpha),
    b1: 2 * A * (A - 1 - (A + 1) * cos),
    b2: A * (A + 1 - (A - 1) * cos - twoSqrtAAlpha),
    a0: A + 1 + (A - 1) * cos + twoSqrtAAlpha,
    a1: -2 * (A - 1 + (A + 1) * cos),
    a2: A + 1 + (A - 1) * cos - twoSqrtAAlpha,
  };
}

function highShelfCoeffs(freq: number, gainDb: number, sr: number): BiquadCoeffs {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * Math.max(10, Math.min(sr * 0.45, freq))) / sr;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = (sin / 2) * Math.sqrt((A + 1 / A) * (1 / 0.9 - 1) + 2);
  const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
  return {
    b0: A * (A + 1 + (A - 1) * cos + twoSqrtAAlpha),
    b1: -2 * A * (A - 1 + (A + 1) * cos),
    b2: A * (A + 1 + (A - 1) * cos - twoSqrtAAlpha),
    a0: A + 1 - (A - 1) * cos + twoSqrtAAlpha,
    a1: 2 * (A - 1 - (A + 1) * cos),
    a2: A + 1 - (A - 1) * cos - twoSqrtAAlpha,
  };
}

function peakingCoeffs(
  freq: number,
  gainDb: number,
  q: number,
  sr: number,
): BiquadCoeffs {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * Math.max(10, Math.min(sr * 0.45, freq))) / sr;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * Math.max(0.1, q));
  return {
    b0: 1 + alpha * A,
    b1: -2 * cos,
    b2: 1 - alpha * A,
    a0: 1 + alpha / A,
    a1: -2 * cos,
    a2: 1 - alpha / A,
  };
}

function evalMagDb(c: BiquadCoeffs, freq: number, sr: number): number {
  const w = (2 * Math.PI * freq) / sr;
  const cos1 = Math.cos(w);
  const sin1 = Math.sin(w);
  const cos2 = Math.cos(2 * w);
  const sin2 = Math.sin(2 * w);

  const b0 = c.b0 / c.a0;
  const b1 = c.b1 / c.a0;
  const b2 = c.b2 / c.a0;
  const a1 = c.a1 / c.a0;
  const a2 = c.a2 / c.a0;

  const numRe = b0 + b1 * cos1 + b2 * cos2;
  const numIm = -b1 * sin1 - b2 * sin2;
  const denRe = 1 + a1 * cos1 + a2 * cos2;
  const denIm = -a1 * sin1 - a2 * sin2;

  const magSq = (numRe * numRe + numIm * numIm) / Math.max(1e-18, denRe * denRe + denIm * denIm);
  return 10 * Math.log10(Math.max(1e-8, magSq));
}

export function computeEqCurveDb(
  eq: EqSettings,
  frequencies: number[],
  sampleRate = 48000,
): number[] {
  if (!eq.enabled) {
    return frequencies.map(() => 0);
  }
  const filters: BiquadCoeffs[] = [];
  if (eq.hpfEnabled) {
    filters.push(highpassCoeffs(eq.hpfFreq, 0.707, sampleRate));
  }
  filters.push(lowShelfCoeffs(eq.lowFreq, eq.lowGain, sampleRate));
  filters.push(peakingCoeffs(eq.midFreq, eq.midGain, eq.midQ, sampleRate));
  filters.push(highShelfCoeffs(eq.highFreq, eq.highGain, sampleRate));

  return frequencies.map((f) => {
    let db = 0;
    for (const flt of filters) {
      db += evalMagDb(flt, f, sampleRate);
    }
    return db;
  });
}

export function computeCompressorOutputDb(
  inputDb: number,
  comp: CompSettings,
): number {
  if (!comp.enabled) return inputDb;
  const T = comp.threshold;
  const R = Math.max(1, comp.ratio);
  const W = Math.max(0, comp.knee);

  let outDb = inputDb;
  if (W <= 0.1) {
    if (inputDb > T) {
      outDb = T + (inputDb - T) / R;
    }
  } else {
    const halfW = W / 2;
    if (inputDb < T - halfW) {
      outDb = inputDb;
    } else if (inputDb > T + halfW) {
      outDb = T + (inputDb - T) / R;
    } else {
      const diff = inputDb - T + halfW;
      outDb = inputDb + ((1 / R - 1) * diff * diff) / (2 * W);
    }
  }

  return outDb + comp.makeupDb;
}

export function buildWaveshaperCurve(
  mode: SatMode,
  drive: number,
  samples = 1024,
): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(samples * 4));
  const d = Math.max(0, Math.min(1, drive));

  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    if (d < 0.01) {
      curve[i] = x;
      continue;
    }
    if (mode === "tube") {
      // Asymmetric warm tube saturation (adds subtle 2nd + 3rd harmonics)
      const k = 1 + d * 7;
      const biased = x + 0.12 * d;
      const y = Math.tanh(k * biased) - Math.tanh(k * 0.12 * d);
      curve[i] = y / Math.max(0.4, Math.tanh(k));
    } else if (mode === "tape") {
      // Smooth symmetric soft-clipping tape compression
      const k = 1 + d * 5.5;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    } else if (mode === "crisp") {
      // Exciter-like cubic/atan presence curve
      const k = 1 + d * 12;
      curve[i] = ((2 / Math.PI) * Math.atan(k * x)) * 0.92;
    } else {
      // Lo-Fi stepped quantization + warm drive
      const steps = Math.max(4, Math.round(48 - d * 40));
      const crushed = Math.round(x * steps) / steps;
      curve[i] = Math.tanh(crushed * (1 + d * 2));
    }
  }
  return curve;
}
