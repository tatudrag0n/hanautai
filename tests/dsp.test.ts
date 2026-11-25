import { describe, expect, it } from "vitest";
import {
  analyzePitch,
  splitPitchBlob,
  yinDetectWindow,
} from "../src/dsp/pitchAnalysis";
import { synthesizePsola } from "../src/dsp/psola";
import {
  detectKeyAndScale,
  freqToMidi,
  midiToFreq,
  snapMidiToScale,
} from "../src/dsp/musicTheory";
import {
  buildWaveshaperCurve,
  computeCompressorOutputDb,
  computeEqCurveDb,
} from "../src/dsp/biquadResponse";
import { generateReverbIr } from "../src/dsp/reverbIR";
import { encodeWav } from "../src/dsp/wavExport";
import { createDemoStems } from "../src/dsp/demoAudio";
import type { PitchSettings } from "../src/types/studio";

function makeHarmonicVoice(
  freq: number,
  durationSec: number,
  sr: number,
  vibratoHz = 0,
  vibratoSemi = 0,
): Float32Array {
  const len = Math.round(durationSec * sr);
  const out = new Float32Array(len);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const f =
      freq *
      Math.pow(
        2,
        (Math.sin(2 * Math.PI * vibratoHz * t) * vibratoSemi) / 12,
      );
    phase += f / sr;
    // Harmonic-rich glottal-like signal
    const s =
      0.55 * Math.sin(2 * Math.PI * phase) +
      0.28 * Math.sin(4 * Math.PI * phase) +
      0.14 * Math.sin(6 * Math.PI * phase) +
      0.06 * Math.sin(8 * Math.PI * phase);
    const env = Math.min(1, t / 0.02) * Math.min(1, (durationSec - t) / 0.02);
    out[i] = s * env * 0.5;
  }
  return out;
}

function rmsOf(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / Math.max(1, buf.length));
}

function defaultPitchSettings(overrides: Partial<PitchSettings> = {}): PitchSettings {
  return {
    enabled: true,
    bypass: false,
    keyRoot: 0,
    scale: "major",
    customNotes: new Array(12).fill(true),
    scaleLock: true,
    correction: 1,
    retuneSpeedMs: 0,
    vibratoCut: 0,
    formantShift: 0,
    preserveConsonants: true,
    ...overrides,
  };
}

describe("musicTheory", () => {
  it("snaps pitches cleanly to C major and Hirajoshi scales", () => {
    // C#4 (61.2) in C major should snap to D4 (62) or C4 (60)
    expect(snapMidiToScale(60.6, 0, "major")).toBe(60); // C4 closer than D4 (1.4 away)
    expect(snapMidiToScale(61.4, 0, "major")).toBe(62); // D4 (0.6 away)
    // C Hirajoshi: C(0), D(2), Eb(3), G(7), Ab(8)
    expect(snapMidiToScale(64.1, 0, "hirajoshi")).toBe(63); // Eb4
  });

  it("auto-detects C major from demo vocal stem", () => {
    const demo = createDemoStems(44100);
    const vocal = demo.stems[0];
    const analysis = analyzePitch(vocal.channels, vocal.sampleRate, 0, "major");
    expect(analysis.blobs.length).toBeGreaterThanOrEqual(10);
    const detected = detectKeyAndScale(analysis.frames, analysis.blobs);
    expect(detected.keyRoot).toBe(0); // C
    expect(detected.scale).toBe("major");
  });
});

describe("pitchAnalysis + TD-PSOLA", () => {
  it("detects harmonic fundamental within 5 cents via YIN", () => {
    const sr = 44100;
    const signal = makeHarmonicVoice(261.63, 0.8, sr); // C4
    const res = yinDetectWindow(signal, Math.round(sr * 0.2), sr, 2048);
    expect(res.confidence).toBeGreaterThan(0.95);
    const detectedMidi = freqToMidi(res.freq);
    expect(Math.abs(detectedMidi - 60)).toBeLessThan(0.05);
  });

  it("shifts pitch up (+5 st) and down (-5 st) accurately while preserving length & RMS", () => {
    const sr = 44100;
    // Sing A3 (MIDI 57, 220Hz) slightly flat by -35 cents
    const inputMidi = 56.65;
    const raw = makeHarmonicVoice(midiToFreq(inputMidi), 1.0, sr);
    const analysis = analyzePitch([raw], sr, 0, "chromatic");
    expect(analysis.blobs.length).toBe(1);

    // 1. Shift UP to D4 (MIDI 62)
    const upBlobs = analysis.blobs.map((b) => ({ ...b, targetMidi: 62 }));
    const upOut = synthesizePsola(
      [raw],
      analysis,
      upBlobs,
      defaultPitchSettings({ scale: "chromatic", correction: 1, retuneSpeedMs: 0 }),
    );
    expect(upOut[0].length).toBe(raw.length);
    for (let i = 0; i < upOut[0].length; i++) {
      expect(Number.isFinite(upOut[0][i])).toBe(true);
    }

    const upAnalysis = analyzePitch(upOut, sr, 0, "chromatic");
    expect(upAnalysis.blobs.length).toBeGreaterThanOrEqual(1);
    expect(Math.abs(upAnalysis.blobs[0].rawMidi - 62)).toBeLessThan(0.2);

    const inRms = rmsOf(raw);
    const upRms = rmsOf(upOut[0]);
    expect(Math.abs(20 * Math.log10(upRms / inRms))).toBeLessThan(3.0);

    // 2. Shift DOWN to E3 (MIDI 52)
    const downBlobs = analysis.blobs.map((b) => ({ ...b, targetMidi: 52 }));
    const downOut = synthesizePsola(
      [raw],
      analysis,
      downBlobs,
      defaultPitchSettings({ scale: "chromatic", correction: 1, retuneSpeedMs: 0 }),
    );
    const downAnalysis = analyzePitch(downOut, sr, 0, "chromatic");
    expect(Math.abs(downAnalysis.blobs[0].rawMidi - 52)).toBeLessThan(0.2);
    const downRms = rmsOf(downOut[0]);
    expect(Math.abs(20 * Math.log10(downRms / inRms))).toBeLessThan(2.5);
  });

  it("flattens vibrato when vibratoCut=1 while keeping center pitch exact", () => {
    const sr = 44100;
    // Sing C4 (60) with ±0.6 semitone vibrato
    const raw = makeHarmonicVoice(midiToFreq(60), 1.2, sr, 5.5, 0.6);
    const analysis = analyzePitch([raw], sr, 0, "major");

    const flatOut = synthesizePsola(
      [raw],
      analysis,
      analysis.blobs.map((b) => ({ ...b, targetMidi: 60 })),
      defaultPitchSettings({ correction: 1, vibratoCut: 1, retuneSpeedMs: 0 }),
    );
    const flatAnalysis = analyzePitch(flatOut, sr, 0, "major");
    const voicedMidis = flatAnalysis.frames
      .filter((f) => f.voiced && f.time > 0.15 && f.time < 1.05)
      .map((f) => f.midi);
    const spread = Math.max(...voicedMidis) - Math.min(...voicedMidis);
    expect(spread).toBeLessThan(0.25); // Original vibrato spread was 1.2 semitones!
  });

  it("supports formant shifting cleanly without corrupting F0", () => {
    const sr = 44100;
    const raw = makeHarmonicVoice(midiToFreq(60), 0.7, sr);
    const analysis = analyzePitch([raw], sr, 0, "major");
    const shifted = synthesizePsola(
      [raw],
      analysis,
      analysis.blobs.map((b) => ({ ...b, targetMidi: 60 })),
      defaultPitchSettings({ formantShift: 4 }),
    );
    const reAnalysis = analyzePitch(shifted, sr, 0, "major");
    expect(Math.abs(reAnalysis.blobs[0].rawMidi - 60)).toBeLessThan(0.2);
    for (let i = 0; i < shifted[0].length; i++) {
      expect(Math.abs(shifted[0][i])).toBeLessThan(1.5);
    }
  });

  it("splits pitch blobs cleanly and preserves note timeline", () => {
    const sr = 44100;
    const raw = makeHarmonicVoice(midiToFreq(64), 1.0, sr);
    const analysis = analyzePitch([raw], sr, 0, "major");
    expect(analysis.blobs.length).toBe(1);
    const split = splitPitchBlob(
      analysis.blobs,
      analysis.blobs[0].id,
      0.5,
      analysis.frames,
    );
    expect(split.length).toBe(2);
    expect(split[0].endTime).toBeCloseTo(0.5, 4);
    expect(split[1].startTime).toBeCloseTo(0.5, 4);
  });
});

describe("EQ, Compressor, Reverb IR, and WAV Encoder", () => {
  it("evaluates analytical EQ and compressor curves accurately", () => {
    const curve = computeEqCurveDb(
      {
        enabled: true,
        hpfEnabled: true,
        hpfFreq: 100,
        lowFreq: 120,
        lowGain: 0,
        midFreq: 1000,
        midGain: 6,
        midQ: 1.5,
        highFreq: 8000,
        highGain: 0,
      },
      [40, 1000, 10000],
      48000,
    );
    expect(curve[0]).toBeLessThan(-10); // HPF attenuates 40Hz
    expect(curve[1]).toBeCloseTo(6, 0); // Mid boost +6dB at 1kHz

    const outBelow = computeCompressorOutputDb(-30, {
      enabled: true,
      threshold: -20,
      ratio: 4,
      attackMs: 10,
      releaseMs: 100,
      knee: 0,
      makeupDb: 0,
      deEsserAmount: 0,
      deEsserFreq: 6500,
      gateThreshold: -80,
    });
    expect(outBelow).toBeCloseTo(-30, 5);

    const outAbove = computeCompressorOutputDb(-12, {
      enabled: true,
      threshold: -20,
      ratio: 4,
      attackMs: 10,
      releaseMs: 100,
      knee: 0,
      makeupDb: 3,
      deEsserAmount: 0,
      deEsserFreq: 6500,
      gateThreshold: -80,
    });
    // -20 + (-12 - -20)/4 + 3 = -20 + 2 + 3 = -15
    expect(outAbove).toBeCloseTo(-15, 5);

    const ws = buildWaveshaperCurve("tube", 0.5, 256);
    expect(ws.length).toBe(256);
    expect(ws[0]).toBeLessThan(0);
    expect(ws[255]).toBeGreaterThan(0);
  });

  it("generates bounded stereo reverb impulse responses", () => {
    const ir = generateReverbIr("plate", 1.8, 12, 6000, 1.0, 44100);
    expect(ir.left.length).toBe(ir.right.length);
    expect(ir.left.length).toBeGreaterThan(44100);
    for (let i = 0; i < ir.left.length; i++) {
      expect(Number.isFinite(ir.left[i])).toBe(true);
      expect(Number.isFinite(ir.right[i])).toBe(true);
    }
  });

  it("encodes valid RIFF WAVE 16-bit PCM file", () => {
    const wav = encodeWav([new Float32Array([0, 0.5, -0.5, 1, -1])], 44100, 16);
    const view = new DataView(wav);
    const riff = String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3),
    );
    const wave = String.fromCharCode(
      view.getUint8(8),
      view.getUint8(9),
      view.getUint8(10),
      view.getUint8(11),
    );
    expect(riff).toBe("RIFF");
    expect(wave).toBe("WAVE");
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(40, true)).toBe(10); // 5 samples * 2 bytes
  });

  it("generates all 5 musical demo stems cleanly without clipping", () => {
    const demo = createDemoStems(44100);
    expect(demo.stems.length).toBe(5);
    for (const s of demo.stems) {
      expect(s.channels.length).toBeGreaterThanOrEqual(1);
      for (const ch of s.channels) {
        let peak = 0;
        for (let i = 0; i < ch.length; i++) {
          const a = Math.abs(ch[i]);
          if (a > peak) peak = a;
        }
        expect(peak).toBeGreaterThan(0.05);
        expect(peak).toBeLessThanOrEqual(1.0);
      }
    }
  });
});
