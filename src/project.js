import { instrumentInfo } from "./instrument-catalog.js";

export const defaultLoop = () => ({ enabled: true, start: 0, end: 16 });
export const defaultEffects = () => ({ reverb: 0.25, delay: 0.15, chorus: 0, eqLow: 0, eqMid: 0, eqHigh: 0, dist: 0, comp: 0.3 });

function check(ok, field) {
  if (!ok) throw new Error(`${field} の値が無効です`);
}
const between = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
const object = v => v !== null && typeof v === "object" && !Array.isArray(v);

export function validateLoop(loop) {
  check(object(loop) && typeof loop.enabled === "boolean" && between(loop.start, 0, 100000) &&
    between(loop.end, 0, 100000) && loop.end - loop.start >= 1 / 192, "ループ");
  return { enabled: loop.enabled, start: loop.start, end: loop.end };
}

export function parseProject(data) {
  check(object(data) && (data.version === undefined || data.version === 1), "プロジェクト形式");
  const { bpm, timeSig, grid } = data;
  check(between(bpm, 40, 240), "BPM");
  check([3, 4, 6].includes(timeSig), "拍子");
  check([0.25, 0.5, 1, 2].includes(grid), "グリッド");
  const loop = validateLoop(data.loop);
  const effects = defaultEffects();
  check(object(data.effects), "エフェクト");
  for (const key of Object.keys(effects)) {
    const eq = key.startsWith("eq");
    check(between(data.effects[key], eq ? -12 : 0, eq ? 12 : 1), key);
    effects[key] = data.effects[key];
  }
  check(Array.isArray(data.tracks), "トラック一覧");
  const trackIds = new Set();
  const tracks = data.tracks.map((t, index) => {
    const label = `トラック ${index + 1}`;
    check(object(t) && typeof t.id === "string" && t.id && !trackIds.has(t.id), `${label} ID`);
    trackIds.add(t.id);
    check(typeof t.name === "string" && typeof t.color === "string" && /^#[0-9a-f]{6}$/i.test(t.color), label);
    const inst = typeof t.instrument === "string" && instrumentInfo(t.instrument);
    check(inst && between(t.volume, 0, 1) && between(t.pan, -1, 1) &&
      typeof t.mute === "boolean" && typeof t.solo === "boolean" && Array.isArray(t.notes), label);
    const ids = new Set();
    const notes = t.notes.map(n => {
      check(object(n) && typeof n.id === "string" && n.id && !ids.has(n.id) &&
        Number.isInteger(n.pitch) && between(n.pitch, 0, 127) && between(n.start, 0, 100000) &&
        between(n.duration, Number.MIN_VALUE, 100000) && between(n.velocity, 0, 1), `${label} のノート`);
      ids.add(n.id);
      return { id: n.id, pitch: n.pitch, start: n.start, duration: n.duration, velocity: n.velocity };
    });
    return { id: t.id, name: t.name, color: t.color, instrument: inst.value, volume: t.volume,
      pan: t.pan, mute: t.mute, solo: t.solo, notes };
  });
  return { version: 1, bpm, timeSig, grid, loop, effects, tracks };
}
