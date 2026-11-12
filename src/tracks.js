import { state, newTrackId } from "./state.js";
import { createInstrument, isDrum, LEGACY_MAP } from "./instruments.js";
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
    this.gain = new Tone.Gain(this.volume);
    this.panner = new Tone.Panner(this.pan);
    this.part = null;
    this.rebuildSynth();
  }

  rebuildSynth() {
    if (this.synth) { try { if (this.synth.output && this.synth.output.input) this.synth.output.input.disconnect(); } catch (e) {} }
    this.synth = createInstrument(this.instrument, this.gain && this.gain.context ? this.gain.context.rawContext : null);
    const connectOutput = () => {
      try {
        if (this.synth.output && this.synth.output.input && this.gain && this.gain.input) {
          this.synth.output.input.connect(this.gain.input);
        }
      } catch (e) { console.warn("connect failed", e); }
    };
    if (this.synth.ready && typeof this.synth.ready.then === "function") {
      this.synth.ready.then(connectOutput).catch(() => {});
    } else {
      connectOutput();
    }
    this.gain.connect(this.panner);
  }

  connectTo(fxInput) {
    this.panner.connect(fxInput);
  }

  disconnect() {
    try { this.panner.disconnect(); } catch (e) {}
  }

  rebuildPart(transport) {
    if (this.part) { try { this.part.dispose(); } catch (e) {} this.part = null; }
    const events = this.notes.map(n => ({
      time: n.start,
      note: Tone.Frequency(n.pitch, "midi").toNote(),
      midiPitch: n.pitch,
      dur: n.duration,
      vel: n.velocity
    }));
    this.part = new Tone.Part((time, ev) => {
      if (this.mute) return;
      const anySolo = state.tracks.some(t => t.solo);
      if (anySolo && !this.solo) return;
      const durSec = ev.dur * (60 / state.bpm);
      const vel = Math.max(1, Math.round(ev.vel * 127));
      try {
        if (isDrum(this.instrument)) {
          const groups = (typeof this.synth.getGroupNames === "function") ? this.synth.getGroupNames() : [];
          const midiPitch = ev.midiPitch || 60;
          const g = groups.length ? groups[midiPitch % groups.length] : "kick";
          this.synth.start({ name: g, time, velocity: vel });
        } else {
          this.synth.start({ note: ev.note, duration: durSec, time, velocity: vel });
        }
      } catch (e) { console.warn("play failed", e); }
    }, events);
    this.part.loop = true;
    this.part.loopStart = state.loop.start;
    this.part.loopEnd = state.loop.end;
    if (state.isPlaying) this.part.start(0);
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
    const t = new Track(o.name, LEGACY_MAP[o.instrument] || o.instrument);
    t.id = o.id;
    t.color = o.color;
    t.volume = o.volume; t.pan = o.pan; t.mute = o.mute; t.solo = o.solo;
    t.notes = o.notes.map(n => ({...n}));
    t.gain.gain.value = t.volume;
    t.panner.pan.value = t.pan;
    t.rebuildSynth();
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
  const t = state.tracks[idx];
  t.disconnect();
  try { t.synth.dispose(); } catch (e) {}
  try { t.gain.dispose(); t.panner.dispose(); } catch (e) {}
  if (t.part) try { t.part.dispose(); } catch (e) {}
  state.tracks.splice(idx, 1);
  if (state.activeTrackId === id) state.activeTrackId = state.tracks[0]?.id || null;
}

export function rebuildAllParts() {
  state.tracks.forEach(t => t.rebuildPart());
}
