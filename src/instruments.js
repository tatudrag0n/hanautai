import * as Tone from "tone";

import { instrumentInfo } from "./instrument-catalog.js";

const MELODIC_NOTES = ["C4"];
export function createInstrument(nameOrValue) {
  const entry = instrumentInfo(nameOrValue) ?? instrumentInfo("acoustic_grand_piano");
  const isDrumInst = entry.type === "drum";

  if (isDrumInst) {
    // Use synthetic drum for timing accuracy
    const synth = new Tone.MembraneSynth();
    synth.ready = Promise.resolve(true);
    return synth;
  }

  const instName = entry.value;
  const notes = MELODIC_NOTES;
  const base = `https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/${instName}-mp3/`;

  const urls = {};
  notes.forEach(n => {
    urls[n] = `${base}${n}.mp3`;
  });

  let resolveReady;
  const ready = new Promise(res => { resolveReady = res; });

  const sampler = new Tone.Sampler({
    urls,
    onload: () => resolveReady(true),
    onerror: (e) => { console.warn("sample load error", e); resolveReady(false); },
    release: 1
  });
  sampler.ready = ready;
  return sampler;
}
