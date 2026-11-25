import { describe, expect, it } from "vitest";
import { analyzeChannels, analyzeTrack, buildAutoMixProject } from "../src/audio/autoMix";
import {
  defaultMaster,
  defaultPitchSettings,
  defaultSpaceBus,
  defaultTrackFx,
} from "../src/audio/presets";
import type { AudioClip, StudioProject, Track, TrackRole } from "../src/types/studio";

let seq = 0;
function createTrack(role: TrackRole, name: string): Track {
  seq += 1;
  return {
    id: `t${seq}`,
    name,
    role,
    color: "#38bdf8",
    trimDb: 0,
    phaseInvert: false,
    volumeDb: 0,
    pan: 0,
    mute: false,
    solo: false,
    armed: false,
    sendReverb: 0,
    sendDelay: 0,
    pitch: defaultPitchSettings(role),
    fx: defaultTrackFx(role),
    clips: [],
  };
}

function createDemoProject(): StudioProject {
  return {
    name: "Test",
    bpm: 120,
    timeSig: 4,
    tracks: [],
    spaceBus: defaultSpaceBus(),
    master: defaultMaster(),
    loop: { enabled: false, startTime: 0, endTime: 0 },
  };
}

function sine(freq: number, amp: number, seconds: number, sr = 44100): Float32Array {
  const out = new Float32Array(Math.floor(sr * seconds));
  for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / sr);
  return out;
}

function clipWith(channels: Float32Array[]): AudioClip {
  return {
    id: "c1",
    name: "clip",
    startTime: 0,
    offset: 0,
    duration: 1,
    totalDuration: 1,
    gainDb: 0,
    fadeIn: 0,
    fadeOut: 0,
    rawChannels: channels,
    sampleRate: 44100,
    waveformPeaks: [],
    analysis: null,
    blobs: [],
    drawnPitch: [],
    processedChannels: null,
  };
}

describe("analyzeChannels", () => {
  it("measures peak and RMS of a sine wave", () => {
    const st = analyzeChannels([sine(440, 0.5, 1)]);
    expect(st.peak).toBeCloseTo(0.5, 2);
    // sine RMS = amp / sqrt(2) -> about -9.03 dBFS for amp 0.5
    expect(st.rmsDb).toBeCloseTo(-9.03, 1);
  });

  it("reports silence as -Infinity", () => {
    const st = analyzeChannels([new Float32Array(1024)]);
    expect(st.rmsDb).toBe(-Infinity);
    expect(st.peak).toBe(0);
  });
});

describe("buildAutoMixProject", () => {
  it("returns null when no track has audible clips", () => {
    const project = createDemoProject();
    const silent = { ...project, tracks: project.tracks.map((t) => ({ ...t, clips: [] })) };
    expect(buildAutoMixProject(silent)).toBeNull();
  });

  it("gain-stages a quiet vocal and applies role balance + fx", () => {
    const vocal = createTrack("vocal", "Lead");
    vocal.clips = [clipWith([sine(220, 0.05, 1)])]; // very quiet: RMS about -29 dB
    const project = { ...createDemoProject(), tracks: [vocal] };
    const res = buildAutoMixProject(project);
    expect(res).not.toBeNull();
    const t = res!.project.tracks[0];
    // trim should boost toward the -18 dB reference (about +11 dB)
    expect(t.trimDb).toBeGreaterThan(8);
    expect(t.trimDb).toBeLessThanOrEqual(18);
    expect(t.volumeDb).toBe(0); // vocal sits on top
    expect(t.fx.comp.enabled).toBe(true);
    expect(t.fx.eq.hpfEnabled).toBe(true);
    expect(t.pitch.enabled).toBe(true);
    expect(t.pitch.correction).toBeCloseTo(0.85);
    expect(res!.vocalTrackIds).toContain(t.id);
    // master glue + limiter switched on
    expect(res!.project.master.glueEnabled).toBe(true);
    expect(res!.project.master.limiterEnabled).toBe(true);
    expect(res!.project.master.limiterCeilingDb).toBe(-1);
  });

  it("never lets a hot track clip: peak headroom caps the trim", () => {
    const inst = createTrack("instrument", "Synth");
    inst.clips = [clipWith([sine(330, 0.98, 1)])]; // peak already near 0 dBFS
    const project = { ...createDemoProject(), tracks: [inst] };
    const res = buildAutoMixProject(project);
    const t = res!.project.tracks[0];
    // peak -0.17 dB -> trim must stay below about -0.8 dB despite RMS target
    expect(t.trimDb).toBeLessThanOrEqual(-0.8);
    expect(t.volumeDb).toBe(-5); // instruments sit under the vocal
  });

  it("leaves clip-less tracks untouched", () => {
    const empty = createTrack("drums", "Drums");
    const vocal = createTrack("vocal", "Lead");
    vocal.clips = [clipWith([sine(220, 0.2, 1)])];
    const project = { ...createDemoProject(), tracks: [empty, vocal] };
    const res = buildAutoMixProject(project);
    expect(res!.project.tracks[0]).toBe(empty);
    expect(res!.mixedTrackIds).toEqual([vocal.id]);
  });

  it("analyzeTrack aggregates multiple clips", () => {
    const t = createTrack("vocal", "Lead");
    t.clips = [clipWith([sine(220, 0.5, 1)]), clipWith([sine(220, 0.5, 1)])];
    const st = analyzeTrack(t);
    expect(st.rmsDb).toBeCloseTo(-9.03, 1);
    expect(st.samples).toBe(44100 * 2);
  });
});
