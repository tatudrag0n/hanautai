export type FxModuleId = "eq" | "comp" | "sat" | "mod";

export type TrackRole = "vocal" | "harmony" | "instrument" | "bass" | "drums";

export type ScaleType =
  | "chromatic"
  | "major"
  | "minor"
  | "harmonicMinor"
  | "majorPentatonic"
  | "minorPentatonic"
  | "hirajoshi"
  | "custom";

export interface PitchFrame {
  time: number;
  freq: number; // 0 if unvoiced
  midi: number; // 0 if unvoiced
  confidence: number; // 0..1
  rms: number;
  voiced: boolean;
}

export interface PitchMark {
  sample: number;
  period: number;
  f0: number;
  voiced: boolean;
}

export interface PitchBlob {
  id: string;
  startTime: number;
  endTime: number;
  rawMidi: number;
  targetMidi: number;
  correctionOverride: number | null;
  vibratoScaleOverride: number | null;
  formantOverride: number | null;
  gainDb: number;
  meanEnergy: number;
}

export interface PitchAnalysis {
  sampleRate: number;
  hopSize: number;
  frameSize: number;
  duration: number;
  frames: PitchFrame[];
  marks: PitchMark[];
  blobs: PitchBlob[];
  waveformPeaks: Float32Array;
}

export interface PitchDrawPoint {
  time: number;
  midi: number;
}

export interface PitchSettings {
  enabled: boolean;
  bypass: boolean;
  keyRoot: number; // 0..11 (0 = C)
  scale: ScaleType;
  customNotes: boolean[]; // 12 booleans
  scaleLock: boolean;
  correction: number; // 0..1
  retuneSpeedMs: number; // 0..250
  vibratoCut: number; // -0.5..1 (1 = flat, 0 = natural, -0.5 = exaggerated)
  formantShift: number; // -12..12 semitones
  preserveConsonants: boolean;
}

export interface EqSettings {
  enabled: boolean;
  hpfEnabled: boolean;
  hpfFreq: number; // 20..400
  lowFreq: number; // 40..500
  lowGain: number; // -15..15
  midFreq: number; // 200..6000
  midGain: number; // -15..15
  midQ: number; // 0.3..10
  highFreq: number; // 2000..16000
  highGain: number; // -15..15
}

export interface CompSettings {
  enabled: boolean;
  threshold: number; // -50..0
  ratio: number; // 1..20
  attackMs: number; // 0.5..100
  releaseMs: number; // 10..1000
  knee: number; // 0..30
  makeupDb: number; // -6..24
  deEsserAmount: number; // 0..1
  deEsserFreq: number; // 4000..10000
  gateThreshold: number; // -80..-20 (-80 = off)
}

export type SatMode = "tube" | "tape" | "crisp" | "lofi";

export interface SatSettings {
  enabled: boolean;
  mode: SatMode;
  drive: number; // 0..1
  tone: number; // -1..1
  mix: number; // 0..1
}

export type ModMode = "doubler" | "chorus" | "wide";

export interface ModSettings {
  enabled: boolean;
  mode: ModMode;
  rate: number; // 0.1..5
  depth: number; // 0..1
  mix: number; // 0..1
}

export interface TrackFxSettings {
  order: FxModuleId[];
  eq: EqSettings;
  comp: CompSettings;
  sat: SatSettings;
  mod: ModSettings;
}

export interface AudioClip {
  id: string;
  name: string;
  startTime: number; // seconds on timeline
  offset: number; // trim offset into clip audio (seconds)
  duration: number; // active duration on timeline (seconds)
  totalDuration: number; // full raw buffer duration (seconds)
  gainDb: number; // -24..+12
  fadeIn: number; // seconds
  fadeOut: number; // seconds
  rawChannels: Float32Array[]; // mono or stereo PCM
  sampleRate: number;
  waveformPeaks: number[]; // downsampled min/max pairs for fast timeline render
  analysis: PitchAnalysis | null;
  blobs: PitchBlob[];
  drawnPitch: PitchDrawPoint[];
  processedChannels: Float32Array[] | null;
}

export interface Track {
  id: string;
  name: string;
  role: TrackRole;
  color: string;
  trimDb: number; // -18..18
  phaseInvert: boolean;
  volumeDb: number; // -60..6 (-60 treated as -inf)
  pan: number; // -1..1
  mute: boolean;
  solo: boolean;
  armed: boolean;
  sendReverb: number; // 0..1
  sendDelay: number; // 0..1
  pitch: PitchSettings;
  fx: TrackFxSettings;
  clips: AudioClip[];
}

export type ReverbType = "hall" | "plate" | "room" | "booth" | "cathedral";
export type DelaySync = "1/4" | "1/8" | "1/8D" | "1/16" | "free";

export interface SpaceBusSettings {
  reverbType: ReverbType;
  reverbReturnDb: number;
  reverbDecay: number; // 0.4..5.0
  reverbPreDelayMs: number; // 0..100
  reverbDamping: number; // 1500..14000
  reverbWidth: number; // 0..1
  delaySync: DelaySync;
  delayReturnDb: number;
  delayTimeMs: number; // 40..1000
  delayFeedback: number; // 0..0.85
  delayHighCut: number; // 1200..12000
  delayPingPong: boolean;
}

export interface MasterSettings {
  volumeDb: number; // -60..6
  mono: boolean;
  width: number; // 0..1.6
  eqLowDb: number; // -6..6
  eqMidDb: number; // -6..6
  eqHighDb: number; // -6..6
  glueEnabled: boolean;
  glueThreshold: number; // -30..0
  glueRatio: number; // 1.5..6
  limiterEnabled: boolean;
  limiterCeilingDb: number; // -3..0
}

export type TopViewTab = "pitch" | "effects" | "timeline";

export interface LoopRegion {
  enabled: boolean;
  startTime: number; // seconds
  endTime: number; // seconds
}

export interface StudioProject {
  name: string;
  bpm: number;
  timeSig: number; // beats per bar (4 or 3)
  tracks: Track[];
  spaceBus: SpaceBusSettings;
  master: MasterSettings;
  loop: LoopRegion;
}

export interface MeterLevels {
  peakL: number; // linear 0..2
  peakR: number;
  rmsL: number;
  rmsR: number;
  clipped: boolean;
  grDb?: number; // gain reduction dB (0 or negative)
}
