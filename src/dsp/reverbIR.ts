import type { ReverbType } from "../types/studio";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ReverbIrChannels {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
}

/**
 * Generates an organic, decorrelated stereo algorithmic impulse response
 * with early reflections, frequency-dependent air absorption damping, and stereo width.
 */
export function generateReverbIr(
  type: ReverbType,
  decaySec: number,
  preDelayMs: number,
  dampingHz: number,
  width: number,
  sampleRate: number,
): ReverbIrChannels {
  const safeDecay = Math.max(0.25, Math.min(8.0, decaySec));
  const preDelaySamples = Math.round((Math.max(0, preDelayMs) / 1000) * sampleRate);
  const tailDuration = safeDecay * 1.15;
  const totalSamples = Math.max(
    1024,
    preDelaySamples + Math.round(tailDuration * sampleRate),
  );

  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  const rngL = mulberry32(1337 + type.length * 97);
  const rngR = mulberry32(7331 + type.length * 53);

  // Room character presets
  const character = {
    booth: { erCount: 8, erSpreadMs: 18, attackMs: 4, density: 0.7 },
    room: { erCount: 14, erSpreadMs: 32, attackMs: 8, density: 0.85 },
    plate: { erCount: 18, erSpreadMs: 24, attackMs: 2, density: 1.0 },
    hall: { erCount: 22, erSpreadMs: 55, attackMs: 18, density: 0.95 },
    cathedral: { erCount: 28, erSpreadMs: 90, attackMs: 32, density: 1.0 },
  }[type];

  // 1. Early reflections
  for (let k = 0; k < character.erCount; k++) {
    const frac = (k + 1) / character.erCount;
    const tMs = frac * character.erSpreadMs * (0.7 + 0.6 * rngL());
    const idxL = preDelaySamples + Math.round((tMs / 1000) * sampleRate);
    const idxR =
      preDelaySamples +
      Math.round(
        ((tMs * (0.85 + 0.3 * rngR())) / 1000) * sampleRate,
      );
    const amp = (1 - frac * 0.65) * 0.28;
    const signL = rngL() > 0.5 ? 1 : -1;
    const signR = rngR() > 0.5 ? 1 : -1;
    if (idxL < totalSamples) left[idxL] += signL * amp;
    if (idxR < totalSamples) right[idxR] += signR * amp;
  }

  // 2. Diffuse late tail with exponential decay & progressive lowpass air damping
  const attackSamples = Math.max(1, Math.round((character.attackMs / 1000) * sampleRate));
  const tau = safeDecay / 6.907755; // RT60 (-60dB) decay constant
  const fc = Math.max(800, Math.min(18000, dampingHz));
  const rc = 1 / (2 * Math.PI * fc);
  const dt = 1 / sampleRate;
  const baseAlpha = dt / (rc + dt);

  let lpL = 0;
  let lpR = 0;

  for (let i = preDelaySamples; i < totalSamples; i++) {
    const rel = i - preDelaySamples;
    const t = rel / sampleRate;
    const env =
      Math.min(1, rel / attackSamples) * Math.exp(-t / tau) * character.density;

    const nL = (rngL() * 2 - 1) * env;
    const nR = (rngR() * 2 - 1) * env;

    // Slightly stronger damping deeper into the tail for natural room warmth
    const tailAlpha = Math.max(0.02, baseAlpha / (1 + t * 1.4));
    lpL += tailAlpha * (nL - lpL);
    lpR += tailAlpha * (nR - lpR);

    left[i] += lpL * 0.22;
    right[i] += lpR * 0.22;
  }

  // 3. Apply stereo width via M/S blend
  const w = Math.max(0, Math.min(1.5, width));
  for (let i = 0; i < totalSamples; i++) {
    const mid = 0.5 * (left[i] + right[i]);
    const side = 0.5 * (left[i] - right[i]) * w;
    left[i] = mid + side;
    right[i] = mid - side;
  }

  // 4. Normalize energy cleanly so switching types keeps balanced loudness
  let energy = 0;
  for (let i = 0; i < totalSamples; i++) {
    energy += left[i] * left[i] + right[i] * right[i];
  }
  const rmsScale = energy > 1e-6 ? 0.42 / Math.sqrt(energy * 0.5) : 1;
  const gain = Math.min(2.5, rmsScale);
  for (let i = 0; i < totalSamples; i++) {
    left[i] *= gain;
    right[i] *= gain;
  }

  return { left, right, sampleRate };
}
