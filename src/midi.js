import { state } from "./state.js";
import { instrumentInfo } from "./instrument-catalog.js";

const PPQ = 480;

function writeVarLen(value) {
  if (!Number.isInteger(value) || value < 0 || value > 0x0fffffff) throw new Error("MIDIの時間範囲外です。");
  const bytes = [value & 0x7f];
  while ((value >>= 7) > 0) bytes.unshift((value & 0x7f) | 0x80);
  return bytes;
}

function pushEvent(arr, delta, data) {
  arr.push(...writeVarLen(delta));
  arr.push(...data);
}

export function encodeMIDI({ tracks: projectTracks, bpm, timeSig }) {
  const tracks = [];
  const channels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
  let melodicTracks = 0;
  const tempo = Math.round(60000000 / bpm);
  const conductor = [0, 0xFF, 0x51, 0x03, (tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff,
    0, 0xFF, 0x58, 0x04, timeSig, timeSig === 6 ? 3 : 2, 24, 8];
  pushEvent(conductor, 0, [0xFF, 0x2F, 0x00]);
  tracks.push(conductor);
  for (const tr of projectTracks) {
    const instrument = instrumentInfo(tr.instrument);
    if (!instrument) throw new Error(`不明な楽器: ${tr.instrument}`);
    const isDrum = instrument.type === "drum";
    const ch = isDrum ? 9 : channels[melodicTracks++];
    if (ch === undefined) throw new Error("MIDIに出力できるメロディトラックは15本までです。");
    const events = [];
    if (!isDrum) events.push({ t: 0, order: 0, data: [0xC0 | ch, instrument.program] });
    // notes
    tr.notes.forEach(n => {
      const startTick = Math.round(n.start * PPQ);
      const endTick = Math.max(startTick + 1, Math.round((n.start + n.duration) * PPQ));
      const vel = Math.round(n.velocity * 127);
      events.push({ t: startTick, order: 2, data: [0x90 | ch, n.pitch, Math.max(1, vel)] });
      events.push({ t: endTick, order: 1, data: [0x80 | ch, n.pitch, 0] });
    });
    events.sort((a, b) => a.t - b.t || a.order - b.order);
    const trackBytes = [];
    let lastT = 0;
    events.forEach(ev => {
      const delta = ev.t - lastT;
      lastT = ev.t;
      pushEvent(trackBytes, delta, ev.data);
    });
    // end of track
    pushEvent(trackBytes, 0, [0xFF, 0x2F, 0x00]);
    tracks.push(trackBytes);
  }
  if (tracks.length > 65535) throw new Error("MIDIトラック数が上限を超えています。");

  // Header
  const numTracks = tracks.length;
  const header = [];
  // MThd
  "MThd".split("").forEach(c => header.push(c.charCodeAt(0)));
  // length 6
  header.push(0,0,0,6);
  // format 1
  header.push(0,1);
  header.push((numTracks >> 8) & 0xff, numTracks & 0xff);
  header.push((PPQ >> 8) & 0xff, PPQ & 0xff);

  const parts = [new Uint8Array(header)];
  tracks.forEach(tb => {
    const trHeader = [];
    "MTrk".split("").forEach(c => trHeader.push(c.charCodeAt(0)));
    const len = tb.length;
    trHeader.push((len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff);
    parts.push(new Uint8Array(trHeader));
    parts.push(new Uint8Array(tb));
  });

  let total = 0;
  parts.forEach(p => total += p.length);
  const out = new Uint8Array(total);
  let off = 0;
  parts.forEach(p => { out.set(p, off); off += p.length; });

  return out;
}

export function exportMIDI() {
  const out = encodeMIDI(state);
  const blob = new Blob([out], { type: "audio/midi" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "hanautai.mid";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
