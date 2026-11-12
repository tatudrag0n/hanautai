import { state, beatsToSeconds } from "./state.js";

export function quantizeValue(val, grid) {
  return Math.round(val / grid) * grid;
}

export function quantizeNote(note, grid, strength = 1) {
  const qStart = quantizeValue(note.start, grid);
  const qDur = Math.max(grid, quantizeValue(note.duration, grid));
  return {
    ...note,
    start: note.start + (qStart - note.start) * strength,
    duration: note.duration + (qDur - note.duration) * strength
  };
}

export function quantizeTrack(track, grid, strength, all = false) {
  track.notes = track.notes.map(n => quantizeNote(n, grid, strength));
}

// micro-timing correction: snap notes within window (ms) to grid
export function microCorrect(track, grid, windowBeats = 0.0625) {
  track.notes = track.notes.map(n => {
    const nearest = quantizeValue(n.start, grid);
    if (Math.abs(n.start - nearest) <= windowBeats) {
      return { ...n, start: nearest };
    }
    return n;
  });
}
