/**
 * Tempo (BPM) detection.
 *
 * Builds an onset-strength envelope from frame-energy flux, then finds the
 * dominant periodicity by autocorrelation over the lag range corresponding
 * to 50–200 BPM. Works well on material with a clear pulse (drums, rhythmic
 * accompaniment); on rubato / sparse vocals the estimate is a best guess and
 * the confidence value reflects that.
 */

export interface TempoEstimate {
  bpm: number;
  confidence: number; // 0..1, autocorrelation peak strength
}

const MIN_BPM = 50;
const MAX_BPM = 200;

function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const len = Math.min(...channels.map((c) => c.length));
  const out = new Float32Array(len);
  for (const ch of channels) {
    for (let i = 0; i < len; i++) out[i] += ch[i] / channels.length;
  }
  return out;
}

export function detectTempo(channels: Float32Array[], sampleRate: number): TempoEstimate | null {
  const mono = mixToMono(channels);
  if (mono.length < sampleRate * 2) return null; // need at least ~2 s

  const frameSize = 1024;
  const hop = 512;
  const frames = Math.floor((mono.length - frameSize) / hop);
  if (frames < 32) return null;
  const fps = sampleRate / hop;

  // Onset envelope: positive energy flux between consecutive frames.
  const onset = new Float32Array(frames);
  let prevEnergy = 0;
  let maxOnset = 0;
  for (let f = 0; f < frames; f++) {
    const off = f * hop;
    let energy = 0;
    for (let i = 0; i < frameSize; i += 2) {
      const v = mono[off + i];
      energy += v * v;
    }
    const flux = Math.max(0, energy - prevEnergy);
    onset[f] = flux;
    if (flux > maxOnset) maxOnset = flux;
    prevEnergy = energy;
  }
  if (maxOnset <= 0) return null;
  for (let f = 0; f < frames; f++) onset[f] /= maxOnset;

  // Remove the mean so steady noise does not dominate the correlation.
  const mean = onset.reduce((a, b) => a + b, 0) / frames;
  for (let f = 0; f < frames; f++) onset[f] -= mean;

  const minLag = Math.floor((60 / MAX_BPM) * fps);
  const maxLag = Math.min(Math.ceil((60 / MIN_BPM) * fps), Math.floor(frames / 2));
  if (maxLag <= minLag) return null;

  // Correlate up to 2x maxLag so each candidate can also collect support
  // from its own double-period (harmonic summation).
  const corrMax = Math.min(Math.floor(frames / 2), maxLag * 2);
  const corrs = new Float32Array(corrMax + 1);
  for (let lag = 1; lag <= corrMax; lag++) {
    let c = 0;
    for (let f = 0; f + lag < frames; f++) c += onset[f] * onset[f + lag];
    corrs[lag] = c;
  }

  // Score = (corr(L) + 0.5 * corr(2L)) weighted by a wide log-Gaussian
  // tempo prior centered at 105 BPM. Syncopated patterns (e.g. kicks on
  // dotted quarters) can make a 1.5x period correlate slightly higher
  // than the true beat; the prior + harmonic support keep the estimate
  // on the beat a listener would tap.
  const PRIOR_CENTER = Math.log(105);
  const PRIOR_SIGMA = 0.5;
  let bestLag = -1;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpmAtLag = (60 * fps) / lag;
    const d = Math.log(bpmAtLag) - PRIOR_CENTER;
    const prior = Math.exp(-(d * d) / (2 * PRIOR_SIGMA * PRIOR_SIGMA));
    const harmonic = lag * 2 <= corrMax ? corrs[lag * 2] : 0;
    const score = (corrs[lag] + 0.5 * harmonic) * prior;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (bestLag < 0 || corrs[bestLag] <= 0) return null;
  const bestCorr = corrs[bestLag];

  // Parabolic interpolation around the peak for sub-frame precision.
  let shift = 0;
  if (bestLag > minLag && bestLag < maxLag) {
    const a = corrs[bestLag - 1];
    const b = corrs[bestLag];
    const c = corrs[bestLag + 1];
    const denom = a - 2 * b + c;
    if (denom !== 0) shift = 0.5 * (a - c) / denom;
  }
  const periodFrames = bestLag + shift;
  let bpm = (60 * fps) / periodFrames;

  // Fold into a musical range: prefer the interpretation inside 70–170
  // when the raw peak sits at an extreme (half/double-time ambiguity).
  while (bpm < 70) bpm *= 2;
  while (bpm > 170) bpm /= 2;

  // Confidence: peak correlation relative to the zero-lag energy.
  let zero = 0;
  for (let f = 0; f < frames; f++) zero += onset[f] * onset[f];
  const confidence = zero > 0 ? Math.min(1, Math.max(0, bestCorr / zero)) : 0;

  return { bpm: Math.round(bpm * 10) / 10, confidence };
}
