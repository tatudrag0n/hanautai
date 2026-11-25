import type {
  MasterSettings,
  SpaceBusSettings,
  StudioProject,
  Track,
  TrackFxSettings,
  TrackRole,
} from "../types/studio";

/**
 * おまかせMIX (Auto Mix)
 * Analyzes each track's raw clip audio (peak / RMS), gain-stages every track
 * to a common reference, then applies role-based balance, EQ / comp /
 * saturation / modulation, spatial sends, pitch-correction defaults and
 * gentle master glue + limiting. Pure functions only — the store applies
 * the result and handles pitch reprocessing / key detection.
 */

export interface AudioStats {
  peak: number; // linear 0..n
  peakDb: number;
  rmsDb: number;
  samples: number;
}

const SILENCE_DB = -70;
/** Common loudness reference every track is staged to before role balance. */
const STAGE_TARGET_RMS_DB = -18;

export function analyzeChannels(channels: Float32Array[]): AudioStats {
  let peak = 0;
  let sumSq = 0;
  let count = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      const v = ch[i];
      const a = Math.abs(v);
      if (a > peak) peak = a;
      sumSq += v * v;
      count++;
    }
  }
  if (count === 0 || peak === 0) {
    return { peak: 0, peakDb: -Infinity, rmsDb: -Infinity, samples: count };
  }
  const rms = Math.sqrt(sumSq / count);
  return {
    peak,
    peakDb: 20 * Math.log10(peak),
    rmsDb: 20 * Math.log10(rms),
    samples: count,
  };
}

export function analyzeTrack(track: Track): AudioStats {
  let peak = 0;
  let sumSqWeighted = 0;
  let totalSamples = 0;
  for (const clip of track.clips) {
    const st = analyzeChannels(clip.rawChannels);
    if (st.samples === 0) continue;
    if (st.peak > peak) peak = st.peak;
    if (st.rmsDb > -Infinity) {
      const lin = Math.pow(10, st.rmsDb / 10); // power domain for weighting
      sumSqWeighted += lin * st.samples;
      totalSamples += st.samples;
    }
  }
  if (totalSamples === 0 || peak === 0) {
    return { peak: 0, peakDb: -Infinity, rmsDb: -Infinity, samples: totalSamples };
  }
  return {
    peak,
    peakDb: 20 * Math.log10(peak),
    rmsDb: 10 * Math.log10(sumSqWeighted / totalSamples),
    samples: totalSamples,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

/** Role loudness balance applied on the fader after common staging. */
const ROLE_VOLUME_DB: Record<TrackRole, number> = {
  vocal: 0,
  harmony: -4,
  bass: -3,
  drums: -2.5,
  instrument: -5,
};

function roleFx(role: TrackRole): TrackFxSettings {
  switch (role) {
    case "vocal":
      return {
        order: ["eq", "comp", "sat", "mod"],
        eq: { enabled: true, hpfEnabled: true, hpfFreq: 80, lowFreq: 200, lowGain: -1, midFreq: 3000, midGain: 2, midQ: 1, highFreq: 10000, highGain: 2 },
        comp: { enabled: true, threshold: -18, ratio: 3, attackMs: 10, releaseMs: 120, knee: 12, makeupDb: 3, deEsserAmount: 0.3, deEsserFreq: 6500, gateThreshold: -55 },
        sat: { enabled: true, mode: "tube", drive: 0.25, tone: 0.1, mix: 0.5 },
        mod: { enabled: true, mode: "doubler", rate: 0.4, depth: 0.3, mix: 0.15 },
      };
    case "harmony":
      return {
        order: ["eq", "comp", "sat", "mod"],
        eq: { enabled: true, hpfEnabled: true, hpfFreq: 100, lowFreq: 220, lowGain: -1, midFreq: 2800, midGain: 1, midQ: 1, highFreq: 10000, highGain: 1.5 },
        comp: { enabled: true, threshold: -20, ratio: 2.5, attackMs: 12, releaseMs: 140, knee: 12, makeupDb: 3, deEsserAmount: 0.2, deEsserFreq: 6500, gateThreshold: -58 },
        sat: { enabled: false, mode: "tube", drive: 0.15, tone: 0, mix: 0.4 },
        mod: { enabled: true, mode: "wide", rate: 0.5, depth: 0.4, mix: 0.25 },
      };
    case "instrument":
      return {
        order: ["eq", "comp", "sat", "mod"],
        eq: { enabled: true, hpfEnabled: true, hpfFreq: 60, lowFreq: 180, lowGain: 0, midFreq: 400, midGain: -1.5, midQ: 1, highFreq: 9000, highGain: 1 },
        comp: { enabled: true, threshold: -16, ratio: 2, attackMs: 15, releaseMs: 160, knee: 14, makeupDb: 2, deEsserAmount: 0, deEsserFreq: 6500, gateThreshold: -80 },
        sat: { enabled: true, mode: "tape", drive: 0.2, tone: 0, mix: 0.4 },
        mod: { enabled: false, mode: "chorus", rate: 0.6, depth: 0.3, mix: 0.2 },
      };
    case "bass":
      return {
        order: ["eq", "comp", "sat", "mod"],
        eq: { enabled: true, hpfEnabled: true, hpfFreq: 35, lowFreq: 100, lowGain: 2, midFreq: 300, midGain: -2, midQ: 1, highFreq: 4000, highGain: 0 },
        comp: { enabled: true, threshold: -14, ratio: 4, attackMs: 20, releaseMs: 150, knee: 10, makeupDb: 3, deEsserAmount: 0, deEsserFreq: 6500, gateThreshold: -80 },
        sat: { enabled: true, mode: "tape", drive: 0.15, tone: -0.1, mix: 0.3 },
        mod: { enabled: false, mode: "chorus", rate: 0.5, depth: 0.2, mix: 0.15 },
      };
    case "drums":
      return {
        order: ["eq", "comp", "sat", "mod"],
        eq: { enabled: true, hpfEnabled: true, hpfFreq: 40, lowFreq: 120, lowGain: 1, midFreq: 500, midGain: -1, midQ: 1, highFreq: 11000, highGain: 3 },
        comp: { enabled: true, threshold: -12, ratio: 3, attackMs: 5, releaseMs: 80, knee: 8, makeupDb: 2, deEsserAmount: 0, deEsserFreq: 6500, gateThreshold: -80 },
        sat: { enabled: true, mode: "crisp", drive: 0.2, tone: 0.15, mix: 0.35 },
        mod: { enabled: false, mode: "chorus", rate: 0.5, depth: 0.2, mix: 0.15 },
      };
  }
}

const ROLE_SENDS: Record<TrackRole, { reverb: number; delay: number }> = {
  vocal: { reverb: 0.25, delay: 0.08 },
  harmony: { reverb: 0.32, delay: 0.1 },
  instrument: { reverb: 0.16, delay: 0.05 },
  bass: { reverb: 0.05, delay: 0 },
  drums: { reverb: 0.12, delay: 0 },
};

function rolePan(role: TrackRole, indexAmongRole: number): number {
  switch (role) {
    case "harmony":
      return indexAmongRole % 2 === 0 ? -0.18 : 0.18;
    case "instrument":
      return indexAmongRole % 2 === 0 ? -0.22 : 0.22;
    default:
      return 0;
  }
}

export interface AutoMixResult {
  project: StudioProject;
  /** Tracks whose settings were changed. */
  mixedTrackIds: string[];
  /** Vocal/harmony tracks (pitch reprocess / key detection targets). */
  vocalTrackIds: string[];
  /** Vocal/harmony tracks that already have pitch analysis (key detection possible). */
  analyzedVocalTrackIds: string[];
  summary: string;
}

/**
 * Build the auto-mixed project. Returns null when no track has audible clips.
 * Key root / scale are intentionally left untouched here — the store runs
 * key detection afterwards for analyzed vocal tracks.
 */
export function buildAutoMixProject(project: StudioProject): AutoMixResult | null {
  const roleCounters = new Map<TrackRole, number>();
  const mixedTrackIds: string[] = [];
  const vocalTrackIds: string[] = [];
  const analyzedVocalTrackIds: string[] = [];

  const tracks = project.tracks.map((track) => {
    if (track.clips.length === 0) return track;
    const stats = analyzeTrack(track);
    if (stats.rmsDb <= SILENCE_DB || stats.rmsDb === -Infinity) return track;

    const roleIndex = roleCounters.get(track.role) ?? 0;
    roleCounters.set(track.role, roleIndex + 1);

    // Gain staging: normalize RMS to the common reference, but never let
    // the staged peak exceed -1 dBFS.
    let trim = STAGE_TARGET_RMS_DB - stats.rmsDb;
    const peakHeadroom = -1 - stats.peakDb;
    trim = Math.min(trim, peakHeadroom);
    const trimDb = round1(clamp(trim, -18, 18));

    const isVocalLike = track.role === "vocal" || track.role === "harmony";
    if (isVocalLike) {
      vocalTrackIds.push(track.id);
      if (track.clips.some((c) => c.analysis)) analyzedVocalTrackIds.push(track.id);
    }
    mixedTrackIds.push(track.id);

    const sends = ROLE_SENDS[track.role];
    return {
      ...track,
      trimDb,
      volumeDb: ROLE_VOLUME_DB[track.role],
      pan: rolePan(track.role, roleIndex),
      sendReverb: sends.reverb,
      sendDelay: sends.delay,
      fx: roleFx(track.role),
      pitch: isVocalLike
        ? {
            ...track.pitch,
            enabled: true,
            bypass: false,
            scaleLock: true,
            correction: track.role === "vocal" ? 0.85 : 0.8,
            retuneSpeedMs: 40,
          }
        : track.pitch,
    };
  });

  if (mixedTrackIds.length === 0) return null;

  const master: MasterSettings = {
    ...project.master,
    glueEnabled: true,
    glueThreshold: -12,
    glueRatio: 2.5,
    limiterEnabled: true,
    limiterCeilingDb: -1,
    width: 1.05,
    eqHighDb: Math.max(project.master.eqHighDb, 1),
  };
  const spaceBus: SpaceBusSettings = {
    ...project.spaceBus,
    reverbType: "plate",
    reverbDecay: 1.8,
  };

  return {
    project: { ...project, tracks, master, spaceBus },
    mixedTrackIds,
    vocalTrackIds,
    analyzedVocalTrackIds,
    summary: `${mixedTrackIds.length}トラックを解析してバランス・EQ・コンプ・空間系を自動調整`,
  };
}
