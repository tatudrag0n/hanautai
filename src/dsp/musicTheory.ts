import type { PitchBlob, PitchFrame, ScaleType } from "../types/studio";

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export const SCALE_INTERVALS: Record<Exclude<ScaleType, "custom">, number[]> = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  hirajoshi: [0, 2, 3, 7, 8],
};

export const SCALE_LABELS: Record<ScaleType, string> = {
  major: "メジャースケール (長調)",
  minor: "マイナースケール (短調)",
  harmonicMinor: "ハーモニックマイナー",
  majorPentatonic: "メジャーペンタトニック",
  minorPentatonic: "マイナーペンタトニック",
  hirajoshi: "平調子 (和風スケール)",
  chromatic: "クロマチック (全音)",
  custom: "カスタム (手動選択)",
};

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function freqToMidi(freq: number): number {
  if (freq <= 0) return 0;
  return 69 + 12 * Math.log2(freq / 440);
}

export function midiToName(midi: number): string {
  const rounded = Math.round(midi);
  const pc = ((rounded % 12) + 12) % 12;
  const octave = Math.floor(rounded / 12) - 1;
  return `${NOTE_NAMES[pc]}${octave}`;
}

export function formatCentsOffset(midiFloat: number): string {
  const cents = Math.round((midiFloat - Math.round(midiFloat)) * 100);
  if (cents === 0) return "±0¢";
  return `${cents > 0 ? "+" : ""}${cents}¢`;
}

export function getScaleMask(
  keyRoot: number,
  scale: ScaleType,
  customNotes?: boolean[],
): boolean[] {
  if (scale === "custom" && customNotes && customNotes.length === 12) {
    return [...customNotes];
  }
  const mask = new Array<boolean>(12).fill(false);
  const intervals =
    scale === "custom" ? SCALE_INTERVALS.major : SCALE_INTERVALS[scale];
  for (const iv of intervals) {
    mask[(((keyRoot + iv) % 12) + 12) % 12] = true;
  }
  return mask;
}

export function isMidiInScale(
  midiInt: number,
  keyRoot: number,
  scale: ScaleType,
  customNotes?: boolean[],
): boolean {
  const mask = getScaleMask(keyRoot, scale, customNotes);
  const pc = ((Math.round(midiInt) % 12) + 12) % 12;
  return mask[pc];
}

export function snapMidiToScale(
  midiFloat: number,
  keyRoot: number,
  scale: ScaleType,
  customNotes?: boolean[],
): number {
  if (scale === "chromatic") return Math.round(midiFloat);
  const mask = getScaleMask(keyRoot, scale, customNotes);
  if (!mask.some(Boolean)) return Math.round(midiFloat);

  let bestMidi = Math.round(midiFloat);
  let bestDist = Infinity;
  const center = Math.round(midiFloat);
  for (let m = center - 12; m <= center + 12; m++) {
    const pc = ((m % 12) + 12) % 12;
    if (!mask[pc]) continue;
    const dist = Math.abs(m - midiFloat);
    if (dist < bestDist) {
      bestDist = dist;
      bestMidi = m;
    }
  }
  return bestMidi;
}

// Krumhansl-Schmuckler tonal hierarchy weights
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function pearsonCorrelation(a: number[], b: number[]): number {
  const n = a.length;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i];
    sumB += b[i];
  }
  const meanA = sumA / n;
  const meanB = sumB / n;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  return den > 1e-9 ? num / den : 0;
}

export function detectKeyAndScale(
  frames: PitchFrame[],
  blobs?: PitchBlob[],
): { keyRoot: number; scale: "major" | "minor"; confidence: number } {
  const hist = new Array<number>(12).fill(0);
  if (blobs && blobs.length > 0) {
    for (let i = 0; i < blobs.length; i++) {
      const b = blobs[i];
      const dur = Math.max(0.02, b.endTime - b.startTime);
      const pc = ((Math.round(b.rawMidi) % 12) + 12) % 12;
      const cadenceWeight = i === 0 || i === blobs.length - 1 ? 1.35 : 1.0;
      hist[pc] += dur * Math.max(0.2, b.meanEnergy) * cadenceWeight;
    }
  } else {
    for (const f of frames) {
      if (!f.voiced || f.midi <= 0) continue;
      const pc = ((Math.round(f.midi) % 12) + 12) % 12;
      hist[pc] += f.confidence * Math.max(0.1, f.rms);
    }
  }

  const total = hist.reduce((s, v) => s + v, 0);
  if (total <= 1e-6) {
    return { keyRoot: 0, scale: "major", confidence: 0 };
  }

  let bestRoot = 0;
  let bestScale: "major" | "minor" = "major";
  let bestScore = -Infinity;

  for (let root = 0; root < 12; root++) {
    const rotated = new Array<number>(12);
    for (let i = 0; i < 12; i++) {
      rotated[i] = hist[(root + i) % 12];
    }
    const majScore = pearsonCorrelation(rotated, MAJOR_PROFILE);
    if (majScore > bestScore) {
      bestScore = majScore;
      bestRoot = root;
      bestScale = "major";
    }
    const minScore = pearsonCorrelation(rotated, MINOR_PROFILE);
    if (minScore > bestScore) {
      bestScore = minScore;
      bestRoot = root;
      bestScale = "minor";
    }
  }

  return {
    keyRoot: bestRoot,
    scale: bestScale,
    confidence: Math.max(0, Math.min(1, bestScore)),
  };
}
