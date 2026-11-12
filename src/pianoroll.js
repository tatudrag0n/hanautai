import { state } from "./state.js";
import { activeTrack } from "./tracks.js";

const MIN_PITCH = 36;
const MAX_PITCH = 96;
const KEY_H = 12;
const LEFT = 44;

let canvas, ctx, container;
let drag = null; // {type, trackId, noteIndex, offsetX, orig}
let hover = null;
let onNotesChanged = null;
let onSelect = null;
export function setOnNotesChanged(fn) { onNotesChanged = fn; }
export function setOnSelect(fn) { onSelect = fn; }

export function initPianoRoll(canvasEl, containerEl) {
  canvas = canvasEl;
  container = containerEl;
  ctx = canvas.getContext("2d");
  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("mouseleave", onMouseUp);
  canvas.addEventListener("contextmenu", onContextMenu);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
}

export function resizeCanvas() {
  if (!canvas || !container) return;
  const beatsVisible = 64; // min width
  const totalBeats = Math.max(64, (state.loop.end || 16) + 16);
  const w = Math.max(container.clientWidth, totalBeats * state.zoom + LEFT + 40);
  const h = (MAX_PITCH - MIN_PITCH + 1) * KEY_H + 20;
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
}

function beatAtX(x) { return (x - LEFT) / state.zoom; }
function pitchAtY(y) { return MAX_PITCH - Math.floor(y / KEY_H); }
function xOfBeat(b) { return LEFT + b * state.zoom; }
function yOfPitch(p) { return (MAX_PITCH - p) * KEY_H; }

function noteRect(note) {
  const x = xOfBeat(note.start);
  const y = yOfPitch(note.pitch);
  const w = Math.max(4, note.duration * state.zoom);
  const h = KEY_H;
  return { x, y, w, h };
}

function findNote(x, y) {
  const t = activeTrack();
  if (!t) return null;
  // search topmost (last)
  for (let i = t.notes.length - 1; i >= 0; i--) {
    const n = t.notes[i];
    const r = noteRect(n);
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      const resize = x >= r.x + r.w - 6;
      return { trackId: t.id, index: i, resize };
    }
  }
  return null;
}

function onMouseDown(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left + container.scrollLeft;
  const y = e.clientY - rect.top + container.scrollTop;
  if (e.button === 2) return; // context menu handles
  const hit = findNote(x, y);
  if (hit) {
    const t = activeTrack();
    const note = t.notes[hit.index];
    drag = { type: hit.resize ? "resize" : "move", trackId: hit.trackId, index: hit.index, startX: x, startY: y, orig: { ...note } };
    state.selectedNote = { trackId: hit.trackId, noteIndex: hit.index };
    render();
    if (onSelect) onSelect();
    return;
  }
  // add note
  const beat = beatAtX(x);
  const pitch = pitchAtY(y);
  if (pitch < MIN_PITCH || pitch > MAX_PITCH) return;
  const grid = state.grid;
  const snapped = Math.round(beat / grid) * grid;
  const t = activeTrack();
  if (!t) return;
  const note = { id: (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())), pitch, start: Math.max(0, snapped), duration: grid, velocity: 0.8 };
  t.notes.push(note);
  state.selectedNote = { trackId: t.id, noteIndex: t.notes.length - 1 };
  drag = { type: "move", trackId: t.id, index: t.notes.length - 1, startX: x, startY: y, orig: { ...note } };
  render();
  if (onSelect) onSelect();
}

function onMouseMove(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left + container.scrollLeft;
  const y = e.clientY - rect.top + container.scrollTop;
  if (!drag) {
    const hit = findNote(x, y);
    canvas.style.cursor = hit ? (hit.resize ? "ew-resize" : "grab") : "crosshair";
    return;
  }
  const t = state.tracks.find(tr => tr.id === drag.trackId);
  if (!t) return;
  const note = t.notes[drag.index];
  const dx = (x - drag.startX) / state.zoom;
  const dy = y - drag.startY;
  const pitchShift = -Math.round(dy / KEY_H);
  if (drag.type === "move") {
    let newStart = drag.orig.start + dx;
    const grid = state.grid;
    // snap while dragging? light snap to grid
    newStart = Math.round(newStart / grid) * grid;
    let newPitch = drag.orig.pitch + pitchShift;
    newPitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, newPitch));
    note.start = Math.max(0, newStart);
    note.pitch = newPitch;
  } else if (drag.type === "resize") {
    let newDur = drag.orig.duration + dx;
    const grid = state.grid;
    newDur = Math.max(grid, Math.round(newDur / grid) * grid);
    note.duration = newDur;
  }
  render();
}

function onMouseUp() {
  const wasDrag = !!drag;
  drag = null;
  render();
  if (wasDrag && onNotesChanged) onNotesChanged();
}

function onContextMenu(e) {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left + container.scrollLeft;
  const y = e.clientY - rect.top + container.scrollTop;
  const hit = findNote(x, y);
  if (hit) {
    const t = state.tracks.find(tr => tr.id === hit.trackId);
    if (t) { t.notes.splice(hit.index, 1); state.selectedNote = null; render(); if (onSelect) onSelect(); }
  }
}

function onWheel(e) {
  e.preventDefault();
  if (e.shiftKey) {
    container.scrollLeft += e.deltaY;
  } else {
    container.scrollTop += e.deltaY;
  }
}

export function render() {
  if (!canvas || !ctx) return;
  resizeCanvas();
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // background + grid
  ctx.fillStyle = "#0b0e1a";
  ctx.fillRect(0, 0, w, h);

  // horizontal key lines
  for (let p = MIN_PITCH; p <= MAX_PITCH; p++) {
    const y = yOfPitch(p);
    ctx.strokeStyle = (p % 12 === 0) ? "#3a4070" : "#1a1f3a";
    ctx.beginPath(); ctx.moveTo(LEFT, y); ctx.lineTo(w, y); ctx.stroke();
    // key label
    if (p % 12 === 0) {
      ctx.fillStyle = "#9aa0bf";
      ctx.font = "10px sans-serif";
      ctx.fillText(midiNoteName(p), 4, y + 9);
    }
  }
  // vertical beat lines
  const totalBeats = (w - LEFT) / state.zoom;
  for (let b = 0; b <= totalBeats; b++) {
    const x = xOfBeat(b);
    const isBar = (b % state.timeSig === 0);
    ctx.strokeStyle = isBar ? "#4a5090" : "#1f2548";
    ctx.lineWidth = isBar ? 1.2 : 0.6;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    ctx.lineWidth = 1;
    if (isBar) {
      ctx.fillStyle = "#9aa0bf";
      ctx.font = "10px sans-serif";
      ctx.fillText(String(b / state.timeSig + 1), x + 2, 10);
    }
  }

  // piano keys left strip
  ctx.fillStyle = "#171a2e";
  ctx.fillRect(0, 0, LEFT, h);
  for (let p = MIN_PITCH; p <= MAX_PITCH; p++) {
    const y = yOfPitch(p);
    const isBlack = [1,3,6,8,10].includes(p % 12);
    ctx.fillStyle = isBlack ? "#0b0e1a" : "#dfe3f5";
    ctx.fillRect(0, y, LEFT - 2, KEY_H - 1);
  }

  // draw notes for all tracks
  state.tracks.forEach(track => {
    const isActive = track.id === state.activeTrackId;
    track.notes.forEach((note, idx) => {
      const r = noteRect(note);
      ctx.fillStyle = isActive ? track.color : track.color + "55";
      ctx.globalAlpha = isActive ? 0.9 : 0.35;
      ctx.fillRect(r.x, r.y + 1, r.w, r.h - 2);
      ctx.globalAlpha = 1;
      // selected highlight
      if (state.selectedNote && state.selectedNote.trackId === track.id && state.selectedNote.noteIndex === idx) {
        ctx.strokeStyle = "#00d4ff";
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x, r.y + 1, r.w, r.h - 2);
        ctx.lineWidth = 1;
      }
      // velocity bar
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(r.x, r.y + r.h - 3, r.w * note.velocity, 2);
    });
  });

  // playhead
  // (drawn externally via updatePlayhead)
}

function midiNoteName(m) {
  const names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  return names[m % 12] + (Math.floor(m / 12) - 1);
}

export function updatePlayhead(beat) {
  // redraw with playhead line
  render();
  if (!canvas || !ctx) return;
  const x = xOfBeat(beat);
  ctx.strokeStyle = "#ff5c7a";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  ctx.lineWidth = 1;
}

export function getSelectedNote() {
  if (!state.selectedNote) return null;
  const t = state.tracks.find(tr => tr.id === state.selectedNote.trackId);
  if (!t) return null;
  return { track: t, note: t.notes[state.selectedNote.noteIndex], index: state.selectedNote.noteIndex };
}
