import { state, newTrackId } from "./state.js";
import { createInstrument } from "./instruments.js";
import * as Tone from "tone";

const TRACK_COLORS = ["#7c5cff","#00d4ff","#ff5c7a","#4ade80","#fbbf24","#f472b6","#38bdf8","#a78bfa"];

export class Track {
  constructor(name, instrument = "acoustic_grand_piano") {
    this.id = newTrackId();
    this.name = name || `Track ${state.tracks.length + 1}`;
    this.instrument = instrument;
    this.color = TRACK_COLORS[state.tracks.length % TRACK_COLORS.length];
    this.volume = 0.8;
    this.pan = 0;
    this.mute = false;
    this.solo = false;
    this.notes = []; // {id, pitch, start(beats), duration(beats), velocity}
    this.synth = null;
    this.output = null;
    this.gain = new Tone.Gain(this.volume);
    this.panner = new Tone.Panner(this.pan);
    this.part = null;
    this.gain.connect(this.panner);
  }

  rebuildSynth() {
    this.clearSynth();
    this.synth = createInstrument(this.instrument);
    this.synth.connect(this.gain);
  }

  clearSynth() {
    this.synth?.dispose();
    this.synth = null;
  }

  connectTo(fxInput) {
    if (this.output === fxInput) return;
    this.disconnect();
    this.panner.connect(fxInput);
    this.output = fxInput;
  }

  disconnect() {
    this.panner.disconnect();
    this.output = null;
  }

  clearPart() {
    this.part?.dispose();
    this.part = null;
  }

  dispose() {
    this.clearPart();
    this.clearSynth();
    this.gain.dispose();
    this.panner.dispose();
  }

  rebuildPart() {
    this.clearPart();
    const events = this.notes.map(n => ({
      time: beatTime(n.start),
      note: Tone.Frequency(n.pitch, "midi").toNote(),
      dur: n.duration,
      vel: n.velocity
    }));
    this.part = new Tone.Part((time, ev) => {
      if (this.mute || !this.synth || this.synth.loaded === false) return;
      const anySolo = state.tracks.some(t => t.solo);
      if (anySolo && !this.solo) return;
      const durSec = ev.dur * (60 / state.bpm);
      try {
        this.synth.triggerAttackRelease(ev.note, durSec, time, ev.vel);
      } catch (e) { console.warn("play failed", e); }
    }, events);
    this.part.start(0);
  }

  addNote(note) {
    this.notes.push(note);
  }

  removeNote(idx) {
    this.notes.splice(idx, 1);
  }

  clear() { this.notes = []; }

  toJSON() {
    return {
      id: this.id, name: this.name, instrument: this.instrument, color: this.color,
      volume: this.volume, pan: this.pan, mute: this.mute, solo: this.solo,
      notes: this.notes.map(n => ({...n}))
    };
  }

  static fromJSON(o) {
    const t = new Track(o.name, o.instrument);
    t.id = o.id;
    t.color = o.color;
    t.volume = o.volume; t.pan = o.pan; t.mute = o.mute; t.solo = o.solo;
    t.notes = o.notes.map(n => ({...n}));
    t.gain.gain.value = t.volume;
    t.panner.pan.value = t.pan;
    return t;
  }
}

export function createTrack(instrument) {
  const t = new Track(null, instrument);
  state.tracks.push(t);
  if (!state.activeTrackId) state.activeTrackId = t.id;
  return t;
}

export function activeTrack() {
  return state.tracks.find(t => t.id === state.activeTrackId) || state.tracks[0];
}

export function removeTrack(id) {
  const idx = state.tracks.findIndex(t => t.id === id);
  if (idx < 0) return;
  state.tracks[idx].dispose();
  state.tracks.splice(idx, 1);
  if (state.activeTrackId === id) state.activeTrackId = state.tracks[0]?.id || null;
}

export function rebuildAllParts() {
  state.tracks.forEach(t => t.rebuildPart());
}

export function beatTime(beat) {
  return `${Math.round(beat * Tone.Transport.PPQ)}i`;
}
