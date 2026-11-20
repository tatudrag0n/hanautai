import test from "node:test";
import assert from "node:assert/strict";
import { parseProject, defaultEffects, defaultLoop, validateLoop } from "../../src/project.js";
import { encodeMIDI } from "../../src/midi.js";
import { Recorder } from "../../src/recorder.js";
import { quantizeNote, microCorrect } from "../../src/quantize.js";

const note = { id: "n1", start: 1.5, duration: 0.5, pitch: 60, velocity: 1 };
const track = { id: "t1", name: "Track 1", color: "#abcdff", instrument: "Electric Piano", volume: 0.8, pan: 0, mute: false, solo: false, notes: [note] };
const project = () => structuredClone({ bpm: 120, timeSig: 6, grid: 0.25, loop: defaultLoop(), effects: defaultEffects(), tracks: [track] });

test("旧形式を正規化し、入力と独立したプロジェクトを返す", () => {
  const original = project();
  const parsed = parseProject(original);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.tracks[0].instrument, "electric_piano_1");
  parsed.tracks[0].notes[0].pitch = 61;
  assert.deepEqual(original, project());
});

test("不正なノート、重複ID、値域外のループや色を拒否する", () => {
  for (const invalidate of [
    p => { delete p.tracks[0].notes; },
    p => p.tracks.push(p.tracks[0]),
    p => p.tracks[0].notes.push(p.tracks[0].notes[0]),
    p => { p.tracks[0].notes[0].pitch = 60.5; },
    p => { p.tracks[0].color = "red"; },
    p => { p.effects.reverb = -1; },
    p => { p.grid = 0; }
  ]) {
    const invalid = project();
    invalidate(invalid);
    assert.throws(() => parseProject(invalid), /無効/);
  }
  assert.throws(() => validateLoop({ enabled: true, start: 4, end: 2 }), /ループ/);
});

function readMidi(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = offset => String.fromCharCode(...bytes.slice(offset, offset + 4));
  assert.equal(tag(0), "MThd");
  assert.equal(view.getUint16(8), 1);
  const tracks = [];
  let i = 14;
  while (i < bytes.length) {
    assert.equal(tag(i), "MTrk");
    const end = i + 8 + view.getUint32(i + 4);
    i += 8;
    let tick = 0;
    const events = [];
    while (i < end) {
      let delta = 0;
      let b;
      do { b = bytes[i++]; delta = delta * 128 + (b & 0x7f); } while (b & 0x80);
      tick += delta;
      const status = bytes[i++];
      if (status === 0xff) {
        const type = bytes[i++];
        const length = bytes[i++];
        events.push([tick, status, type, ...bytes.slice(i, i + length)]);
        i += length;
      } else {
        const length = (status & 0xf0) === 0xc0 ? 1 : 2;
        events.push([tick, status, ...bytes.slice(i, i + length)]);
        i += length;
      }
    }
    assert.equal(i, end);
    tracks.push(events);
  }
  assert.equal(tracks.length, view.getUint16(10));
  return { ppq: view.getUint16(12), tracks };
}

test("MIDIにテンポ、6/8拍子、GMプログラム、打楽器チャンネル、正しいtickを出力する", () => {
  const p = parseProject(project());
  p.tracks.push({ ...track, instrument: "Drums (TR-808)" });
  const { ppq, tracks } = readMidi(encodeMIDI(p));
  assert.equal(ppq, 480);
  assert.deepEqual(tracks[0].slice(0, 2), [[0, 255, 81, 7, 161, 32], [0, 255, 88, 6, 3, 24, 8]]);
  assert.deepEqual(tracks[1].slice(0, 3), [[0, 0xc0, 4], [720, 0x90, 60, 127], [960, 0x80, 60, 0]]);
  assert.deepEqual(tracks[2][0], [720, 0x99, 60, 127]);
});

test("MIDIはチャンネル9を飛ばし、メロディトラック16本目を拒否する", () => {
  const p = { ...project(), tracks: Array(15).fill(track) };
  const { tracks } = readMidi(encodeMIDI(p));
  assert.equal(tracks[10][0][1], 0xca);
  assert.equal(tracks[15][0][1], 0xcf);
  p.tracks.push(track);
  assert.throws(() => encodeMIDI(p), /15本/);
});

test("合成録音フレームを録音時のBPMでノート化し、短いノイズを破棄する", () => {
  const r = new Recorder();
  r.frames = [
    { time: 2, midi: -1, confidence: 0, rms: 0 },
    ...Array.from({ length: 6 }, (_, i) => ({ time: 2.25 + i * 0.02, midi: 60.2, confidence: 0.9, rms: 0.5 })),
    { time: 2.4, midi: 65, confidence: 0.9, rms: 0.5 }
  ];
  const [first, second] = r.buildNotes({ bpm: 120 });
  assert.equal(second, undefined);
  assert.equal(first.pitch, 60);
  assert.equal(first.start, 0.5);
  assert.equal(first.velocity, 0.5);
  assert.ok(first.duration >= 0.3);
});

test("クオンタイズ強度0と1、およびマイクロ補正の境界", () => {
  const n = { ...note, start: 0.5, duration: 0.125 };
  assert.deepEqual(quantizeNote(n, 1, 0), n);
  assert.deepEqual(quantizeNote(n, 1, 1), { ...n, start: 1, duration: 1 });
  const t = { notes: [{ start: 1.0625 }, { start: 1.0626 }] };
  microCorrect(t, 1);
  assert.deepEqual(t.notes.map(n => n.start), [1, 1.0626]);
});
