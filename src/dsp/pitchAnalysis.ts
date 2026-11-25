import type {
  PitchAnalysis,
  PitchBlob,
  PitchFrame,
  PitchMark,
  ScaleType,
} from "../types/studio";
import { freqToMidi, snapMidiToScale } from "./musicTheory";

let blobCounter = 1;
export function nextBlobId(): string {
  return `blob_${blobCounter++}`;
}

export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0];
  const len = channels[0].length;
  const mono = new Float32Array(len);
  const scale = 1 / channels.length;
  for (let i = 0; i < len; i++) {
    let sum = 0;
    for (let c = 0; c < channels.length; c++) {
      sum += channels[c][i];
    }
    mono[i] = sum * scale;
  }
  return mono;
}

export function computeWaveformPeaks(
  mono: Float32Array,
  bins = 600,
): Float32Array {
  const peaks = new Float32Array(bins);
  if (mono.length === 0) return peaks;
  const step = mono.length / bins;
  for (let b = 0; b < bins; b++) {
    const start = Math.floor(b * step);
    const end = Math.min(mono.length, Math.floor((b + 1) * step));
    let maxAbs = 0;
    for (let i = start; i < end; i++) {
      const a = Math.abs(mono[i]);
      if (a > maxAbs) maxAbs = a;
    }
    peaks[b] = maxAbs;
  }
  return peaks;
}

export function computeMinMaxPeaks(
  channels: Float32Array[],
  bins = 320,
): number[] {
  const mono = mixToMono(channels);
  const out = new Array<number>(bins * 2).fill(0);
  if (mono.length === 0) return out;
  const step = mono.length / bins;
  for (let b = 0; b < bins; b++) {
    const start = Math.floor(b * step);
    const end = Math.min(mono.length, Math.max(start + 1, Math.floor((b + 1) * step)));
    let min = 0;
    let max = 0;
    for (let i = start; i < end; i++) {
      const v = mono[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    out[b * 2] = min;
    out[b * 2 + 1] = max;
  }
  return out;
}

// Reusable 2048-point Radix-2 FFT workspace for exact O(N log N) YIN
const YIN_N = 2048;
const YIN_W = 1024;
const fftBitRev = new Uint16Array(YIN_N);
const fftCos = new Float32Array(YIN_N / 2);
const fftSin = new Float32Array(YIN_N / 2);
{
  const logN = 11; // 2^11 = 2048
  for (let i = 0; i < YIN_N; i++) {
    let rev = 0;
    for (let b = 0; b < logN; b++) {
      rev = (rev << 1) | ((i >> b) & 1);
    }
    fftBitRev[i] = rev;
  }
  for (let i = 0; i < YIN_N / 2; i++) {
    const angle = (-2 * Math.PI * i) / YIN_N;
    fftCos[i] = Math.cos(angle);
    fftSin[i] = Math.sin(angle);
  }
}

function fftInPlace(re: Float32Array, im: Float32Array, inverse: boolean): void {
  for (let i = 0; i < YIN_N; i++) {
    const j = fftBitRev[i];
    if (i < j) {
      let tmp = re[i];
      re[i] = re[j];
      re[j] = tmp;
      tmp = im[i];
      im[i] = im[j];
      im[j] = tmp;
    }
  }

  const sign = inverse ? -1 : 1;
  for (let size = 2; size <= YIN_N; size <<= 1) {
    const half = size >> 1;
    const step = YIN_N / size;
    for (let start = 0; start < YIN_N; start += size) {
      for (let k = 0; k < half; k++) {
        const twIdx = k * step;
        const wr = fftCos[twIdx];
        const wi = sign * fftSin[twIdx];
        const even = start + k;
        const odd = even + half;
        const tr = wr * re[odd] - wi * im[odd];
        const ti = wr * im[odd] + wi * re[odd];
        re[odd] = re[even] - tr;
        im[odd] = im[even] - ti;
        re[even] += tr;
        im[even] += ti;
      }
    }
  }

  if (inverse) {
    const invN = 1 / YIN_N;
    for (let i = 0; i < YIN_N; i++) {
      re[i] *= invN;
      im[i] *= invN;
    }
  }
}

const wsZRe = new Float32Array(YIN_N);
const wsZIm = new Float32Array(YIN_N);
const wsCRe = new Float32Array(YIN_N);
const wsCIm = new Float32Array(YIN_N);
const wsDiff = new Float32Array(YIN_W + 2);
const wsCmndf = new Float32Array(YIN_W + 2);

/**
 * Exact FFT-accelerated YIN pitch detector on a single window starting at `startSample`.
 */
export function yinDetectWindow(
  mono: Float32Array,
  startSample: number,
  sampleRate: number,
  frameSize = 2048,
  minFreq = 55,
  maxFreq = 1100,
  yinThreshold = 0.16,
): { freq: number; confidence: number; rms: number; zcr: number } {
  const N = frameSize === YIN_N ? YIN_N : YIN_N;
  const W = N >> 1;
  if (startSample + N > mono.length) {
    return { freq: 0, confidence: 0, rms: 0, zcr: 0 };
  }

  let sumSq = 0;
  let crossings = 0;
  let e0 = 0;
  for (let i = 0; i < N; i++) {
    const s = mono[startSample + i];
    const sq = s * s;
    sumSq += sq;
    if (i < W) e0 += sq;
    if (i > 0) {
      const prev = mono[startSample + i - 1];
      if ((prev >= 0 && s < 0) || (prev < 0 && s >= 0)) crossings++;
    }
    // Pack a (first W samples) into real, b (all N samples) into imag
    wsZRe[i] = i < W ? s : 0;
    wsZIm[i] = s;
  }

  const rms = Math.sqrt(sumSq / N);
  const zcr = crossings / N;

  if (rms < 1e-4) {
    return { freq: 0, confidence: 0, rms, zcr };
  }

  const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));
  const tauMax = Math.min(W - 2, Math.floor(sampleRate / minFreq));
  if (tauMax <= tauMin) {
    return { freq: 0, confidence: 0, rms, zcr };
  }

  // Compute cross-correlation r(tau) = sum_{j=0..W-1} a[j] * b[j + tau] via single packed FFT + IFFT
  fftInPlace(wsZRe, wsZIm, false);

  for (let k = 0; k < N; k++) {
    const kNeg = k === 0 ? 0 : N - k;
    const zkr = wsZRe[k];
    const zki = wsZIm[k];
    const znr = wsZRe[kNeg];
    const zni = wsZIm[kNeg];

    // A[k] = 0.5 * (Z[k] + conj(Z[-k]))
    const ar = 0.5 * (zkr + znr);
    const ai = 0.5 * (zki - zni);
    // B[k] = 0.5 * (-i) * (Z[k] - conj(Z[-k])) = 0.5 * (zki + zni, -(zkr - znr))
    const br = 0.5 * (zki + zni);
    const bi = -0.5 * (zkr - znr);

    // conj(A[k]) * B[k]
    wsCRe[k] = ar * br + ai * bi;
    wsCIm[k] = ar * bi - ai * br;
  }

  fftInPlace(wsCRe, wsCIm, true);

  // Prefix running window energy E(tau) and exact YIN difference d(tau)
  let eTau = e0;
  let runningSum = 0;
  wsCmndf[0] = 1;
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    const outS = mono[startSample + tau - 1];
    const inS = mono[startSample + tau - 1 + W];
    eTau = eTau - outS * outS + inS * inS;
    const d = Math.max(0, e0 + eTau - 2 * wsCRe[tau]);
    wsDiff[tau] = d;
    runningSum += d;
    wsCmndf[tau] = runningSum > 1e-12 ? (d * tau) / runningSum : 1;
  }

  // Find first local minimum below threshold
  let tauEstimate = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (wsCmndf[tau] < yinThreshold) {
      while (tau + 1 <= tauMax && wsCmndf[tau + 1] < wsCmndf[tau]) {
        tau++;
      }
      tauEstimate = tau;
      break;
    }
  }

  // Fallback to global minimum in search range
  if (tauEstimate === -1) {
    let minVal = Infinity;
    for (let tau = tauMin; tau <= tauMax; tau++) {
      if (wsCmndf[tau] < minVal) {
        minVal = wsCmndf[tau];
        tauEstimate = tau;
      }
    }
  }

  if (tauEstimate <= 1) {
    return { freq: 0, confidence: 0, rms, zcr };
  }

  const confidence = Math.max(0, Math.min(1, 1 - wsCmndf[tauEstimate]));

  // Parabolic interpolation around tauEstimate
  const s0 = wsCmndf[tauEstimate - 1];
  const s1 = wsCmndf[tauEstimate];
  const s2 = wsCmndf[tauEstimate + 1];
  const denom = 2 * (s0 - 2 * s1 + s2);
  let betterTau = tauEstimate;
  if (Math.abs(denom) > 1e-12) {
    const delta = (s0 - s2) / denom;
    if (Math.abs(delta) < 1) {
      betterTau = tauEstimate + delta;
    }
  }

  const freq = betterTau > 0 ? sampleRate / betterTau : 0;
  return { freq, confidence, rms, zcr };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) * 0.5;
}

function smoothPitchFrames(frames: PitchFrame[]): void {
  // 1. Bridge 1-2 frame unvoiced micro-dropouts inside sustained phrases
  for (let i = 1; i < frames.length - 1; i++) {
    if (!frames[i].voiced) {
      const prev = frames[i - 1];
      const next = frames[i + 1];
      if (
        prev.voiced &&
        next.voiced &&
        Math.abs(prev.midi - next.midi) < 2.0 &&
        frames[i].rms > prev.rms * 0.25
      ) {
        frames[i].voiced = true;
        frames[i].midi = (prev.midi + next.midi) * 0.5;
        frames[i].freq = 440 * Math.pow(2, (frames[i].midi - 69) / 12);
        frames[i].confidence = Math.min(prev.confidence, next.confidence);
      }
    }
  }

  // 2. 5-frame median filter for octave jumps (keep real vibrato smooth)
  const rawMidis = frames.map((f) => (f.voiced ? f.midi : 0));
  for (let i = 0; i < frames.length; i++) {
    if (!frames[i].voiced) continue;
    const neighborhood: number[] = [];
    for (let k = Math.max(0, i - 2); k <= Math.min(frames.length - 1, i + 2); k++) {
      if (rawMidis[k] > 0) neighborhood.push(rawMidis[k]);
    }
    if (neighborhood.length >= 3) {
      const med = median(neighborhood);
      // Correct gross octave error (> 8 semitones outlier)
      if (Math.abs(rawMidis[i] - med) > 7.5) {
        frames[i].midi = med;
        frames[i].freq = 440 * Math.pow(2, (med - 69) / 12);
      }
    }
  }
}

/**
 * Extract pitch-synchronous marks for TD-PSOLA synthesis.
 * Uses a gently low-passed guide signal to lock phase cleanly to fundamental peaks.
 */
export function extractPitchMarks(
  mono: Float32Array,
  frames: PitchFrame[],
  sampleRate: number,
  hopSize: number,
): PitchMark[] {
  const len = mono.length;
  if (len === 0) return [];

  // 1-pole lowpass guide around ~900 Hz to stabilize fundamental glottal peak picking
  const guide = new Float32Array(len);
  const fc = 900;
  const rc = 1 / (2 * Math.PI * fc);
  const dt = 1 / sampleRate;
  const alpha = dt / (rc + dt);
  let y = 0;
  for (let i = 0; i < len; i++) {
    y += alpha * (mono[i] - y);
    guide[i] = y;
  }

  const marks: PitchMark[] = [];
  let pos = 0;

  while (pos < len) {
    const frameIdx = Math.min(
      frames.length - 1,
      Math.max(0, Math.round(pos / hopSize)),
    );
    const frame = frames[frameIdx];

    if (!frame || !frame.voiced || frame.freq <= 0) {
      marks.push({
        sample: pos,
        period: hopSize,
        f0: 0,
        voiced: false,
      });
      pos += hopSize;
      continue;
    }

    const period = Math.max(24, Math.min(2000, sampleRate / frame.freq));
    const searchRad = Math.max(4, Math.floor(period * 0.32));
    const sMin = Math.max(0, Math.floor(pos - searchRad));
    const sMax = Math.min(len - 1, Math.floor(pos + searchRad));

    let bestIdx = Math.min(len - 1, Math.round(pos));
    let bestVal = -Infinity;
    for (let i = sMin; i <= sMax; i++) {
      if (guide[i] > bestVal) {
        bestVal = guide[i];
        bestIdx = i;
      }
    }

    // Ensure strictly advancing marks
    if (marks.length > 0 && bestIdx <= marks[marks.length - 1].sample) {
      bestIdx = Math.min(
        len - 1,
        marks[marks.length - 1].sample + Math.max(12, Math.round(period * 0.6)),
      );
    }

    marks.push({
      sample: bestIdx,
      period,
      f0: frame.freq,
      voiced: true,
    });

    pos = bestIdx + period;
  }

  return marks;
}

export function segmentPitchBlobs(
  frames: PitchFrame[],
  keyRoot = 0,
  scale: ScaleType = "major",
  customNotes?: boolean[],
): PitchBlob[] {
  const blobs: PitchBlob[] = [];
  if (frames.length === 0) return blobs;

  const hopDur = frames.length > 1 ? frames[1].time - frames[0].time : 256 / 44100;
  const maxGapFrames = Math.max(2, Math.round(0.055 / hopDur));
  const minBlobDur = 0.045;

  let curFrames: PitchFrame[] = [];
  let gapCount = 0;

  const flushBlob = () => {
    if (curFrames.length === 0) return;
    const startTime = curFrames[0].time;
    const endTime = curFrames[curFrames.length - 1].time + hopDur;
    if (endTime - startTime >= minBlobDur) {
      const midis = curFrames.map((f) => f.midi);
      const rawMidi = median(midis);
      const meanEnergy =
        curFrames.reduce((s, f) => s + f.rms, 0) / curFrames.length;
      const targetMidi = snapMidiToScale(rawMidi, keyRoot, scale, customNotes);
      blobs.push({
        id: nextBlobId(),
        startTime,
        endTime,
        rawMidi,
        targetMidi,
        correctionOverride: null,
        vibratoScaleOverride: null,
        formantOverride: null,
        gainDb: 0,
        meanEnergy,
      });
    }
    curFrames = [];
    gapCount = 0;
  };

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (!f.voiced || f.midi <= 0) {
      if (curFrames.length > 0) {
        gapCount++;
        if (gapCount > maxGapFrames) {
          flushBlob();
        }
      }
      continue;
    }

    gapCount = 0;
    if (curFrames.length === 0) {
      curFrames.push(f);
      continue;
    }

    // Compare against recent pitch center of current blob
    const recent = curFrames.slice(-8).map((x) => x.midi);
    const center = median(recent);
    const diff = Math.abs(f.midi - center);

    // Check if next few frames also stay at the new pitch (avoid splitting vibrato spikes)
    if (diff > 0.85) {
      let confirmedShift = true;
      if (i + 1 < frames.length && frames[i + 1].voiced) {
        if (Math.abs(frames[i + 1].midi - center) <= 0.75) {
          confirmedShift = false;
        }
      }
      if (confirmedShift) {
        flushBlob();
        curFrames.push(f);
        continue;
      }
    }

    curFrames.push(f);
  }
  flushBlob();

  return blobs;
}

export function splitPitchBlob(
  blobs: PitchBlob[],
  blobId: string,
  splitTime: number,
  frames: PitchFrame[],
): PitchBlob[] {
  const idx = blobs.findIndex((b) => b.id === blobId);
  if (idx === -1) return blobs;
  const target = blobs[idx];
  if (
    splitTime <= target.startTime + 0.03 ||
    splitTime >= target.endTime - 0.03
  ) {
    return blobs;
  }

  const calcStats = (start: number, end: number, fallbackMidi: number) => {
    const sub = frames.filter(
      (f) => f.voiced && f.time >= start && f.time <= end,
    );
    if (sub.length === 0) {
      return { rawMidi: fallbackMidi, meanEnergy: target.meanEnergy };
    }
    return {
      rawMidi: median(sub.map((f) => f.midi)),
      meanEnergy: sub.reduce((s, f) => s + f.rms, 0) / sub.length,
    };
  };

  const leftStats = calcStats(target.startTime, splitTime, target.rawMidi);
  const rightStats = calcStats(splitTime, target.endTime, target.rawMidi);

  const delta = target.targetMidi - target.rawMidi;

  const left: PitchBlob = {
    ...target,
    id: nextBlobId(),
    endTime: splitTime,
    rawMidi: leftStats.rawMidi,
    targetMidi: Math.round(leftStats.rawMidi + delta),
    meanEnergy: leftStats.meanEnergy,
  };
  const right: PitchBlob = {
    ...target,
    id: nextBlobId(),
    startTime: splitTime,
    rawMidi: rightStats.rawMidi,
    targetMidi: Math.round(rightStats.rawMidi + delta),
    meanEnergy: rightStats.meanEnergy,
  };

  const next = [...blobs];
  next.splice(idx, 1, left, right);
  return next;
}

export function analyzePitch(
  channels: Float32Array[],
  sampleRate: number,
  keyRoot = 0,
  scale: ScaleType = "major",
  customNotes?: boolean[],
): PitchAnalysis {
  const mono = mixToMono(channels);
  const frameSize = 2048;
  const hopSize = 256;
  const duration = mono.length / sampleRate;

  // Find peak RMS for adaptive noise floor
  let maxRms = 0;
  const totalFrames = Math.max(
    1,
    Math.floor(Math.max(0, mono.length - frameSize) / hopSize) + 1,
  );
  const rawResults: Array<{
    time: number;
    freq: number;
    confidence: number;
    rms: number;
    zcr: number;
  }> = new Array(totalFrames);

  for (let i = 0; i < totalFrames; i++) {
    const startSample = i * hopSize;
    const centerTime = (startSample + frameSize * 0.5) / sampleRate;
    const res = yinDetectWindow(mono, startSample, sampleRate, frameSize);
    if (res.rms > maxRms) maxRms = res.rms;
    rawResults[i] = {
      time: centerTime,
      ...res,
    };
  }

  const rmsGate = Math.max(0.004, maxRms * 0.045);
  const frames: PitchFrame[] = rawResults.map((r) => {
    const voiced =
      r.rms >= rmsGate &&
      r.confidence >= 0.72 &&
      r.freq >= 55 &&
      r.freq <= 1100 &&
      r.zcr < 0.25;
    const midi = voiced ? freqToMidi(r.freq) : 0;
    return {
      time: r.time,
      freq: voiced ? r.freq : 0,
      midi,
      confidence: r.confidence,
      rms: r.rms,
      voiced,
    };
  });

  smoothPitchFrames(frames);
  const marks = extractPitchMarks(mono, frames, sampleRate, hopSize);
  const blobs = segmentPitchBlobs(frames, keyRoot, scale, customNotes);
  const waveformPeaks = computeWaveformPeaks(mono, 600);

  return {
    sampleRate,
    hopSize,
    frameSize,
    duration,
    frames,
    marks,
    blobs,
    waveformPeaks,
  };
}
