import { describe, expect, it } from "vitest";
import {
  computeDelaySeconds,
  dbToGain,
  gainToDb,
} from "../src/audio/audioEngine";
import {
  CHANNEL_FX_PRESETS,
  defaultMaster,
  defaultPitchSettings,
  defaultSpaceBus,
  defaultTrackFx,
  PITCH_PRESETS,
} from "../src/audio/presets";
import { compileTargetPitchCurve } from "../src/dsp/psola";
import type { PitchAnalysis } from "../src/types/studio";

describe("audio utilities & presets", () => {
  it("converts between dB and linear gain accurately", () => {
    expect(dbToGain(0)).toBeCloseTo(1, 6);
    expect(dbToGain(-6)).toBeCloseTo(0.501187, 4);
    expect(dbToGain(-60)).toBe(0);
    expect(gainToDb(1)).toBeCloseTo(0, 6);
    expect(gainToDb(0)).toBe(-60);
  });

  it("computes tempo-synced delay durations accurately", () => {
    // At 120 BPM, 1 beat = 0.5s
    expect(computeDelaySeconds("1/4", 200, 120)).toBeCloseTo(0.5, 6);
    expect(computeDelaySeconds("1/8", 200, 120)).toBeCloseTo(0.25, 6);
    expect(computeDelaySeconds("1/8D", 200, 120)).toBeCloseTo(0.375, 6);
    expect(computeDelaySeconds("1/16", 200, 120)).toBeCloseTo(0.125, 6);
    expect(computeDelaySeconds("free", 320, 120)).toBeCloseTo(0.32, 6);
  });

  it("provides complete valid role defaults and presets", () => {
    for (const role of ["vocal", "harmony", "instrument", "bass", "drums"] as const) {
      const fx = defaultTrackFx(role);
      expect(fx.order).toHaveLength(4);
      const pitch = defaultPitchSettings(role);
      expect(pitch.customNotes).toHaveLength(12);
    }
    expect(PITCH_PRESETS.length).toBeGreaterThanOrEqual(4);
    expect(CHANNEL_FX_PRESETS.length).toBeGreaterThanOrEqual(4);
    expect(defaultSpaceBus().reverbDecay).toBeGreaterThan(0.3);
    expect(defaultMaster().limiterCeilingDb).toBeLessThanOrEqual(0);
  });

  it("compiles retune speed smoothing and freehand drawn pitch overrides", () => {
    const analysis: PitchAnalysis = {
      sampleRate: 44100,
      hopSize: 256,
      frameSize: 2048,
      duration: 0.1,
      marks: [],
      blobs: [
        {
          id: "b1",
          startTime: 0,
          endTime: 0.1,
          rawMidi: 59.5, // 50 cents flat of C4
          targetMidi: 60,
          correctionOverride: null,
          vibratoScaleOverride: null,
          formantOverride: null,
          gainDb: 0,
          meanEnergy: 0.2,
        },
      ],
      waveformPeaks: new Float32Array(10),
      frames: Array.from({ length: 10 }, (_, i) => ({
        time: i * 0.01,
        freq: 254.18,
        midi: 59.5,
        confidence: 0.95,
        rms: 0.2,
        voiced: true,
      })),
    };

    const hard = compileTargetPitchCurve(
      analysis,
      analysis.blobs,
      defaultPitchSettings("vocal"),
      [],
    );
    // Drawn pitch override at 0.05s -> MIDI 64
    const withDraw = compileTargetPitchCurve(
      analysis,
      analysis.blobs,
      { ...defaultPitchSettings("vocal"), retuneSpeedMs: 0, correction: 1 },
      [
        { time: 0.04, midi: 64 },
        { time: 0.06, midi: 64 },
      ],
    );
    expect(hard.targetMidis[0]).toBeGreaterThan(59.5);
    expect(withDraw.targetMidis[5]).toBeCloseTo(64, 3);
  });
});
