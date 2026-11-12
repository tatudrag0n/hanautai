// Global application state
export const state = {
  bpm: 120,
  timeSig: 4,
  isPlaying: false,
  isRecording: false,
  tracks: [],
  activeTrackId: null,
  grid: 1,
  quantStrength: 0.8,
  zoom: 48, // px per beat
  scrollX: 0,
  scrollY: 0,
  selectedNote: null, // {trackId, noteIndex}
  loop: { enabled: true, start: 0, end: 16 },
  effects: {
    reverb: 0.25, delay: 0.15, chorus: 0, eqLow: 0, eqMid: 0, eqHigh: 0, dist: 0, comp: 0.3
  }
};

export function beatsToSeconds(b) { return b * (60 / state.bpm); }
export function secondsToBeats(s) { return s * (state.bpm / 60); }

let trackCounter = 0;
export function newTrackId() { return `t${++trackCounter}`; }
export function newNoteId() { return `n${Date.now()}_${Math.random().toString(36).slice(2,7)}`; }
