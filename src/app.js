import * as Tone from "tone";
import { state, beatsToSeconds, secondsToBeats, newTrackId } from "./state.js";
import { createTrack, activeTrack, removeTrack, rebuildAllParts, Track } from "./tracks.js";
import { INSTRUMENTS } from "./instruments.js";
import { FxChain } from "./effects.js";
import { Recorder } from "./recorder.js";
import { quantizeTrack, microCorrect } from "./quantize.js";
import { initPianoRoll, render as renderPiano, updatePlayhead, setOnNotesChanged, setOnSelect, getSelectedNote } from "./pianoroll.js";
import { exportMIDI } from "./midi.js";

let fx = null;
let recorder = null;
let playheadTimer = null;
let animFrame = null;

const $ = (id) => document.getElementById(id);

function setStatus(msg) { $("recStatus").textContent = msg; }

function trackColorDot(t) { return `<span class="color" style="background:${t.color}"></span>`; }

function renderTrackList() {
  const el = $("trackList");
  el.innerHTML = "";
  state.tracks.forEach(t => {
    const div = document.createElement("div");
    div.className = "track-item" + (t.id === state.activeTrackId ? " active" : "");
    div.innerHTML = `${trackColorDot(t)}<span class="name">${t.name}</span>
      <button data-act="mute">${t.mute ? "M" : "m"}</button>
      <button data-act="solo">${t.solo ? "S" : "s"}</button>
      <button data-act="del">x</button>`;
    div.addEventListener("click", (e) => {
      if (e.target.tagName === "BUTTON") return;
      state.activeTrackId = t.id;
      syncTrackControls();
      renderTrackList();
      renderPiano();
    });
    div.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const act = btn.dataset.act;
        if (act === "mute") t.mute = !t.mute;
        if (act === "solo") t.solo = !t.solo;
        if (act === "del") { if (confirm("削除しますか？")) removeTrack(t.id); }
        syncTrackControls();
        renderTrackList();
        renderPiano();
        if (state.isPlaying) rebuildAllParts();
      });
    });
    el.appendChild(div);
  });
}

function syncTrackControls() {
  const t = activeTrack();
  if (!t) return;
  $("instrument").value = t.instrument;
  $("trackVol").value = t.volume;
  $("trackPan").value = t.pan;
}

function populateInstruments() {
  const sel = $("instrument");
  sel.innerHTML = "";
  INSTRUMENTS.forEach(item => {
    const o = document.createElement("option");
    o.value = item.value; o.textContent = item.label;
    sel.appendChild(o);
  });
}

function bindUI() {
  populateInstruments();

  $("btnPlay").addEventListener("click", play);
  $("btnStop").addEventListener("click", stop);
  $("btnRecord").addEventListener("click", toggleRecord);

  $("bpm").addEventListener("change", (e) => {
    state.bpm = Math.max(40, Math.min(240, +e.target.value));
    if (state.isPlaying) { stop(); play(); }
  });
  $("timesig").addEventListener("change", (e) => { state.timeSig = +e.target.value; renderPiano(); });

  $("btnAddTrack").addEventListener("click", () => {
    const t = createTrack("acoustic_grand_piano");
    if (fx) t.connectTo(fx.input);
    state.activeTrackId = t.id;
    renderTrackList();
    syncTrackControls();
    renderPiano();
  });

  $("instrument").addEventListener("change", (e) => {
    const t = activeTrack();
    if (!t) return;
    t.instrument = e.target.value;
    t.rebuildSynth();
    t.connectTo(fx.input);
    if (state.isPlaying) rebuildAllParts();
    renderTrackList();
  });
  $("trackVol").addEventListener("input", (e) => {
    const t = activeTrack(); if (!t) return;
    t.volume = +e.target.value;
    t.gain.gain.value = t.volume;
  });
  $("trackPan").addEventListener("input", (e) => {
    const t = activeTrack(); if (!t) return;
    t.pan = +e.target.value;
    t.panner.pan.value = t.pan;
  });
  $("btnMute").addEventListener("click", () => {
    const t = activeTrack(); if (!t) return;
    t.mute = !t.mute; renderTrackList();
  });
  $("btnSolo").addEventListener("click", () => {
    const t = activeTrack(); if (!t) return;
    t.solo = !t.solo; renderTrackList();
  });
  $("btnClearTrack").addEventListener("click", () => {
    const t = activeTrack(); if (!t) return;
    if (confirm("トラックのノートをすべて削除しますか？")) {
      t.clear(); renderPiano(); if (state.isPlaying) rebuildAllParts();
    }
  });

  $("grid").addEventListener("change", (e) => { state.grid = +e.target.value; renderPiano(); });
  $("quantStrength").addEventListener("input", (e) => { state.quantStrength = +e.target.value; });
  $("btnQuantize").addEventListener("click", () => {
    const t = activeTrack(); if (!t) return;
    quantizeTrack(t, state.grid, state.quantStrength);
    microCorrect(t, state.grid);
    renderPiano(); if (state.isPlaying) rebuildAllParts();
  });
  $("btnQuantizeAll").addEventListener("click", () => {
    state.tracks.forEach(t => { quantizeTrack(t, state.grid, state.quantStrength); microCorrect(t, state.grid); });
    renderPiano(); if (state.isPlaying) rebuildAllParts();
  });

  $("loopStart").addEventListener("change", (e) => { state.loop.start = +e.target.value; });
  $("loopEnd").addEventListener("change", (e) => { state.loop.end = +e.target.value; });
  $("btnSetLoop").addEventListener("click", () => {
    state.loop.start = +$("loopStart").value;
    state.loop.end = +$("loopEnd").value;
    if (state.loop.end <= state.loop.start) state.loop.end = state.loop.start + 1;
    rebuildAllParts();
  });
  $("btnToggleLoop").addEventListener("click", () => {
    state.loop.enabled = !state.loop.enabled;
    $("btnToggleLoop").textContent = state.loop.enabled ? "ループ ON" : "ループ OFF";
    Tone.Transport.loop = state.loop.enabled;
    if (state.loop.enabled) {
      Tone.Transport.loopStart = state.loop.start;
      Tone.Transport.loopEnd = state.loop.end;
    }
  });

  $("zoom").addEventListener("input", (e) => { state.zoom = +e.target.value; renderPiano(); });

  // effects
  ["fxReverb","fxDelay","fxChorus","fxEqLow","fxEqMid","fxEqHigh","fxDist","fxComp"].forEach(id => {
    $(id).addEventListener("input", updateEffects);
  });

  // note edit
  $("btnApplyNote").addEventListener("click", applyNoteEdit);
  $("btnDeleteNote").addEventListener("click", deleteSelectedNote);

  // io
  $("btnNewProject").addEventListener("click", newProject);
  $("btnSave").addEventListener("click", saveProject);
  $("btnLoad").addEventListener("click", () => $("fileInput").click());
  $("btnExportMidi").addEventListener("click", exportMIDI);
  $("fileInput").addEventListener("change", loadProject);

  // wave canvas handled in recorder callbacks
}

function updateEffects() {
  if (!fx) return;
  state.effects.reverb = +$("fxReverb").value;
  state.effects.delay = +$("fxDelay").value;
  state.effects.chorus = +$("fxChorus").value;
  state.effects.eqLow = +$("fxEqLow").value;
  state.effects.eqMid = +$("fxEqMid").value;
  state.effects.eqHigh = +$("fxEqHigh").value;
  state.effects.dist = +$("fxDist").value;
  state.effects.comp = +$("fxComp").value;
  fx.set(state.effects);
}

function applyNoteEdit() {
  const sel = getSelectedNote();
  if (!sel) return;
  const note = sel.note;
  note.pitch = Math.max(0, Math.min(127, +$("notePitch").value));
  note.start = Math.max(0, +$("noteStart").value);
  note.duration = Math.max(0.0625, +$("noteDur").value);
  note.velocity = Math.max(0, Math.min(1, +$("noteVel").value));
  renderPiano();
  if (state.isPlaying) rebuildAllParts();
}

function deleteSelectedNote() {
  const sel = getSelectedNote();
  if (!sel) return;
  sel.track.notes.splice(sel.index, 1);
  state.selectedNote = null;
  renderPiano();
  if (state.isPlaying) rebuildAllParts();
}

function updateNoteInfo() {
  const sel = getSelectedNote();
  if (!sel) { $("noteInfo").textContent = "ノート未選択"; return; }
  const n = sel.note;
  $("noteInfo").textContent = `Track: ${sel.track.name} | Pitch ${n.pitch}`;
  $("notePitch").value = n.pitch;
  $("noteStart").value = n.start;
  $("noteDur").value = n.duration;
  $("noteVel").value = n.velocity;
}

// Playhead animation
function startPlayheadAnim() {
  const loop = () => {
    if (!state.isPlaying) return;
    const beat = Tone.Transport.position ? parsePosition(Tone.Transport.position) : 0;
    updatePlayhead(beat);
    animFrame = requestAnimationFrame(loop);
  };
  animFrame = requestAnimationFrame(loop);
}
function parsePosition(pos) {
  // "bars:beats:sixteenths"
  const parts = String(pos).split(":");
  const bars = +parts[0] || 0;
  const beats = +parts[1] || 0;
  const six = +parts[2] || 0;
  return bars * state.timeSig + beats + six / 4;
}

async function play() {
  await ensureAudio();
  if (state.tracks.length === 0) createTrack("acoustic_grand_piano");
  state.tracks.forEach(t => { if (!t.synth) t.rebuildSynth(); t.connectTo(fx.input); });
  state.isPlaying = true;
  rebuildAllParts();
  Tone.Transport.bpm.value = state.bpm;
  Tone.Transport.loop = state.loop.enabled;
  if (state.loop.enabled) {
    Tone.Transport.loopStart = state.loop.start;
    Tone.Transport.loopEnd = state.loop.end;
  }
  Tone.Transport.start();
  $("btnPlay").textContent = "❚❚ 一時停止";
  startPlayheadAnim();
}

function stop() {
  Tone.Transport.stop();
  Tone.Transport.position = 0;
  state.isPlaying = false;
  if (animFrame) cancelAnimationFrame(animFrame);
  animFrame = null;
  $("btnPlay").textContent = "▶ 再生";
  renderPiano();
}

async function toggleRecord() {
  if (state.isRecording) {
    // stop recording
    state.isRecording = false;
    setStatus("処理中...");
    const notes = recorder.buildNotes({
      sensitivity: +$("sensitivity").value,
      minNoteDur: +$("minNoteDur").value,
      inputGain: +$("inputGain").value
    });
    await recorder.stop();
    recorder = null;
    // quantize micro
    const t = activeTrack();
    if (t) {
      const withIds = notes.map(n => ({ ...n, id: n.id || String(Math.random()) }));
      t.notes.push(...withIds);
      microCorrect(t, state.grid);
      renderPiano();
      if (state.isPlaying) rebuildAllParts();
    }
    setStatus(`録音完了: ${notes.length} ノート`);
    $("btnRecord").textContent = "● 録音";
    return;
  }
  // start
  try {
    await ensureAudio();
    recorder = new Recorder();
    await recorder.start();
    state.isRecording = true;
    $("btnRecord").textContent = "■ 停止";
    setStatus("録音中...");
    recorder.onFrame = (f) => {
      // pitch readout
      if (f.confidence >= +$("sensitivity").value && f.midi > 0) {
        const noteName = midiName(Math.round(f.midi));
        $("pitchReadout").textContent = `${noteName} (${f.freq.toFixed(1)} Hz)`;
      } else {
        $("pitchReadout").textContent = "--";
      }
      // wave canvas
      drawWave(recorder.buffer);
    };
  } catch (err) {
    setStatus("マイク取得失敗: " + err.message);
    state.isRecording = false;
  }
}

function drawWave(buf) {
  const c = $("waveCanvas");
  const ctx2 = c.getContext("2d");
  ctx2.fillStyle = "#0b0e1a";
  ctx2.fillRect(0, 0, c.width, c.height);
  ctx2.strokeStyle = "#00d4ff";
  ctx2.beginPath();
  const step = Math.max(1, Math.floor(buf.length / c.width));
  for (let i = 0; i < c.width; i++) {
    const v = buf[i * step] || 0;
    const y = (v + 1) / 2 * c.height;
    if (i === 0) ctx2.moveTo(i, y); else ctx2.lineTo(i, y);
  }
  ctx2.stroke();
}
function newProject() {
  if (!confirm("新規プロジェクトを作成しますか？")) return;
  state.tracks.forEach(t => removeTrack(t.id));
  state.tracks = [];
  const t = createTrack("acoustic_grand_piano");
  if (fx) t.connectTo(fx.input);
  state.activeTrackId = t.id;
  state.loop = { enabled: true, start: 0, end: 16 };
  renderTrackList();
  syncTrackControls();
  renderPiano();
}

function saveProject() {
  const data = {
    bpm: state.bpm, timeSig: state.timeSig, grid: state.grid,
    loop: state.loop, effects: state.effects,
    tracks: state.tracks.map(t => t.toJSON())
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "hanautai.json"; a.click();
  URL.revokeObjectURL(url);
  // also localStorage
  try { localStorage.setItem("hanautai_project", JSON.stringify(data)); } catch (e) {}
}

function loadProject(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      applyProject(data);
    } catch (err) { alert("読込失敗: " + err.message); }
  };
  reader.readAsText(file);
  e.target.value = "";
}
// We'll implement applyProject synchronously using imported Track? tracks module exports Track class? It doesn't export Track. Let's adjust: export Track from tracks.js.
// Append runtime initialization and helpers
function applyProject(data) {
  state.tracks.forEach(t => removeTrack(t.id));
  state.tracks = [];
  state.bpm = data.bpm || 120;
  state.timeSig = data.timeSig || 4;
  state.grid = data.grid || 1;
  state.loop = data.loop || { enabled: true, start: 0, end: 16 };
  state.effects = data.effects || state.effects;
  $("bpm").value = state.bpm;
  $("timesig").value = state.timeSig;
  $("grid").value = state.grid;
  $("loopStart").value = state.loop.start;
  $("loopEnd").value = state.loop.end;
  if (data.tracks) {
    data.tracks.forEach(o => {
      const t = Track.fromJSON(o);
      state.tracks.push(t);
      if (fx) t.connectTo(fx.input);
    });
  }
  if (state.tracks.length === 0) {
    const t = createTrack("acoustic_grand_piano");
    if (fx) t.connectTo(fx.input);
  }
  state.activeTrackId = state.tracks[0]?.id || null;
  updateEffects();
  renderTrackList();
  syncTrackControls();
  renderPiano();
}

function midiName(m) {
  const names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  return names[m % 12] + (Math.floor(m / 12) - 1);
}

window.addEventListener("DOMContentLoaded", async () => {
  try {
    const raw = localStorage.getItem("hanautai_project");
    if (raw) window.__pendingProject = JSON.parse(raw);
  } catch (e) {}

  initPianoRoll($("pianoCanvas"), document.querySelector(".piano-wrap"));
  setOnNotesChanged(() => {
    if (state.isPlaying) rebuildAllParts();
    renderPiano();
  });
  setOnSelect(() => { updateNoteInfo(); });

  bindUI();
  const t = createTrack("acoustic_grand_piano");
  if (fx) t.connectTo(fx.input);
  state.activeTrackId = t.id;
  renderTrackList();
  syncTrackControls();
  renderPiano();
});

async function ensureAudio() {
  if (fx) return;
  await Tone.start();
  fx = new FxChain();
  try { await fx.reverb.ready; } catch (e) {}
  fx.set(state.effects);
  state.tracks.forEach(t => t.connectTo(fx.input));
  if (window.__pendingProject) {
    applyProject(window.__pendingProject);
    window.__pendingProject = null;
  }
}
window.ensureAudio = ensureAudio;
