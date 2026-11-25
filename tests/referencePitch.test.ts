import { describe, expect, it } from "vitest";
import { alignBlobsToReference } from "../src/audio/referencePitch";
import type { PitchBlob } from "../src/types/studio";

function blob(id: string, start: number, end: number, targetMidi: number): PitchBlob {
  return {
    id,
    startTime: start,
    endTime: end,
    rawMidi: targetMidi,
    targetMidi,
    correctionOverride: null,
    vibratoScaleOverride: null,
    formantOverride: null,
    gainDb: 0,
    meanEnergy: 0.5,
  };
}

const pitchC = { keyRoot: 0, scale: "major" as const, customNotes: Array(12).fill(false) };

describe("alignBlobsToReference", () => {
  it("adopts the reference note with the longest overlap", () => {
    const target = [blob("t1", 0, 1, 60), blob("t2", 1, 2, 62)];
    const ref = [blob("r1", 0, 1, 64), blob("r2", 1, 2, 65)];
    const res = alignBlobsToReference(target, ref, 2, 2, pitchC);
    expect(res.matched).toBe(2);
    expect(res.blobs[0].targetMidi).toBe(64); // E4, in C major
    expect(res.blobs[1].targetMidi).toBe(65); // F4
  });

  it("scales the reference timeline proportionally", () => {
    // Reference is half the target duration: ref 0-1s maps to target 0-2s.
    const target = [blob("t1", 0, 2, 60), blob("t2", 2, 4, 60)];
    const ref = [blob("r1", 0, 0.5, 67), blob("r2", 0.5, 1, 69)];
    const res = alignBlobsToReference(target, ref, 1, 4, pitchC);
    expect(res.blobs[0].targetMidi).toBe(67); // G4
    expect(res.blobs[1].targetMidi).toBe(69); // A4
  });

  it("snaps adopted notes to the track scale", () => {
    const target = [blob("t1", 0, 1, 60)];
    const ref = [blob("r1", 0, 1, 66)]; // F#4 is outside C major -> snaps to F4 or G4
    const res = alignBlobsToReference(target, ref, 1, 1, pitchC);
    expect([65, 67]).toContain(res.blobs[0].targetMidi);
  });

  it("keeps original targets where the reference has no note", () => {
    const target = [blob("t1", 0, 1, 60), blob("t2", 3, 4, 62)];
    const ref = [blob("r1", 0, 1, 64)];
    const res = alignBlobsToReference(target, ref, 4, 4, pitchC);
    expect(res.matched).toBe(1);
    expect(res.unmatched).toBe(1);
    expect(res.blobs[1].targetMidi).toBe(62);
  });

  it("handles an empty reference gracefully", () => {
    const target = [blob("t1", 0, 1, 60)];
    const res = alignBlobsToReference(target, [], 0, 1, pitchC);
    expect(res.matched).toBe(0);
    expect(res.blobs).toBe(target);
  });
});
