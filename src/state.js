import { defaultLoop, defaultEffects } from "./project.js";

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
  loop: defaultLoop(),
  effects: defaultEffects()
};

let trackCounter = 0;
export function newTrackId() {
  let id;
  do { id = `t${++trackCounter}`; } while (state.tracks.some(t => t.id === id));
  return id;
}
export function newNoteId() { return `n${Date.now()}_${Math.random().toString(36).slice(2,7)}`; }
