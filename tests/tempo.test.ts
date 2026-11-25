import { describe, expect, it } from "vitest";
import { detectTempo } from "../src/dsp/tempo";
import { timeStretchChannels } from "../src/dsp/timeStretch";

const SR = 44100;

function clickTrack(bpm: number, seconds: number, withOffbeat = false): Float32Array {
  const out = new Float32Array(Math.floor(SR * seconds));
  const interval = Math.floor((60 / bpm) * SR);
  for (let pos = 0; pos < out.length - 200; pos += interval) {
    for (let i = 0; i < 200; i++) out[pos + i] = Math.sin((i / 200) * Math.PI) * 0.9;
    if (withOffbeat) {
      const off = pos + Math.floor(interval / 2);
      if (off < out.length - 200) {
        for (let i = 0; i < 200; i++) out[off + i] = Math.sin((i / 200) * Math.PI) * 0.4;
      }
    }
  }
  return out;
}

describe("detectTempo", () => {
  it.each([100, 128, 160])("detects %i BPM clicks", (bpm) => {
    const est = detectTempo([clickTrack(bpm, 8, true)], SR);
    expect(est).not.toBeNull();
    expect(Math.abs(est!.bpm - bpm)).toBeLessThanOrEqual(2);
    expect(est!.confidence).toBeGreaterThan(0.2);
  });

  it("returns null for silence", () => {
    expect(detectTempo([new Float32Array(SR * 4)], SR)).toBeNull();
  });

  it("returns null for very short audio", () => {
    expect(detectTempo([clickTrack(120, 1)], SR)).toBeNull();
  });
});

function sine(freq: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.floor(SR * seconds));
  for (let i = 0; i < out.length; i++) out[i] = 0.5 * Math.sin((2 * Math.PI * freq * i) / SR);
  return out;
}

function countZeroCrossings(ch: Float32Array): number {
  let n = 0;
  for (let i = 1; i < ch.length; i++) {
    if ((ch[i - 1] < 0 && ch[i] >= 0) || (ch[i - 1] >= 0 && ch[i] < 0)) n++;
  }
  return n;
}

describe("timeStretchChannels", () => {
  it("lengthens by the requested factor and preserves pitch", () => {
    const input = sine(440, 2);
    const [out] = timeStretchChannels([input], 1.5);
    expect(out.length).toBeGreaterThan(input.length * 1.4);
    expect(out.length).toBeLessThan(input.length * 1.6);
    // Same number of zero crossings per second -> same pitch.
    const inRate = countZeroCrossings(input) / (input.length / SR);
    const outRate = countZeroCrossings(out) / (out.length / SR);
    expect(Math.abs(outRate - inRate) / inRate).toBeLessThan(0.05);
    expect(out.some((v) => Number.isNaN(v))).toBe(false);
  });

  it("shortens with factor < 1", () => {
    const input = sine(330, 2);
    const [out] = timeStretchChannels([input], 0.75);
    expect(out.length).toBeGreaterThan(input.length * 0.65);
    expect(out.length).toBeLessThan(input.length * 0.85);
  });

  it("keeps stereo channels the same length", () => {
    const [l, r] = timeStretchChannels([sine(440, 1.5), sine(440, 1.5)], 1.25);
    expect(l.length).toBe(r.length);
  });

  it("factor 1 returns an equal-length copy", () => {
    const input = sine(440, 1);
    const [out] = timeStretchChannels([input], 1);
    expect(out.length).toBe(input.length);
    expect(out).not.toBe(input);
  });
});

describe("detectTempo on the bundled demo stems (120 BPM)", () => {
  it("finds 120 on instrument / bass / harmony", async () => {
    const { createDemoStems } = await import("../src/dsp/demoAudio");
    const demo = createDemoStems(44100);
    // Note: the demo drums use dotted-quarter kicks (0, 1.5, 2.5) whose
    // onset pattern also supports an 80 BPM reading; that ambiguity is a
    // known limitation, so drums are not asserted here.
    for (const role of ["instrument", "bass", "harmony"] as const) {
      const stem = demo.stems.find((s) => s.role === role)!;
      const est = detectTempo(stem.channels, stem.sampleRate);
      expect(est, role).not.toBeNull();
      expect(Math.abs(est!.bpm - 120), role).toBeLessThanOrEqual(3);
    }
  });
});
