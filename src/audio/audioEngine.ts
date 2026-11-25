import { buildWaveshaperCurve } from "../dsp/biquadResponse";
import { midiToFreq } from "../dsp/musicTheory";
import { yinDetectWindow } from "../dsp/pitchAnalysis";
import { generateReverbIr } from "../dsp/reverbIR";
import type {
  AudioClip,
  DelaySync,
  FxModuleId,
  MasterSettings,
  MeterLevels,
  SpaceBusSettings,
  StudioProject,
  Track,
} from "../types/studio";

export function dbToGain(db: number): number {
  if (db <= -59.5) return 0;
  return Math.pow(10, db / 20);
}

export function gainToDb(gain: number): number {
  if (gain <= 1e-5) return -60;
  return Math.max(-60, 20 * Math.log10(gain));
}

export function computeDelaySeconds(
  sync: DelaySync,
  freeMs: number,
  bpm: number,
): number {
  const beatSec = 60 / Math.max(40, bpm);
  switch (sync) {
    case "1/4":
      return beatSec;
    case "1/8":
      return beatSec * 0.5;
    case "1/8D":
      return beatSec * 0.75;
    case "1/16":
      return beatSec * 0.25;
    default:
      return Math.max(0.02, Math.min(1.5, freeMs / 1000));
  }
}

interface TrackAudioNodes {
  trackId: string;
  inputGain: GainNode;
  trimGain: GainNode;
  insertIn: GainNode;
  insertOut: GainNode;
  // EQ
  eqIn: GainNode;
  eqHpf: BiquadFilterNode;
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  eqOut: GainNode;
  // Comp + De-Esser
  compIn: GainNode;
  deEsserFilter: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  compMakeup: GainNode;
  compOut: GainNode;
  // Saturation
  satIn: GainNode;
  satDry: GainNode;
  satPre: GainNode;
  satShaper: WaveShaperNode;
  satTone: BiquadFilterNode;
  satWet: GainNode;
  satOut: GainNode;
  // Modulation / Doubler
  modIn: GainNode;
  modDry: GainNode;
  modSplit: ChannelSplitterNode;
  modDelayL: DelayNode;
  modDelayR: DelayNode;
  modLfo: OscillatorNode;
  modLfoDepthL: GainNode;
  modLfoDepthR: GainNode;
  modMerge: ChannelMergerNode;
  modWet: GainNode;
  modOut: GainNode;
  // Channel Output & Meters
  faderGain: GainNode;
  panner: StereoPannerNode;
  muteSoloGain: GainNode;
  sendReverb: GainNode;
  sendDelay: GainNode;
  analyserSplit: ChannelSplitterNode;
  analyserL: AnalyserNode;
  analyserR: AnalyserNode;
  analyserSpectrum: AnalyserNode;
  currentOrder: FxModuleId[];
}

interface MasterBusNodes {
  sumGain: GainNode;
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  glueComp: DynamicsCompressorNode;
  msIn: GainNode;
  msSplit: ChannelSplitterNode;
  midSum: GainNode;
  sideDiffL: GainNode;
  sideDiffR: GainNode;
  sideWidthGain: GainNode;
  sideNeg: GainNode;
  msMerge: ChannelMergerNode;
  limiter: DynamicsCompressorNode;
  safetyClip: WaveShaperNode;
  masterFader: GainNode;
  analyserSplit: ChannelSplitterNode;
  analyserL: AnalyserNode;
  analyserR: AnalyserNode;
  analyserSpectrum: AnalyserNode;
}

interface SpaceBusNodes {
  reverbIn: GainNode;
  reverbConvolver: ConvolverNode;
  reverbHpf: BiquadFilterNode;
  reverbReturn: GainNode;
  delayIn: GainNode;
  delayL: DelayNode;
  delayR: DelayNode;
  delayFbLL: GainNode;
  delayFbLR: GainNode;
  delayFbRL: GainNode;
  delayFbRR: GainNode;
  delayHighCutL: BiquadFilterNode;
  delayHighCutR: BiquadFilterNode;
  delayMerge: ChannelMergerNode;
  delayReturn: GainNode;
  lastIrSignature: string;
}

interface ActiveSource {
  trackId: string;
  clipId: string;
  source: AudioBufferSourceNode;
  gainNode: GainNode;
}

class StudioAudioEngine {
  private ctx: AudioContext | null = null;
  private trackNodes = new Map<string, TrackAudioNodes>();
  private masterNodes: MasterBusNodes | null = null;
  private spaceNodes: SpaceBusNodes | null = null;
  private clipBufferCache = new WeakMap<Float32Array, AudioBuffer>();

  // Transport state
  private isPlaying = false;
  private playheadTime = 0;
  private lastTickCtxTime = 0;
  private activeSources: ActiveSource[] = [];
  private schedulerTimer: number | null = null;
  private lastProjectRef: StudioProject | null = null;
  private metronomeEnabled = false;
  private lastMetronomeBeat = -1;

  // Meter smoothing state
  private meterMap = new Map<string, MeterLevels>();
  private meterScratchL = new Float32Array(new ArrayBuffer(256 * 4));
  private meterScratchR = new Float32Array(new ArrayBuffer(256 * 4));
  private eqSpecScratch = new Float32Array(new ArrayBuffer(1024 * 4));

  // Mic recording state
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micWorklet: AudioWorkletNode | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micMuteGain: GainNode | null = null;
  private recordedChunks: Float32Array[] = [];
  private workletLoaded = false;
  private micTimeScratch = new Float32Array(new ArrayBuffer(2048 * 4));

  public ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
    }
    return this.ctx;
  }

  public async resume(): Promise<AudioContext> {
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    if (!this.masterNodes) {
      this.initLiveBus(ctx);
    }
    return ctx;
  }

  public getSampleRate(): number {
    return this.ctx?.sampleRate ?? 44100;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getPlayheadTime(): number {
    if (!this.isPlaying || !this.ctx) return this.playheadTime;
    const now = this.ctx.currentTime;
    const dt = Math.max(0, now - this.lastTickCtxTime);
    let t = this.playheadTime + dt;
    const loop = this.lastProjectRef?.loop;
    if (loop?.enabled && loop.endTime > loop.startTime + 0.05) {
      const span = loop.endTime - loop.startTime;
      if (t >= loop.endTime) {
        t = loop.startTime + ((t - loop.startTime) % span);
      }
    }
    return t;
  }

  public setMetronome(enabled: boolean): void {
    this.metronomeEnabled = enabled;
  }

  private createGraphInContext(
    ctx: BaseAudioContext,
    project: StudioProject,
    liveCache?: Map<string, TrackAudioNodes>,
  ): { master: MasterBusNodes; space: SpaceBusNodes; tracks: Map<string, TrackAudioNodes> } {
    // 1. Build Master Bus
    const sumGain = ctx.createGain();
    const eqLow = ctx.createBiquadFilter();
    eqLow.type = "lowshelf";
    eqLow.frequency.value = 110;

    const eqMid = ctx.createBiquadFilter();
    eqMid.type = "peaking";
    eqMid.frequency.value = 1400;
    eqMid.Q.value = 0.8;

    const eqHigh = ctx.createBiquadFilter();
    eqHigh.type = "highshelf";
    eqHigh.frequency.value = 7500;

    const glueComp = ctx.createDynamicsCompressor();
    glueComp.attack.value = 0.02;
    glueComp.release.value = 0.16;
    glueComp.knee.value = 6;

    // Mid/Side matrix
    const msIn = ctx.createGain();
    const msSplit = ctx.createChannelSplitter(2);
    const midSum = ctx.createGain();
    midSum.gain.value = 0.5;
    const sideDiffL = ctx.createGain();
    sideDiffL.gain.value = 0.5;
    const sideDiffR = ctx.createGain();
    sideDiffR.gain.value = -0.5;
    const sideWidthGain = ctx.createGain();
    const sideNeg = ctx.createGain();
    sideNeg.gain.value = -1;
    const msMerge = ctx.createChannelMerger(2);

    msIn.connect(msSplit);
    msSplit.connect(midSum, 0);
    msSplit.connect(midSum, 1);
    msSplit.connect(sideDiffL, 0);
    msSplit.connect(sideDiffR, 1);
    sideDiffL.connect(sideWidthGain);
    sideDiffR.connect(sideWidthGain);

    midSum.connect(msMerge, 0, 0);
    midSum.connect(msMerge, 0, 1);
    sideWidthGain.connect(msMerge, 0, 0);
    sideWidthGain.connect(sideNeg);
    sideNeg.connect(msMerge, 0, 1);

    const limiter = ctx.createDynamicsCompressor();
    limiter.attack.value = 0.001;
    limiter.release.value = 0.06;
    limiter.knee.value = 0;

    const safetyClip = ctx.createWaveShaper();
    const clipCurve = new Float32Array(new ArrayBuffer(1024 * 4));
    for (let i = 0; i < 1024; i++) {
      const x = (i * 2) / 1023 - 1;
      clipCurve[i] = Math.tanh(x * 1.1) / Math.tanh(1.1);
    }
    safetyClip.curve = clipCurve;

    const masterFader = ctx.createGain();
    const analyserSplit = ctx.createChannelSplitter(2);
    const analyserL = ctx.createAnalyser();
    analyserL.fftSize = 256;
    const analyserR = ctx.createAnalyser();
    analyserR.fftSize = 256;
    const analyserSpectrum = ctx.createAnalyser();
    analyserSpectrum.fftSize = 2048;
    analyserSpectrum.smoothingTimeConstant = 0.78;

    sumGain.connect(eqLow);
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    eqHigh.connect(glueComp);
    glueComp.connect(msIn);
    msMerge.connect(limiter);
    limiter.connect(safetyClip);
    safetyClip.connect(masterFader);
    masterFader.connect(ctx.destination);
    masterFader.connect(analyserSpectrum);
    masterFader.connect(analyserSplit);
    analyserSplit.connect(analyserL, 0);
    analyserSplit.connect(analyserR, 1);

    const master: MasterBusNodes = {
      sumGain,
      eqLow,
      eqMid,
      eqHigh,
      glueComp,
      msIn,
      msSplit,
      midSum,
      sideDiffL,
      sideDiffR,
      sideWidthGain,
      sideNeg,
      msMerge,
      limiter,
      safetyClip,
      masterFader,
      analyserSplit,
      analyserL,
      analyserR,
      analyserSpectrum,
    };

    // 2. Build Send Space Buses (Reverb & Stereo Delay)
    const reverbIn = ctx.createGain();
    const reverbConvolver = ctx.createConvolver();
    const reverbHpf = ctx.createBiquadFilter();
    reverbHpf.type = "highpass";
    reverbHpf.frequency.value = 150;
    const reverbReturn = ctx.createGain();

    reverbIn.connect(reverbConvolver);
    reverbConvolver.connect(reverbHpf);
    reverbHpf.connect(reverbReturn);
    reverbReturn.connect(sumGain);

    const delayIn = ctx.createGain();
    const delayInSplit = ctx.createChannelSplitter(2);
    const delayL = ctx.createDelay(2.0);
    const delayR = ctx.createDelay(2.0);
    const delayFbLL = ctx.createGain();
    const delayFbLR = ctx.createGain();
    const delayFbRL = ctx.createGain();
    const delayFbRR = ctx.createGain();
    const delayHighCutL = ctx.createBiquadFilter();
    delayHighCutL.type = "lowpass";
    const delayHighCutR = ctx.createBiquadFilter();
    delayHighCutR.type = "lowpass";
    const delayMerge = ctx.createChannelMerger(2);
    const delayReturn = ctx.createGain();

    delayIn.connect(delayInSplit);
    delayInSplit.connect(delayL, 0);
    delayInSplit.connect(delayR, 1);

    delayL.connect(delayHighCutL);
    delayR.connect(delayHighCutR);

    delayHighCutL.connect(delayFbLL);
    delayHighCutL.connect(delayFbLR);
    delayHighCutR.connect(delayFbRL);
    delayHighCutR.connect(delayFbRR);

    delayFbLL.connect(delayL);
    delayFbRL.connect(delayL);
    delayFbLR.connect(delayR);
    delayFbRR.connect(delayR);

    delayHighCutL.connect(delayMerge, 0, 0);
    delayHighCutR.connect(delayMerge, 0, 1);
    delayMerge.connect(delayReturn);
    delayReturn.connect(sumGain);

    const space: SpaceBusNodes = {
      reverbIn,
      reverbConvolver,
      reverbHpf,
      reverbReturn,
      delayIn,
      delayL,
      delayR,
      delayFbLL,
      delayFbLR,
      delayFbRL,
      delayFbRR,
      delayHighCutL,
      delayHighCutR,
      delayMerge,
      delayReturn,
      lastIrSignature: "",
    };

    this.applyMasterParams(ctx, master, project.master);
    this.applySpaceParams(ctx, space, project.spaceBus, project.bpm);

    // 3. Build Track Channel Strips
    const tracks = new Map<string, TrackAudioNodes>();
    const hasSolo = project.tracks.some((t) => t.solo);
    for (const track of project.tracks) {
      const nodes = this.createTrackNodes(ctx, track, master, space);
      this.applyTrackParams(ctx, nodes, track, hasSolo);
      tracks.set(track.id, nodes);
      liveCache?.set(track.id, nodes);
    }

    return { master, space, tracks };
  }

  private createTrackNodes(
    ctx: BaseAudioContext,
    track: Track,
    master: MasterBusNodes,
    space: SpaceBusNodes,
  ): TrackAudioNodes {
    const inputGain = ctx.createGain();
    const trimGain = ctx.createGain();
    const insertIn = ctx.createGain();
    const insertOut = ctx.createGain();

    // EQ
    const eqIn = ctx.createGain();
    const eqHpf = ctx.createBiquadFilter();
    eqHpf.type = "highpass";
    eqHpf.Q.value = 0.707;
    const eqLow = ctx.createBiquadFilter();
    eqLow.type = "lowshelf";
    const eqMid = ctx.createBiquadFilter();
    eqMid.type = "peaking";
    const eqHigh = ctx.createBiquadFilter();
    eqHigh.type = "highshelf";
    const eqOut = ctx.createGain();
    eqIn.connect(eqHpf);
    eqHpf.connect(eqLow);
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    eqHigh.connect(eqOut);

    // Comp + De-Esser
    const compIn = ctx.createGain();
    const deEsserFilter = ctx.createBiquadFilter();
    deEsserFilter.type = "peaking";
    deEsserFilter.Q.value = 2.6;
    const compressor = ctx.createDynamicsCompressor();
    const compMakeup = ctx.createGain();
    const compOut = ctx.createGain();
    compIn.connect(deEsserFilter);
    deEsserFilter.connect(compressor);
    compressor.connect(compMakeup);
    compMakeup.connect(compOut);

    // Saturation
    const satIn = ctx.createGain();
    const satDry = ctx.createGain();
    const satPre = ctx.createGain();
    const satShaper = ctx.createWaveShaper();
    satShaper.oversample = "2x";
    const satTone = ctx.createBiquadFilter();
    satTone.type = "lowpass";
    satTone.frequency.value = 16000;
    const satWet = ctx.createGain();
    const satOut = ctx.createGain();
    satIn.connect(satDry);
    satDry.connect(satOut);
    satIn.connect(satPre);
    satPre.connect(satShaper);
    satShaper.connect(satTone);
    satTone.connect(satWet);
    satWet.connect(satOut);

    // Modulation / Doubler
    const modIn = ctx.createGain();
    const modDry = ctx.createGain();
    const modSplit = ctx.createChannelSplitter(2);
    const modDelayL = ctx.createDelay(0.1);
    const modDelayR = ctx.createDelay(0.1);
    modDelayL.delayTime.value = 0.012;
    modDelayR.delayTime.value = 0.019;
    const modLfo = ctx.createOscillator();
    modLfo.type = "sine";
    modLfo.frequency.value = 0.6;
    const modLfoDepthL = ctx.createGain();
    const modLfoDepthR = ctx.createGain();
    modLfo.connect(modLfoDepthL);
    modLfo.connect(modLfoDepthR);
    modLfoDepthL.connect(modDelayL.delayTime);
    modLfoDepthR.connect(modDelayR.delayTime);
    modLfo.start();
    const modMerge = ctx.createChannelMerger(2);
    const modWet = ctx.createGain();
    const modOut = ctx.createGain();

    modIn.connect(modDry);
    modDry.connect(modOut);
    modIn.connect(modSplit);
    modSplit.connect(modDelayL, 0);
    modSplit.connect(modDelayR, 1);
    modDelayL.connect(modMerge, 0, 0);
    modDelayR.connect(modMerge, 0, 1);
    modMerge.connect(modWet);
    modWet.connect(modOut);

    // Channel fader & routing
    const faderGain = ctx.createGain();
    const panner = ctx.createStereoPanner();
    const muteSoloGain = ctx.createGain();
    const sendReverb = ctx.createGain();
    const sendDelay = ctx.createGain();

    const analyserSplit = ctx.createChannelSplitter(2);
    const analyserL = ctx.createAnalyser();
    analyserL.fftSize = 256;
    const analyserR = ctx.createAnalyser();
    analyserR.fftSize = 256;
    const analyserSpectrum = ctx.createAnalyser();
    analyserSpectrum.fftSize = 2048;
    analyserSpectrum.smoothingTimeConstant = 0.78;

    inputGain.connect(trimGain);
    trimGain.connect(insertIn);
    insertOut.connect(faderGain);
    faderGain.connect(panner);
    panner.connect(muteSoloGain);

    muteSoloGain.connect(master.sumGain);
    muteSoloGain.connect(sendReverb);
    muteSoloGain.connect(sendDelay);
    sendReverb.connect(space.reverbIn);
    sendDelay.connect(space.delayIn);

    muteSoloGain.connect(analyserSpectrum);
    muteSoloGain.connect(analyserSplit);
    analyserSplit.connect(analyserL, 0);
    analyserSplit.connect(analyserR, 1);

    const nodes: TrackAudioNodes = {
      trackId: track.id,
      inputGain,
      trimGain,
      insertIn,
      insertOut,
      eqIn,
      eqHpf,
      eqLow,
      eqMid,
      eqHigh,
      eqOut,
      compIn,
      deEsserFilter,
      compressor,
      compMakeup,
      compOut,
      satIn,
      satDry,
      satPre,
      satShaper,
      satTone,
      satWet,
      satOut,
      modIn,
      modDry,
      modSplit,
      modDelayL,
      modDelayR,
      modLfo,
      modLfoDepthL,
      modLfoDepthR,
      modMerge,
      modWet,
      modOut,
      faderGain,
      panner,
      muteSoloGain,
      sendReverb,
      sendDelay,
      analyserSplit,
      analyserL,
      analyserR,
      analyserSpectrum,
      currentOrder: [],
    };

    this.rewireTrackInserts(nodes, track.fx.order);
    return nodes;
  }

  private rewireTrackInserts(nodes: TrackAudioNodes, order: FxModuleId[]): void {
    const sameOrder =
      nodes.currentOrder.length === order.length &&
      nodes.currentOrder.every((id, idx) => id === order[idx]);
    if (sameOrder) return;

    nodes.insertIn.disconnect();
    nodes.eqOut.disconnect();
    nodes.compOut.disconnect();
    nodes.satOut.disconnect();
    nodes.modOut.disconnect();

    const pairs: Record<FxModuleId, [GainNode, GainNode]> = {
      eq: [nodes.eqIn, nodes.eqOut],
      comp: [nodes.compIn, nodes.compOut],
      sat: [nodes.satIn, nodes.satOut],
      mod: [nodes.modIn, nodes.modOut],
    };

    let prev: AudioNode = nodes.insertIn;
    for (const id of order) {
      const [modIn, modOut] = pairs[id];
      prev.connect(modIn);
      prev = modOut;
    }
    prev.connect(nodes.insertOut);
    nodes.currentOrder = [...order];
  }

  private setParam(
    ctx: BaseAudioContext,
    param: AudioParam,
    value: number,
  ): void {
    if (ctx instanceof AudioContext) {
      param.setTargetAtTime(value, ctx.currentTime, 0.015);
    } else {
      param.value = value;
    }
  }

  private applyTrackParams(
    ctx: BaseAudioContext,
    nodes: TrackAudioNodes,
    track: Track,
    anySolo: boolean,
  ): void {
    this.rewireTrackInserts(nodes, track.fx.order);

    const trimLinear = dbToGain(track.trimDb) * (track.phaseInvert ? -1 : 1);
    this.setParam(ctx, nodes.trimGain.gain, trimLinear);
    this.setParam(ctx, nodes.faderGain.gain, dbToGain(track.volumeDb));
    this.setParam(ctx, nodes.panner.pan, track.pan);

    const mutedBySolo = anySolo && !track.solo;
    const audible = !track.mute && !mutedBySolo;
    this.setParam(ctx, nodes.muteSoloGain.gain, audible ? 1 : 0);

    this.setParam(ctx, nodes.sendReverb.gain, track.sendReverb);
    this.setParam(ctx, nodes.sendDelay.gain, track.sendDelay);

    // EQ
    const { eq, comp, sat, mod } = track.fx;
    if (eq.enabled) {
      this.setParam(ctx, nodes.eqHpf.frequency, eq.hpfEnabled ? eq.hpfFreq : 10);
      this.setParam(ctx, nodes.eqLow.frequency, eq.lowFreq);
      this.setParam(ctx, nodes.eqLow.gain, eq.lowGain);
      this.setParam(ctx, nodes.eqMid.frequency, eq.midFreq);
      this.setParam(ctx, nodes.eqMid.gain, eq.midGain);
      this.setParam(ctx, nodes.eqMid.Q, eq.midQ);
      this.setParam(ctx, nodes.eqHigh.frequency, eq.highFreq);
      this.setParam(ctx, nodes.eqHigh.gain, eq.highGain);
    } else {
      this.setParam(ctx, nodes.eqHpf.frequency, 10);
      this.setParam(ctx, nodes.eqLow.gain, 0);
      this.setParam(ctx, nodes.eqMid.gain, 0);
      this.setParam(ctx, nodes.eqHigh.gain, 0);
    }

    // Comp + De-Esser
    if (comp.enabled) {
      this.setParam(ctx, nodes.deEsserFilter.frequency, comp.deEsserFreq);
      this.setParam(ctx, nodes.deEsserFilter.gain, -12 * comp.deEsserAmount);
      this.setParam(ctx, nodes.compressor.threshold, comp.threshold);
      this.setParam(ctx, nodes.compressor.ratio, comp.ratio);
      this.setParam(ctx, nodes.compressor.attack, comp.attackMs / 1000);
      this.setParam(ctx, nodes.compressor.release, comp.releaseMs / 1000);
      this.setParam(ctx, nodes.compressor.knee, comp.knee);
      this.setParam(ctx, nodes.compMakeup.gain, dbToGain(comp.makeupDb));
    } else {
      this.setParam(ctx, nodes.deEsserFilter.gain, 0);
      this.setParam(ctx, nodes.compressor.threshold, 0);
      this.setParam(ctx, nodes.compressor.ratio, 1);
      this.setParam(ctx, nodes.compMakeup.gain, 1);
    }

    // Saturation
    if (sat.enabled) {
      nodes.satShaper.curve = buildWaveshaperCurve(sat.mode, sat.drive);
      this.setParam(ctx, nodes.satPre.gain, 1 + sat.drive * 1.6);
      const toneFreq =
        sat.tone >= 0
          ? 8500 + sat.tone * 11500
          : 8500 * Math.pow(2, sat.tone * 2.2);
      this.setParam(ctx, nodes.satTone.frequency, toneFreq);
      this.setParam(ctx, nodes.satDry.gain, 1 - sat.mix);
      this.setParam(ctx, nodes.satWet.gain, sat.mix);
    } else {
      this.setParam(ctx, nodes.satDry.gain, 1);
      this.setParam(ctx, nodes.satWet.gain, 0);
    }

    // Modulation / Doubler
    if (mod.enabled) {
      this.setParam(ctx, nodes.modLfo.frequency, mod.rate);
      const depthSec =
        mod.mode === "wide" ? 0.0012 * mod.depth : 0.0045 * mod.depth;
      this.setParam(ctx, nodes.modLfoDepthL.gain, depthSec);
      this.setParam(ctx, nodes.modLfoDepthR.gain, -depthSec);
      this.setParam(
        ctx,
        nodes.modDelayL.delayTime,
        mod.mode === "wide" ? 0.006 : 0.012,
      );
      this.setParam(
        ctx,
        nodes.modDelayR.delayTime,
        mod.mode === "wide" ? 0.015 : 0.019,
      );
      this.setParam(ctx, nodes.modDry.gain, 1 - mod.mix * 0.65);
      this.setParam(ctx, nodes.modWet.gain, mod.mix * 0.85);
    } else {
      this.setParam(ctx, nodes.modDry.gain, 1);
      this.setParam(ctx, nodes.modWet.gain, 0);
    }
  }

  private applyMasterParams(
    ctx: BaseAudioContext,
    master: MasterBusNodes,
    settings: MasterSettings,
  ): void {
    this.setParam(ctx, master.masterFader.gain, dbToGain(settings.volumeDb));
    this.setParam(ctx, master.eqLow.gain, settings.eqLowDb);
    this.setParam(ctx, master.eqMid.gain, settings.eqMidDb);
    this.setParam(ctx, master.eqHigh.gain, settings.eqHighDb);

    this.setParam(
      ctx,
      master.sideWidthGain.gain,
      settings.mono ? 0 : settings.width,
    );

    if (settings.glueEnabled) {
      this.setParam(ctx, master.glueComp.threshold, settings.glueThreshold);
      this.setParam(ctx, master.glueComp.ratio, settings.glueRatio);
    } else {
      this.setParam(ctx, master.glueComp.threshold, 0);
      this.setParam(ctx, master.glueComp.ratio, 1);
    }

    if (settings.limiterEnabled) {
      this.setParam(ctx, master.limiter.threshold, settings.limiterCeilingDb);
      this.setParam(ctx, master.limiter.ratio, 20);
    } else {
      this.setParam(ctx, master.limiter.threshold, 0);
      this.setParam(ctx, master.limiter.ratio, 1);
    }
  }

  private applySpaceParams(
    ctx: BaseAudioContext,
    space: SpaceBusNodes,
    settings: SpaceBusSettings,
    bpm: number,
  ): void {
    this.setParam(ctx, space.reverbReturn.gain, dbToGain(settings.reverbReturnDb));
    this.setParam(ctx, space.delayReturn.gain, dbToGain(settings.delayReturnDb));

    const irSig = `${settings.reverbType}:${settings.reverbDecay.toFixed(2)}:${settings.reverbPreDelayMs.toFixed(0)}:${settings.reverbDamping.toFixed(0)}:${settings.reverbWidth.toFixed(2)}:${ctx.sampleRate}`;
    if (space.lastIrSignature !== irSig) {
      space.lastIrSignature = irSig;
      const ir = generateReverbIr(
        settings.reverbType,
        settings.reverbDecay,
        settings.reverbPreDelayMs,
        settings.reverbDamping,
        settings.reverbWidth,
        ctx.sampleRate,
      );
      const buf = ctx.createBuffer(2, ir.left.length, ctx.sampleRate);
      buf.copyToChannel(new Float32Array(ir.left), 0);
      buf.copyToChannel(new Float32Array(ir.right), 1);
      space.reverbConvolver.buffer = buf;
    }

    const delaySec = computeDelaySeconds(
      settings.delaySync,
      settings.delayTimeMs,
      bpm,
    );
    this.setParam(ctx, space.delayL.delayTime, delaySec);
    this.setParam(
      ctx,
      space.delayR.delayTime,
      settings.delayPingPong ? delaySec * 1.5 : delaySec,
    );

    const fb = Math.max(0, Math.min(0.86, settings.delayFeedback));
    if (settings.delayPingPong) {
      this.setParam(ctx, space.delayFbLL.gain, 0);
      this.setParam(ctx, space.delayFbRR.gain, 0);
      this.setParam(ctx, space.delayFbLR.gain, fb);
      this.setParam(ctx, space.delayFbRL.gain, fb);
    } else {
      this.setParam(ctx, space.delayFbLL.gain, fb);
      this.setParam(ctx, space.delayFbRR.gain, fb);
      this.setParam(ctx, space.delayFbLR.gain, 0);
      this.setParam(ctx, space.delayFbRL.gain, 0);
    }

    this.setParam(ctx, space.delayHighCutL.frequency, settings.delayHighCut);
    this.setParam(ctx, space.delayHighCutR.frequency, settings.delayHighCut);
  }

  private initLiveBus(ctx: AudioContext): void {
    if (this.lastProjectRef) {
      const built = this.createGraphInContext(ctx, this.lastProjectRef);
      this.masterNodes = built.master;
      this.spaceNodes = built.space;
      this.trackNodes = built.tracks;
    }
  }

  public syncProject(project: StudioProject): void {
    this.lastProjectRef = project;
    if (!this.ctx) return;

    if (!this.masterNodes || !this.spaceNodes) {
      this.initLiveBus(this.ctx);
      return;
    }

    this.applyMasterParams(this.ctx, this.masterNodes, project.master);
    this.applySpaceParams(this.ctx, this.spaceNodes, project.spaceBus, project.bpm);

    const activeIds = new Set(project.tracks.map((t) => t.id));
    for (const [id, nodes] of this.trackNodes.entries()) {
      if (!activeIds.has(id)) {
        nodes.muteSoloGain.disconnect();
        nodes.sendReverb.disconnect();
        nodes.sendDelay.disconnect();
        try {
          nodes.modLfo.stop();
        } catch {
          // ignore
        }
        this.trackNodes.delete(id);
      }
    }

    const anySolo = project.tracks.some((t) => t.solo);
    for (const track of project.tracks) {
      let nodes = this.trackNodes.get(track.id);
      if (!nodes) {
        nodes = this.createTrackNodes(
          this.ctx,
          track,
          this.masterNodes,
          this.spaceNodes,
        );
        this.trackNodes.set(track.id, nodes);
      }
      this.applyTrackParams(this.ctx, nodes, track, anySolo);
    }
  }

  private getAudioBuffer(
    ctx: BaseAudioContext,
    clip: AudioClip,
  ): AudioBuffer {
    const channels = clip.processedChannels ?? clip.rawChannels;
    const key = channels[0];
    if (ctx === this.ctx && key) {
      const cached = this.clipBufferCache.get(key);
      if (cached && cached.numberOfChannels === channels.length) {
        return cached;
      }
    }

    const len = channels[0]?.length ?? 1;
    const buf = ctx.createBuffer(channels.length, len, clip.sampleRate);
    for (let c = 0; c < channels.length; c++) {
      buf.copyToChannel(new Float32Array(channels[c]), c);
    }
    if (ctx === this.ctx && key) {
      this.clipBufferCache.set(key, buf);
    }
    return buf;
  }

  private scheduleClipPlayback(
    ctx: BaseAudioContext,
    track: Track,
    clip: AudioClip,
    destination: AudioNode,
    playheadSec: number,
    ctxStartTime: number,
    windowEndSec: number,
    collect?: ActiveSource[],
  ): void {
    const clipStart = clip.startTime;
    const clipEnd = clip.startTime + clip.duration;
    if (clipEnd <= playheadSec || clipStart >= windowEndSec) return;

    const buf = this.getAudioBuffer(ctx, clip);
    const delayUntilStart = Math.max(0, clipStart - playheadSec);
    const when = ctxStartTime + delayUntilStart;

    const elapsedIntoClip = Math.max(0, playheadSec - clipStart);
    const bufferOffset = clip.offset + elapsedIntoClip;
    const playDuration = Math.min(
      clipEnd - Math.max(playheadSec, clipStart),
      windowEndSec - Math.max(playheadSec, clipStart),
      buf.duration - bufferOffset,
    );
    if (playDuration <= 0.002 || bufferOffset >= buf.duration) return;

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const clipGain = ctx.createGain();
    const baseGain = dbToGain(clip.gainDb);

    // Apply clip fade-in / fade-out envelope accurately
    clipGain.gain.setValueAtTime(baseGain, when);
    if (clip.fadeIn > 0.005 && elapsedIntoClip < clip.fadeIn) {
      const startRatio = elapsedIntoClip / clip.fadeIn;
      const fadeRem = clip.fadeIn - elapsedIntoClip;
      clipGain.gain.setValueAtTime(baseGain * startRatio, when);
      clipGain.gain.linearRampToValueAtTime(baseGain, when + fadeRem);
    }
    if (clip.fadeOut > 0.005) {
      const fadeOutStartRel = clip.duration - clip.fadeOut - elapsedIntoClip;
      const endWhen = when + playDuration;
      if (fadeOutStartRel < playDuration) {
        const foStart = when + Math.max(0, fadeOutStartRel);
        if (fadeOutStartRel < 0) {
          const curRatio = Math.max(0, (clip.duration - elapsedIntoClip) / clip.fadeOut);
          clipGain.gain.setValueAtTime(baseGain * curRatio, when);
        } else {
          clipGain.gain.setValueAtTime(baseGain, foStart);
        }
        clipGain.gain.linearRampToValueAtTime(0, endWhen);
      }
    }

    src.connect(clipGain);
    clipGain.connect(destination);
    src.start(when, bufferOffset, playDuration);

    collect?.push({
      trackId: track.id,
      clipId: clip.id,
      source: src,
      gainNode: clipGain,
    });
  }

  public async play(project: StudioProject, fromTime?: number): Promise<void> {
    const ctx = await this.resume();
    this.stopSourcesOnly();

    this.lastProjectRef = project;
    this.syncProject(project);

    const startAt = fromTime ?? this.playheadTime;
    this.playheadTime = Math.max(0, startAt);
    this.lastTickCtxTime = ctx.currentTime;
    this.isPlaying = true;
    this.lastMetronomeBeat = -1;

    this.scheduleCurrentSegment(ctx, project, this.playheadTime, ctx.currentTime);

    if (this.schedulerTimer !== null) {
      window.clearInterval(this.schedulerTimer);
    }
    this.schedulerTimer = window.setInterval(() => this.onTransportTick(), 25);
  }

  private scheduleCurrentSegment(
    ctx: AudioContext,
    project: StudioProject,
    fromSec: number,
    ctxTime: number,
  ): void {
    const loop = project.loop;
    const windowEnd =
      loop.enabled && loop.endTime > loop.startTime + 0.05 && fromSec < loop.endTime
        ? loop.endTime
        : 3600;

    for (const track of project.tracks) {
      const nodes = this.trackNodes.get(track.id);
      if (!nodes) continue;
      for (const clip of track.clips) {
        this.scheduleClipPlayback(
          ctx,
          track,
          clip,
          nodes.inputGain,
          fromSec,
          ctxTime,
          windowEnd,
          this.activeSources,
        );
      }
    }
  }

  private onTransportTick(): void {
    if (!this.isPlaying || !this.ctx || !this.lastProjectRef) return;
    const now = this.ctx.currentTime;
    const dt = now - this.lastTickCtxTime;
    this.lastTickCtxTime = now;
    this.playheadTime += dt;

    const project = this.lastProjectRef;
    const loop = project.loop;

    if (loop.enabled && loop.endTime > loop.startTime + 0.05) {
      if (this.playheadTime >= loop.endTime) {
        const overflow = this.playheadTime - loop.endTime;
        this.playheadTime =
          loop.startTime + (overflow % (loop.endTime - loop.startTime));
        this.stopSourcesOnly();
        this.scheduleCurrentSegment(this.ctx, project, this.playheadTime, now);
        this.lastMetronomeBeat = -1;
      }
    }

    // Metronome click
    if (this.metronomeEnabled) {
      const beatSec = 60 / Math.max(40, project.bpm);
      const curBeat = Math.floor(this.playheadTime / beatSec);
      if (curBeat !== this.lastMetronomeBeat) {
        this.lastMetronomeBeat = curBeat;
        const isDownbeat = curBeat % Math.max(1, project.timeSig) === 0;
        this.triggerClick(this.ctx, isDownbeat);
      }
    }
  }

  private triggerClick(ctx: AudioContext, downbeat: boolean): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = downbeat ? 1320 : 880;
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(downbeat ? 0.16 : 0.1, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  public hotSwapTrackAudio(track: Track): void {
    if (!this.isPlaying || !this.ctx || !this.lastProjectRef) return;
    const nodes = this.trackNodes.get(track.id);
    if (!nodes) return;

    const now = this.ctx.currentTime;
    const remaining: ActiveSource[] = [];
    for (const s of this.activeSources) {
      if (s.trackId === track.id) {
        try {
          s.gainNode.gain.setTargetAtTime(0, now, 0.004);
          s.source.stop(now + 0.02);
        } catch {
          // ignore
        }
      } else {
        remaining.push(s);
      }
    }
    this.activeSources = remaining;

    const curPos = this.getPlayheadTime();
    const loop = this.lastProjectRef.loop;
    const windowEnd =
      loop.enabled && loop.endTime > loop.startTime + 0.05 && curPos < loop.endTime
        ? loop.endTime
        : 3600;

    for (const clip of track.clips) {
      this.scheduleClipPlayback(
        this.ctx,
        track,
        clip,
        nodes.inputGain,
        curPos,
        now,
        windowEnd,
        this.activeSources,
      );
    }
  }

  public pause(): void {
    if (!this.isPlaying) return;
    this.playheadTime = this.getPlayheadTime();
    this.isPlaying = false;
    if (this.schedulerTimer !== null) {
      window.clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    this.stopSourcesOnly();
  }

  public stop(returnToTime = 0): void {
    this.isPlaying = false;
    if (this.schedulerTimer !== null) {
      window.clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    this.stopSourcesOnly();
    this.playheadTime = Math.max(0, returnToTime);
  }

  public seek(timeSec: number): void {
    const target = Math.max(0, timeSec);
    if (this.isPlaying && this.lastProjectRef && this.ctx) {
      this.playheadTime = target;
      this.lastTickCtxTime = this.ctx.currentTime;
      this.stopSourcesOnly();
      this.scheduleCurrentSegment(
        this.ctx,
        this.lastProjectRef,
        target,
        this.ctx.currentTime,
      );
    } else {
      this.playheadTime = target;
    }
  }

  private stopSourcesOnly(): void {
    for (const s of this.activeSources) {
      try {
        s.source.stop();
        s.source.disconnect();
        s.gainNode.disconnect();
      } catch {
        // ignore
      }
    }
    this.activeSources = [];
  }

  public async playReferenceTone(midi: number, durationSec = 0.28): Promise<void> {
    const ctx = await this.resume();
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    const freq = midiToFreq(midi);

    osc.type = "sine";
    osc.frequency.value = freq;
    osc2.type = "triangle";
    osc2.frequency.value = freq * 2;

    const g2 = ctx.createGain();
    g2.gain.value = 0.14;

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    osc2.connect(g2);
    g2.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + durationSec + 0.02);
    osc2.stop(now + durationSec + 0.02);
  }

  private readAnalyserPeakRms(analyser: AnalyserNode, buf: Float32Array<ArrayBufferLike>): [number, number] {
    analyser.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>);
    let peak = 0;
    let sumSq = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i];
      const a = Math.abs(v);
      if (a > peak) peak = a;
      sumSq += v * v;
    }
    return [peak, Math.sqrt(sumSq / buf.length)];
  }

  public sampleMeter(id: string): MeterLevels {
    const prev = this.meterMap.get(id) ?? {
      peakL: 0,
      peakR: 0,
      rmsL: 0,
      rmsR: 0,
      clipped: false,
      grDb: 0,
    };

    let analyserL: AnalyserNode | undefined;
    let analyserR: AnalyserNode | undefined;
    let grDb = 0;

    if (id === "master" && this.masterNodes) {
      analyserL = this.masterNodes.analyserL;
      analyserR = this.masterNodes.analyserR;
      grDb = this.masterNodes.glueComp.reduction;
    } else {
      const tn = this.trackNodes.get(id);
      if (tn) {
        analyserL = tn.analyserL;
        analyserR = tn.analyserR;
        grDb = tn.compressor.reduction;
      }
    }

    if (!analyserL || !analyserR || !this.isPlaying) {
      const decayed: MeterLevels = {
        peakL: prev.peakL * 0.84,
        peakR: prev.peakR * 0.84,
        rmsL: prev.rmsL * 0.8,
        rmsR: prev.rmsR * 0.8,
        clipped: prev.clipped,
        grDb: (prev.grDb ?? 0) * 0.8,
      };
      this.meterMap.set(id, decayed);
      return decayed;
    }

    const [pL, rL] = this.readAnalyserPeakRms(analyserL, this.meterScratchL);
    const [pR, rR] = this.readAnalyserPeakRms(analyserR, this.meterScratchR);

    const next: MeterLevels = {
      peakL: Math.max(pL, prev.peakL * 0.88),
      peakR: Math.max(pR, prev.peakR * 0.88),
      rmsL: rL * 0.4 + prev.rmsL * 0.6,
      rmsR: rR * 0.4 + prev.rmsR * 0.6,
      clipped: prev.clipped || pL >= 0.995 || pR >= 0.995,
      grDb,
    };
    this.meterMap.set(id, next);
    return next;
  }

  public clearClip(id: string): void {
    const m = this.meterMap.get(id);
    if (m) m.clipped = false;
  }

  public getSpectrumData(trackId: string | "master"): Float32Array | null {
    const analyser =
      trackId === "master"
        ? this.masterNodes?.analyserSpectrum
        : this.trackNodes.get(trackId)?.analyserSpectrum;
    if (!analyser) return null;
    analyser.getFloatFrequencyData(this.eqSpecScratch);
    return this.eqSpecScratch;
  }

  // ---- Microphone Recording ----

  public async startMicRecording(options: {
    monitorEnabled: boolean;
    livePitchShift: boolean;
    correction: number;
    scaleMask: boolean[];
  }): Promise<void> {
    const ctx = await this.resume();
    this.recordedChunks = [];

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("このブラウザはマイク録音に対応していません。");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    this.micStream = stream;
    this.micSource = ctx.createMediaStreamSource(stream);
    this.micAnalyser = ctx.createAnalyser();
    this.micAnalyser.fftSize = 2048;

    this.micSource.connect(this.micAnalyser);

    if (ctx.audioWorklet) {
      if (!this.workletLoaded) {
        const workletUrl = `${import.meta.env.BASE_URL}worklets/mic-capture-processor.js`;
        await ctx.audioWorklet.addModule(workletUrl);
        this.workletLoaded = true;
      }

      this.micWorklet = new AudioWorkletNode(ctx, "mic-capture-processor");
      this.micWorklet.port.onmessage = (e) => {
        if (e.data?.type === "chunk" && e.data.samples instanceof Float32Array) {
          this.recordedChunks.push(e.data.samples);
        }
      };
      this.micWorklet.port.postMessage({
        type: "config",
        recording: true,
        ...options,
      });

      this.micMuteGain = ctx.createGain();
      this.micMuteGain.gain.value = options.monitorEnabled ? 0.9 : 0;
      this.micSource.connect(this.micWorklet);
      this.micWorklet.connect(this.micMuteGain);
      this.micMuteGain.connect(ctx.destination);
    } else {
      // Fallback for restricted contexts without AudioWorklet
      const proc = ctx.createScriptProcessor(2048, 1, 1);
      proc.onaudioprocess = (ev) => {
        const inp = ev.inputBuffer.getChannelData(0);
        this.recordedChunks.push(new Float32Array(inp));
      };
      this.micMuteGain = ctx.createGain();
      this.micMuteGain.gain.value = 0;
      this.micSource.connect(proc);
      proc.connect(this.micMuteGain);
      this.micMuteGain.connect(ctx.destination);
    }
  }

  public updateMicConfig(options: {
    monitorEnabled?: boolean;
    livePitchShift?: boolean;
    correction?: number;
    scaleMask?: boolean[];
  }): void {
    if (this.micMuteGain && typeof options.monitorEnabled === "boolean") {
      this.micMuteGain.gain.value = options.monitorEnabled ? 0.9 : 0;
    }
    this.micWorklet?.port.postMessage({ type: "config", ...options });
  }

  public getLiveMicPitch(): { freq: number; midi: number; rms: number; voiced: boolean } {
    if (!this.micAnalyser || !this.ctx) {
      return { freq: 0, midi: 0, rms: 0, voiced: false };
    }
    this.micAnalyser.getFloatTimeDomainData(this.micTimeScratch);
    const res = yinDetectWindow(this.micTimeScratch, 0, this.ctx.sampleRate, 2048);
    const voiced = res.rms > 0.01 && res.confidence > 0.75 && res.freq > 60 && res.freq < 1050;
    const midi = voiced ? 69 + 12 * Math.log2(res.freq / 440) : 0;
    return { freq: voiced ? res.freq : 0, midi, rms: res.rms, voiced };
  }

  public stopMicRecording(): { channels: Float32Array[]; sampleRate: number } {
    const sr = this.ctx?.sampleRate ?? 44100;
    this.micWorklet?.port.postMessage({ type: "config", recording: false });

    try {
      this.micSource?.disconnect();
      this.micWorklet?.disconnect();
      this.micMuteGain?.disconnect();
      this.micAnalyser?.disconnect();
    } catch {
      // ignore
    }
    this.micStream?.getTracks().forEach((t) => t.stop());

    this.micStream = null;
    this.micSource = null;
    this.micWorklet = null;
    this.micMuteGain = null;
    this.micAnalyser = null;

    const totalLen = this.recordedChunks.reduce((s, c) => s + c.length, 0);
    const merged = new Float32Array(totalLen);
    let offset = 0;
    for (const ch of this.recordedChunks) {
      merged.set(ch, offset);
      offset += ch.length;
    }
    this.recordedChunks = [];
    return { channels: [merged], sampleRate: sr };
  }

  // ---- File Decode & Offline Render ----

  public async decodeAudioFile(
    arrayBuffer: ArrayBuffer,
  ): Promise<{ channels: Float32Array[]; sampleRate: number }> {
    const ctx = this.ensureContext();
    const audioBuf = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const channels: Float32Array[] = [];
    for (let c = 0; c < Math.min(2, audioBuf.numberOfChannels); c++) {
      channels.push(new Float32Array(audioBuf.getChannelData(c)));
    }
    return { channels, sampleRate: audioBuf.sampleRate };
  }

  public async renderMixOffline(
    project: StudioProject,
    options: { loopOnly?: boolean; soloTrackId?: string } = {},
  ): Promise<{ channels: Float32Array[]; sampleRate: number }> {
    const sampleRate = 44100;
    let startSec = 0;
    let endSec = project.loop.enabled ? project.loop.endTime : 0;

    if (options.loopOnly && project.loop.endTime > project.loop.startTime) {
      startSec = project.loop.startTime;
      endSec = project.loop.endTime;
    } else {
      for (const track of project.tracks) {
        for (const clip of track.clips) {
          endSec = Math.max(endSec, clip.startTime + clip.duration);
        }
      }
      // Tail for reverb/delay decay
      endSec = Math.max(1, endSec + 2.0);
    }

    const totalFrames = Math.max(sampleRate, Math.ceil((endSec - startSec) * sampleRate));
    const offline = new OfflineAudioContext(2, totalFrames, sampleRate);

    const exportProject: StudioProject = options.soloTrackId
      ? {
          ...project,
          tracks: project.tracks.map((t) => ({
            ...t,
            solo: t.id === options.soloTrackId,
            mute: t.id !== options.soloTrackId,
          })),
        }
      : project;

    const built = this.createGraphInContext(offline, exportProject);

    for (const track of exportProject.tracks) {
      const nodes = built.tracks.get(track.id);
      if (!nodes) continue;
      for (const clip of track.clips) {
        this.scheduleClipPlayback(
          offline,
          track,
          clip,
          nodes.inputGain,
          startSec,
          0,
          endSec,
        );
      }
    }

    const rendered = await offline.startRendering();
    const outL = new Float32Array(rendered.getChannelData(0));
    const outR =
      rendered.numberOfChannels > 1
        ? new Float32Array(rendered.getChannelData(1))
        : new Float32Array(outL);

    return { channels: [outL, outR], sampleRate };
  }
}

export const audioEngine = new StudioAudioEngine();
