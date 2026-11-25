import type {
  PitchAnalysis,
  PitchBlob,
  PitchDrawPoint,
  PitchSettings,
} from "../types/studio";
import { midiToFreq, snapMidiToScale } from "./musicTheory";

export interface CompiledPitchCurve {
  targetMidis: Float32Array;
  formants: Float32Array;
  gains: Float32Array;
}

/**
 * Compile final target MIDI, formant shift, and gain per analysis frame,
 * combining PitchBlobs, global PitchSettings, Retune Speed smoothing, and freehand drawn pitch.
 */
export function compileTargetPitchCurve(
  analysis: PitchAnalysis,
  blobs: PitchBlob[],
  settings: PitchSettings,
  drawnPitch: PitchDrawPoint[] = [],
): CompiledPitchCurve {
  const frames = analysis.frames;
  const n = frames.length;
  const targetMidis = new Float32Array(n);
  const formants = new Float32Array(n);
  const gains = new Float32Array(n);
  gains.fill(1);

  if (n === 0) {
    return { targetMidis, formants, gains };
  }

  const hopDur = n > 1 ? frames[1].time - frames[0].time : analysis.hopSize / analysis.sampleRate;
  const sortedBlobs = [...blobs].sort((a, b) => a.startTime - b.startTime);
  const sortedDraw = [...drawnPitch].sort((a, b) => a.time - b.time);

  let blobPtr = 0;
  let drawPtr = 0;

  // First pass: compute raw desired delta per frame before retune smoothing
  const desiredDeltas = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const f = frames[i];
    if (!f.voiced || f.midi <= 0) {
      targetMidis[i] = 0;
      continue;
    }

    const t = f.time;
    while (blobPtr < sortedBlobs.length && sortedBlobs[blobPtr].endTime < t - hopDur * 0.5) {
      blobPtr++;
    }
    const blob =
      blobPtr < sortedBlobs.length &&
      t >= sortedBlobs[blobPtr].startTime - hopDur * 0.5 &&
      t <= sortedBlobs[blobPtr].endTime + hopDur * 0.5
        ? sortedBlobs[blobPtr]
        : null;

    if (blob) {
      gains[i] = Math.pow(10, Math.max(-24, Math.min(18, blob.gainDb)) / 20);
      formants[i] = blob.formantOverride ?? settings.formantShift;
    } else {
      formants[i] = settings.formantShift;
    }

    if (!settings.enabled || settings.bypass) {
      desiredDeltas[i] = 0;
      formants[i] = 0;
      targetMidis[i] = f.midi;
      continue;
    }

    const corr = blob?.correctionOverride ?? settings.correction;
    const vibCut = blob?.vibratoScaleOverride ?? settings.vibratoCut;
    const vibScale = 1 - vibCut; // 0 = flattened, 1 = natural, >1 = exaggerated

    const rawCenter = blob ? blob.rawMidi : f.midi;
    const targetCenter = blob
      ? blob.targetMidi
      : snapMidiToScale(
          f.midi,
          settings.keyRoot,
          settings.scale,
          settings.customNotes,
        );

    const deviation = f.midi - rawCenter;
    const blendedCenter = rawCenter + (targetCenter - rawCenter) * corr;
    let desiredMidi = blendedCenter + deviation * vibScale;

    // Apply freehand drawn pitch curve if near any drawn control point
    if (sortedDraw.length > 0) {
      while (drawPtr < sortedDraw.length - 1 && sortedDraw[drawPtr + 1].time < t) {
        drawPtr++;
      }
      const p0 = sortedDraw[drawPtr];
      const p1 = drawPtr + 1 < sortedDraw.length ? sortedDraw[drawPtr + 1] : null;
      if (p1 && t >= p0.time && t <= p1.time && p1.time - p0.time < 0.12) {
        const frac = (t - p0.time) / Math.max(1e-5, p1.time - p0.time);
        desiredMidi = p0.midi + (p1.midi - p0.midi) * frac;
      } else if (Math.abs(t - p0.time) < 0.03) {
        desiredMidi = p0.midi;
      }
    }

    desiredDeltas[i] = Math.max(-24, Math.min(24, desiredMidi - f.midi));
  }

  if (!settings.enabled || settings.bypass) {
    return { targetMidis, formants, gains };
  }

  // Second pass: Retune Speed smoothing on pitch shift delta
  const tau = Math.max(0, settings.retuneSpeedMs) / 1000;
  const alpha = tau > 1e-4 ? Math.exp(-hopDur / tau) : 0;

  let prevDelta = 0;
  let wasVoiced = false;

  for (let i = 0; i < n; i++) {
    const f = frames[i];
    if (!f.voiced || f.midi <= 0) {
      targetMidis[i] = 0;
      wasVoiced = false;
      prevDelta = 0;
      continue;
    }

    if (!wasVoiced) {
      // At phrase onset: hard-tune snaps immediately if alpha == 0,
      // otherwise smoothly pulls in from natural onset over retuneSpeedMs
      prevDelta = alpha === 0 ? desiredDeltas[i] : desiredDeltas[i] * (1 - alpha);
      wasVoiced = true;
    } else {
      prevDelta = prevDelta * alpha + desiredDeltas[i] * (1 - alpha);
    }

    targetMidis[i] = Math.max(24, Math.min(108, f.midi + prevDelta));
  }

  return { targetMidis, formants, gains };
}

function sampleLinear(buf: Float32Array, idx: number): number {
  if (idx <= 0) return buf[0] ?? 0;
  const max = buf.length - 1;
  if (idx >= max) return buf[max] ?? 0;
  const i0 = Math.floor(idx);
  const frac = idx - i0;
  return buf[i0] * (1 - frac) + buf[i0 + 1] * frac;
}

/**
 * TD-PSOLA pitch-synchronous overlap-add synthesizer with independent formant shifting
 * and window-energy normalization.
 */
export function synthesizePsola(
  rawChannels: Float32Array[],
  analysis: PitchAnalysis,
  blobs: PitchBlob[],
  settings: PitchSettings,
  drawnPitch: PitchDrawPoint[] = [],
): Float32Array[] {
  if (rawChannels.length === 0 || rawChannels[0].length === 0) {
    return rawChannels.map((ch) => new Float32Array(ch));
  }

  const hasPerBlobGain = blobs.some((b) => Math.abs(b.gainDb) > 0.05);
  const hasPerBlobFormant = blobs.some(
    (b) => b.formantOverride !== null && Math.abs(b.formantOverride) > 0.05,
  );
  const bypassAll =
    (!settings.enabled || settings.bypass) && !hasPerBlobGain && !hasPerBlobFormant;

  if (bypassAll || analysis.marks.length === 0) {
    return rawChannels.map((ch) => new Float32Array(ch));
  }

  const len = rawChannels[0].length;
  const numCh = rawChannels.length;
  const sr = analysis.sampleRate;
  const hopSize = analysis.hopSize;
  const marks = analysis.marks;

  const { targetMidis, formants, gains } = compileTargetPitchCurve(
    analysis,
    blobs,
    settings,
    drawnPitch,
  );

  const outChannels = rawChannels.map(() => new Float32Array(len));
  const winSum = new Float32Array(len);

  let markPtr = 0;
  let tSyn = 0;

  while (tSyn < len) {
    // Advance markPtr to analysis mark closest to tSyn
    while (
      markPtr + 1 < marks.length &&
      Math.abs(marks[markPtr + 1].sample - tSyn) <=
        Math.abs(marks[markPtr].sample - tSyn)
    ) {
      markPtr++;
    }

    const mark = marks[markPtr];
    const frameIdx = Math.min(
      targetMidis.length - 1,
      Math.max(0, Math.round(tSyn / hopSize)),
    );
    const targetMidi = targetMidis[frameIdx];
    const gain = gains[frameIdx] ?? 1;
    const formantSt = formants[frameIdx] ?? 0;

    if (!mark.voiced || targetMidi <= 0) {
      // Unvoiced / consonant region: transparent OLA passthrough
      const halfW = Math.max(64, Math.round(mark.period));
      const startOut = Math.max(0, Math.round(tSyn) - halfW);
      const endOut = Math.min(len - 1, Math.round(tSyn) + halfW);
      const centerOut = Math.round(tSyn);

      for (let i = startOut; i <= endOut; i++) {
        const offset = i - centerOut;
        const w = 0.5 * (1 + Math.cos((Math.PI * offset) / halfW));
        const srcIdx = Math.max(0, Math.min(len - 1, mark.sample + offset));
        for (let c = 0; c < numCh; c++) {
          outChannels[c][i] += rawChannels[c][srcIdx] * w * gain;
        }
        winSum[i] += w;
      }

      tSyn += halfW;
      continue;
    }

    const targetFreq = Math.max(45, Math.min(1300, midiToFreq(targetMidi)));
    const tSynPeriod = sr / targetFreq;
    const tAnaPeriod = Math.max(24, mark.period);

    const formantRatio = Math.pow(2, Math.max(-12, Math.min(12, formantSt)) / 12);
    // Keep overlap continuous when shifting down while preserving formant window width
    const baseAnaHalf = Math.max(tAnaPeriod, tSynPeriod * 0.62);
    const halfWOut = Math.max(
      16,
      Math.round(Math.max(baseAnaHalf / formantRatio, tSynPeriod * 0.58)),
    );

    const centerOut = Math.round(tSyn);
    const startOut = Math.max(0, centerOut - halfWOut);
    const endOut = Math.min(len - 1, centerOut + halfWOut);

    for (let i = startOut; i <= endOut; i++) {
      const offset = i - centerOut;
      const norm = offset / halfWOut;
      if (Math.abs(norm) >= 1) continue;
      const w = 0.5 * (1 + Math.cos(Math.PI * norm));

      // Clamp source reading strictly within ±baseAnaHalf so formant stretching never steals neighboring cycles awkwardly
      const srcOffset = Math.max(
        -baseAnaHalf,
        Math.min(baseAnaHalf, offset * formantRatio),
      );
      const srcPos = mark.sample + srcOffset;

      for (let c = 0; c < numCh; c++) {
        outChannels[c][i] += sampleLinear(rawChannels[c], srcPos) * w * gain;
      }
      winSum[i] += w;
    }

    tSyn += tSynPeriod;
  }

  // Normalize by accumulated window weights to eliminate any amplitude ripple
  for (let i = 0; i < len; i++) {
    const ws = winSum[i];
    if (ws > 1e-4) {
      const inv = 1 / ws;
      for (let c = 0; c < numCh; c++) {
        outChannels[c][i] *= inv;
      }
    } else {
      for (let c = 0; c < numCh; c++) {
        outChannels[c][i] = rawChannels[c][i];
      }
    }
  }

  return outChannels;
}
