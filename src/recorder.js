import { YinDetector, freqToMidi, rms } from "./pitch.js";
import { state, secondsToBeats } from "./state.js";
import { newNoteId } from "./state.js";

export class Recorder {
  constructor() {
    this.ctx = null;
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this.detector = null;
    this.buffer = null;
    this.rafId = null;
    this.frames = []; // {time, midi, conf, rms}
    this.onFrame = null; // callback
    this.onStatus = null;
  }

  async start() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    await this.ctx.resume();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.0;
    this.source.connect(this.analyser);
    // input gain
    this.detector = new YinDetector(this.ctx.sampleRate, 80, 500);
    this.buffer = new Float32Array(this.analyser.fftSize);
    this.frames = [];
    this._loop();
  }

  _loop() {
    const tick = () => {
      if (!this.analyser) return;
      this.analyser.getFloatTimeDomainData(this.buffer);
      const r = rms(this.buffer);
      const { freq, confidence } = this.detector.detect(this.buffer);
      const midi = freq > 0 ? freqToMidi(freq) : -1;
      const now = this.ctx.currentTime;
      const frame = { time: now, midi, freq, confidence, rms: r };
      this.frames.push(frame);
      if (this.onFrame) this.onFrame(frame);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  async stop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
    if (this.ctx) { try { await this.ctx.close(); } catch (e) {} }
    this.ctx = null;
    this.analyser = null;
    this.source = null;
  }

  // Convert recorded frames into notes for a track
  buildNotes(opts = {}) {
    const sensitivity = opts.sensitivity ?? 0.2;
    const minDur = opts.minNoteDur ?? 0.15;
    const gain = opts.inputGain ?? 1.0;
    const minFrames = opts.minFrames ?? 6;
    // filter frames by confidence & rms
    const valid = this.frames.map(f => {
      const confOk = f.confidence >= sensitivity;
      const rmsOk = f.rms * gain >= 0.015;
      const midiRound = confOk && rmsOk && f.midi > 0 ? Math.round(f.midi) : -1;
      return { ...f, midiRound };
    });
    // segment
    const notes = [];
    let current = null;
    for (let i = 0; i < valid.length; i++) {
      const f = valid[i];
      if (f.midiRound >= 0) {
        if (!current || current.midi !== f.midiRound) {
          if (current) this._finalizeNote(current, minDur, minFrames, notes);
          current = { midi: f.midiRound, start: f.time, end: f.time, rmsSum: f.rms, count: 1 };
        } else {
          current.end = f.time;
          current.rmsSum += f.rms;
          current.count++;
        }
      } else {
        if (current) { this._finalizeNote(current, minDur, minFrames, notes); current = null; }
      }
    }
    if (current) this._finalizeNote(current, minDur, minFrames, notes);
    // convert times to beats relative to recording start
    const t0 = this.frames.length ? this.frames[0].time : 0;
    // We'll store start as seconds since first frame; caller converts? We'll convert to beats here using state bpm at build time.
    const bpm = state.bpm;
    const out = notes.map(n => {
      const startSec = n.start - t0;
      const durSec = Math.max(minDur, n.end - n.start + (1/60));
      return {
        id: newNoteId(),
        pitch: n.midi,
        start: secondsToBeats(Math.max(0, startSec)),
        duration: secondsToBeats(Math.max(minDur, durSec)),
        velocity: Math.min(1, Math.max(0.3, (n.rmsAvg * gain)))
      };
    });
    return out;
  }

  _finalizeNote(cur, minDur, minFrames, notes) {
    const frameInterval = this.frames.length > 1 ? (this.frames[1].time - this.frames[0].time) : 1/60;
    cur.end = Math.max(cur.end, cur.start + frameInterval);
    cur.rmsAvg = cur.rmsSum / cur.count;
    if (cur.count < (minFrames || 1)) return; // ignore short noise
    notes.push(cur);
  }
}
