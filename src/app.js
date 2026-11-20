import * as Tone from "tone";
import { state } from "./state.js";
import { createTrack, activeTrack, removeTrack, rebuildAllParts, Track, beatTime } from "./tracks.js";
import { INSTRUMENTS } from "./instrument-catalog.js";
import { FxChain } from "./effects.js";
import { Recorder } from "./recorder.js";
import { quantizeTrack, microCorrect } from "./quantize.js";
import { initPianoRoll, render as renderPiano, updatePlayhead, setOnNotesChanged, setOnSelect, getSelectedNote } from "./pianoroll.js";
import { parseProject, validateLoop, defaultEffects, defaultLoop } from "./project.js";
import { exportMIDI } from "./midi.js";

let fx = null;
let recorder = null;
let audioReady;
let playRequest = 0;
let startingPlayback = false;
let recordRequest = 0;
let loadRequest = 0;
let recordingPhase = "idle";
let animFrame = null;

const $ = (id) => document.getElementById(id);

function setStatus(msg) { $("recStatus").textContent = msg; }

function renderTrackList() {
  const el = $("trackList");
  el.innerHTML = "";
  state.tracks.forEach(t => {
    const div = document.createElement("div");
    div.className = "track-item" + (t.id === state.activeTrackId ? " active" : "");
    const color = document.createElement("span");
    color.className = "color";
    color.style.backgroundColor = t.color;
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = t.name;
    div.append(color, name);
    for (const [action, label] of [["mute", t.mute ? "M" : "m"], ["solo", t.solo ? "S" : "s"], ["del", "x"]]) {
      const button = document.createElement("button");
      button.dataset.act = action;
      button.textContent = label;
      div.append(button);
    }
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
        if (act === "del" && startingPlayback) stop();
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
    e.target.value = state.bpm;
    Tone.Transport.bpm.value = state.bpm;
  });
  $("timesig").addEventListener("change", (e) => { state.timeSig = +e.target.value; renderPiano(); });

  $("btnAddTrack").addEventListener("click", () => {
    if (startingPlayback) stop();
    const t = createTrack("acoustic_grand_piano");
    if (state.isPlaying) { t.rebuildSynth(); t.connectTo(fx.input); }
    state.activeTrackId = t.id;
    renderTrackList();
    syncTrackControls();
    renderPiano();
  });

  $("instrument").addEventListener("change", (e) => {
    const t = activeTrack();
    if (!t) return;
    if (startingPlayback) stop();
    t.instrument = e.target.value;
    if (t.synth) t.rebuildSynth();
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

  $("btnSetLoop").addEventListener("click", () => {
    try {
      state.loop = validateLoop({ ...state.loop, start: $("loopStart").valueAsNumber, end: $("loopEnd").valueAsNumber });
      syncLoop();
      renderPiano();
    } catch (err) { setStatus(err.message); }
  });
  $("btnToggleLoop").addEventListener("click", () => {
    state.loop.enabled = !state.loop.enabled;
    syncLoop();
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
  $("btnExportMidi").addEventListener("click", () => {
    try { exportMIDI(); } catch (err) { setStatus(err.message); }
  });
  $("fileInput").addEventListener("change", loadProject);

  // wave canvas handled in recorder callbacks
}

function updateEffects() {
  state.effects.reverb = +$("fxReverb").value;
  state.effects.delay = +$("fxDelay").value;
  state.effects.chorus = +$("fxChorus").value;
  state.effects.eqLow = +$("fxEqLow").value;
  state.effects.eqMid = +$("fxEqMid").value;
  state.effects.eqHigh = +$("fxEqHigh").value;
  state.effects.dist = +$("fxDist").value;
  state.effects.comp = +$("fxComp").value;
  fx?.set(state.effects);
}

function applyNoteEdit() {
  const sel = getSelectedNote();
  if (!sel) return;
  const note = sel.note;
  note.pitch = Math.max(0, Math.min(127, Math.round(+$("notePitch").value)));
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
    const beat = Tone.Transport.ticks / Tone.Transport.PPQ;
    updatePlayhead(beat);
    animFrame = requestAnimationFrame(loop);
  };
  animFrame = requestAnimationFrame(loop);
}
function syncLoop() {
  $("btnToggleLoop").textContent = state.loop.enabled ? "ループ ON" : "ループ OFF";
  Tone.Transport.setLoopPoints(beatTime(state.loop.start), beatTime(state.loop.end));
  Tone.Transport.loop = state.loop.enabled;
}

async function play() {
  if (state.isPlaying || startingPlayback) { stop(); return; }
  const request = ++playRequest;
  startingPlayback = true;
  $("btnPlay").textContent = "■ 読み込みを中止";
  try {
    await ensureAudio();
    if (request !== playRequest) return;
    if (!state.tracks.length) { stop(); return; }
    const tracks = [...state.tracks];
    for (const t of tracks) {
      if (!t.synth) t.rebuildSynth();
      t.connectTo(fx.input);
    }
    setStatus("楽器を読み込み中...");
    const results = await Promise.all(tracks.map(t => t.synth.ready));
    if (request !== playRequest) return;
    if (results.includes(false)) {
      results.forEach((ready, index) => { if (!ready) tracks[index].clearSynth(); });
      throw new Error("音源を取得できません。ネットワーク接続を確認してください。");
    }
    Tone.Transport.bpm.value = state.bpm;
    syncLoop();
    rebuildAllParts();
    Tone.Transport.start();
    state.isPlaying = true;
    $("btnPlay").textContent = "■ 停止";
    if (recordingPhase === "idle") setStatus("再生中");
    startPlayheadAnim();
  } catch (err) {
    if (request === playRequest) { stop(); setStatus(`再生失敗: ${err.message}`); }
  } finally {
    if (request === playRequest) startingPlayback = false;
  }
}

function stop() {
  ++playRequest;
  startingPlayback = false;
  Tone.Transport.stop();
  Tone.Transport.position = 0;
  state.isPlaying = false;
  for (const track of state.tracks) {
    track.clearPart();
    if (track.synth?.releaseAll) track.synth.releaseAll();
    else track.synth?.triggerRelease?.();
  }
  if (animFrame !== null) cancelAnimationFrame(animFrame);
  animFrame = null;
  $("btnPlay").textContent = "▶ 再生";
  renderPiano();
  if (recordingPhase === "idle") setStatus("待機中");
}

function resetRecordingUI() {
  recordingPhase = "idle";
  state.isRecording = false;
  $("btnRecord").disabled = false;
  $("btnRecord").textContent = "● 録音";
  $("pitchReadout").textContent = "--";
}

function cancelRecording() {
  ++recordRequest;
  const current = recorder;
  recorder = null;
  if (current) void current.stop();
  resetRecordingUI();
}

async function toggleRecord() {
  if (recordingPhase === "starting" || recordingPhase === "stopping") return;
  if (recordingPhase === "recording") {
    const request = recordRequest;
    const current = recorder;
    const target = current.target;
    recordingPhase = "stopping";
    $("btnRecord").disabled = true;
    setStatus("処理中...");
    try {
      await current.stop();
      if (request !== recordRequest) return;
      if (!state.tracks.includes(target)) throw new Error("録音先のトラックが削除されました。");
      const notes = current.buildNotes({
        sensitivity: +$("sensitivity").value,
        minNoteDur: +$("minNoteDur").value,
        inputGain: +$("inputGain").value,
        bpm: current.bpm
      });
      const take = { notes };
      microCorrect(take, state.grid);
      target.notes = target.notes.concat(take.notes);
      renderPiano();
      if (state.isPlaying) rebuildAllParts();
      setStatus(`録音完了: ${notes.length} ノート`);
    } catch (err) {
      if (request === recordRequest) setStatus(`録音失敗: ${err.message}`);
    } finally {
      if (request === recordRequest) { recorder = null; resetRecordingUI(); }
    }
    return;
  }
  const target = activeTrack();
  if (!target) { setStatus("録音先のトラックを追加してください。"); return; }
  const request = ++recordRequest;
  const current = new Recorder();
  current.target = target;
  current.bpm = state.bpm;
  recorder = current;
  recordingPhase = "starting";
  $("btnRecord").disabled = true;
  setStatus("マイクの許可を待っています...");
  try {
    await current.start();
    if (request !== recordRequest) return;
    recordingPhase = "recording";
    state.isRecording = true;
    $("btnRecord").disabled = false;
    $("btnRecord").textContent = "■ 停止";
    setStatus("録音中...");
    current.onFrame = (f) => {
      $("pitchReadout").textContent = f.confidence >= +$("sensitivity").value && f.midi > 0
        ? `${midiName(Math.round(f.midi))} (${f.freq.toFixed(1)} Hz)` : "--";
      drawWave(current.buffer);
    };
  } catch (err) {
    if (request === recordRequest) {
      recorder = null;
      resetRecordingUI();
      setStatus(`マイク取得失敗: ${err.message}`);
    }
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
  ++loadRequest;
  applyProject({ bpm: 120, timeSig: 4, grid: 1, loop: defaultLoop(), effects: defaultEffects(), tracks: [] });
}

function saveProject() {
  const data = {
    version: 1, bpm: state.bpm, timeSig: state.timeSig, grid: state.grid,
    loop: state.loop, effects: state.effects,
    tracks: state.tracks.map(t => t.toJSON())
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "hanautai.json"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  // also localStorage
  try { localStorage.setItem("hanautai_project", JSON.stringify(data)); } catch (e) {}
}

function loadProject(e) {
  const file = e.target.files[0];
  if (!file) return;
  const request = ++loadRequest;
  const reader = new FileReader();
  reader.onload = () => {
    if (request !== loadRequest) return;
    try {
      const data = JSON.parse(reader.result);
      applyProject(data);
    } catch (err) { alert("読込失敗: " + err.message); }
  };
  reader.onerror = () => {
    if (request === loadRequest) alert("ファイルを読み込めませんでした。");
  };
  reader.readAsText(file);
  e.target.value = "";
}
function applyProject(data) {
  const project = parseProject(data);
  const nextTracks = [];
  try {
    for (const track of project.tracks) nextTracks.push(Track.fromJSON(track));
    if (!nextTracks.length) nextTracks.push(new Track("Track 1"));
    if (fx) for (const track of nextTracks) track.connectTo(fx.input);
  } catch (err) {
    for (const track of nextTracks) track.dispose();
    throw err;
  }
  stop();
  cancelRecording();
  for (const track of state.tracks) track.dispose();
  const { bpm, timeSig, grid, loop, effects } = project;
  Object.assign(state, { bpm, timeSig, grid, loop, effects, tracks: nextTracks,
    activeTrackId: nextTracks[0].id, selectedNote: null });
  for (const key of ["bpm", "timeSig", "grid"]) $(key === "timeSig" ? "timesig" : key).value = state[key];
  $("loopStart").value = loop.start;
  $("loopEnd").value = loop.end;
  for (const [key, value] of Object.entries(effects)) {
    $(`fx${key[0].toUpperCase()}${key.slice(1)}`).value = value;
  }
  Tone.Transport.bpm.value = bpm;
  syncLoop();
  fx?.set(effects);
  renderTrackList();
  syncTrackControls();
  updateNoteInfo();
  renderPiano();
  setStatus("待機中");
}

function midiName(m) {
  const names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  return names[m % 12] + (Math.floor(m / 12) - 1);
}

window.addEventListener("DOMContentLoaded", () => {
  initPianoRoll($("pianoCanvas"), document.querySelector(".piano-wrap"));
  setOnNotesChanged(() => {
    if (state.isPlaying) rebuildAllParts();
    renderPiano();
  });
  setOnSelect(() => { updateNoteInfo(); });

  bindUI();
  try {
    const raw = localStorage.getItem("hanautai_project");
    if (raw) { applyProject(JSON.parse(raw)); return; }
  } catch (err) { setStatus(`保存済みプロジェクトを開けません: ${err.message}`); }
  createTrack("acoustic_grand_piano");
  renderTrackList();
  syncTrackControls();
  renderPiano();
});

function ensureAudio() {
  audioReady ??= Tone.start().then(async () => {
    const chain = new FxChain();
    try {
      await chain.reverb.ready;
      chain.set(state.effects);
      fx = chain;
    } catch (err) {
      chain.dispose();
      throw err;
    }
  }).catch(err => { audioReady = null; throw err; });
  return audioReady;
}
