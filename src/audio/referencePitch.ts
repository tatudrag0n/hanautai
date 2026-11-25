import { snapMidiToScale } from "../dsp/musicTheory";
import type { PitchBlob, PitchSettings } from "../types/studio";

/**
 * 参照ピッチ取込 (Reference pitch import)
 *
 * The user supplies their own separated reference vocal (分離は各自).
 * Its analyzed note blobs are time-aligned onto the target clip's blobs:
 * the reference timeline is proportionally scaled onto the clip timeline,
 * each target blob adopts the target note of the reference blob with the
 * longest overlap (snapped to the track's key/scale). Target blobs with no
 * overlapping reference note keep their original target.
 */

export interface ReferenceAlignResult {
  blobs: PitchBlob[];
  matched: number;
  unmatched: number;
}

export function alignBlobsToReference(
  targetBlobs: PitchBlob[],
  refBlobs: PitchBlob[],
  refDuration: number,
  targetDuration: number,
  pitch: Pick<PitchSettings, "keyRoot" | "scale" | "customNotes">,
): ReferenceAlignResult {
  if (refBlobs.length === 0 || refDuration <= 0 || targetDuration <= 0) {
    return { blobs: targetBlobs, matched: 0, unmatched: targetBlobs.length };
  }
  const scaleTime = targetDuration / refDuration;
  // Reference blobs mapped onto the target timeline.
  const mapped = refBlobs.map((b) => ({
    start: b.startTime * scaleTime,
    end: b.endTime * scaleTime,
    targetMidi: b.targetMidi,
  }));

  let matched = 0;
  const blobs = targetBlobs.map((tb) => {
    let best: { overlap: number; targetMidi: number } | null = null;
    for (const rb of mapped) {
      const overlap = Math.min(tb.endTime, rb.end) - Math.max(tb.startTime, rb.start);
      if (overlap > 0 && (!best || overlap > best.overlap)) {
        best = { overlap, targetMidi: rb.targetMidi };
      }
    }
    if (!best) return tb;
    matched++;
    const snapped = snapMidiToScale(best.targetMidi, pitch.keyRoot, pitch.scale, pitch.customNotes);
    return { ...tb, targetMidi: snapped };
  });

  return { blobs, matched, unmatched: targetBlobs.length - matched };
}
