import { state } from "./state.js";

const PPQ = 480;

const PROGRAMS = {
  "Piano": 0, "Electric Piano": 4, "Strings": 48, "Synth Lead": 80,
  "Synth Pad": 88, "Bass": 33, "Pluck": 24, "Marimba": 12,
  "Flute": 73, "Organ": 16, "Drums (Kit)": 0
};

function writeVarLen(value) {
  const bytes = [];
  let buffer = value & 0x7f;
  while ((value >>= 7) > 0) {
    buffer <<= 8;
    buffer |= ((value & 0x7f) | 0x80);
  }
  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8; else break;
  }
  return bytes;
}

function pushEvent(arr, delta, data) {
  arr.push(...writeVarLen(delta));
  arr.push(...data);
}

export function exportMIDI() {
  const tracks = [];
  // Tempo track (track 0) optional; we'll include tempo in first track
  state.tracks.forEach((tr, idx) => {
    const channel = tr.instrument === "Drums (Kit)" ? 9 : (idx % 15) + (idx >= 9 ? 1 : 0); // avoid 9
    const safeCh = (channel === 9 && tr.instrument !== "Drums (Kit)") ? 10 : channel;
    const ch = tr.instrument === "Drums (Kit)" ? 9 : (idx < 9 ? idx : idx + 1);
    const events = [];
    // program change at time 0
    events.push({ t: 0, data: [0xC0 | ch, PROGRAMS[tr.instrument] ?? 0] });
    // notes
    tr.notes.forEach(n => {
      const startTick = Math.round(n.start * PPQ);
      const endTick = Math.round((n.start + n.duration) * PPQ);
      const vel = Math.round(n.velocity * 127);
      events.push({ t: startTick, data: [0x90 | ch, n.pitch, Math.max(1, vel)] });
      events.push({ t: endTick, data: [0x80 | ch, n.pitch, 0] });
    });
    // sort by time, but note-offs after note-ons at same tick? keep stable
    events.sort((a, b) => a.t - b.t);
    // build track bytes
    const trackBytes = [];
    // tempo meta if first track
    if (idx === 0) {
      const tempo = Math.round(60000000 / state.bpm);
      // delta 0, meta FF 51 03 tt tt tt
      trackBytes.push(0); // var len 0
      trackBytes.push(0xFF, 0x51, 0x03);
      trackBytes.push((tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff);
      // time sig
      trackBytes.push(0);
      trackBytes.push(0xFF, 0x58, 0x04, state.timeSig, 2, 24, 8);
    }
    let lastT = 0;
    events.forEach(ev => {
      const delta = ev.t - lastT;
      lastT = ev.t;
      pushEvent(trackBytes, delta, ev.data);
    });
    // end of track
    pushEvent(trackBytes, 0, [0xFF, 0x2F, 0x00]);
    tracks.push(trackBytes);
  });

  if (tracks.length === 0) {
    // empty track
    const tb = [];
    pushEvent(tb, 0, [0xFF, 0x2F, 0x00]);
    tracks.push(tb);
  }

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

  const blob = new Blob([out], { type: "audio/midi" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "hanautai.mid";
  a.click();
  URL.revokeObjectURL(url);
}
