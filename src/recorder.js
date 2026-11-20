import { YinDetector, freqToMidi, rms } from "./pitch.js";
import { state } from "./state.js";
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
    this.cancelled = false;
    this.started = false;
  }

  async start() {
    if (this.started || this.cancelled) throw new Error("Recorder cannot be restarted");
    this.started = true;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("HTTPS または localhost が必要です。");
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.ctx = ctx;
      await ctx.resume();
      if (this.cancelled) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
      if (this.cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      this.source = ctx.createMediaStreamSource(stream);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.source.connect(this.analyser);
      this.detector = new YinDetector(ctx.sampleRate, 80, 500);
      this.buffer = new Float32Array(this.analyser.fftSize);
      this._loop();
    } catch (err) {
      await this.stop();
      throw err;
    }
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
    this.cancelled = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    const ctx = this.ctx;
    this.ctx = null;
    this.analyser = null;
    this.source = null;
    this.onFrame = null;
    if (ctx) { try { await ctx.close(); } catch (err) { console.warn("AudioContext close failed", err); } }
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
    const bpm = opts.bpm ?? state.bpm;
    const secondsToBeats = seconds => seconds * bpm / 60;
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
