import * as Tone from "tone";

export const INSTRUMENTS = [
  "Piano", "Electric Piano", "Strings", "Synth Lead", "Synth Pad",
  "Bass", "Pluck", "Marimba", "Flute", "Organ", "Drums (Kit)"
];

export function createInstrument(name) {
  let synth;
  switch (name) {
    case "Piano":
      synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.005, decay: 0.3, sustain: 0.35, release: 1.2 }
      });
      break;
    case "Electric Piano":
      synth = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 3, modulationIndex: 10,
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.8 }
      });
      break;
    case "Strings":
      synth = new Tone.PolySynth(Tone.AMSynth, {
        harmonicity: 2,
        envelope: { attack: 0.25, decay: 0.3, sustain: 0.8, release: 1.5 }
      });
      break;
    case "Synth Lead":
      synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sawtooth" },
        envelope: { attack: 0.02, decay: 0.1, sustain: 0.7, release: 0.3 }
      });
      break;
    case "Synth Pad":
      synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sine" },
        envelope: { attack: 0.4, decay: 0.6, sustain: 0.85, release: 2.0 }
      });
      break;
    case "Bass":
      synth = new Tone.MonoSynth({
        oscillator: { type: "square" },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.2 },
        filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.2, baseFrequency: 80, octaves: 3 }
      });
      break;
    case "Pluck":
      synth = new Tone.PluckSynth({ attackNoise: 1, dampening: 4000, resonance: 0.9 });
      break;
    case "Marimba":
      synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 0.4, sustain: 0.0, release: 0.4 }
      });
      break;
    case "Flute":
      synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sine" },
        envelope: { attack: 0.15, decay: 0.2, sustain: 0.7, release: 0.5 }
      });
      break;
    case "Organ":
      synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "square" },
        envelope: { attack: 0.01, decay: 0.0, sustain: 1.0, release: 0.1 }
      });
      break;
    case "Drums (Kit)":
      synth = new Tone.MembraneSynth();
      break;
    default:
      synth = new Tone.PolySynth(Tone.Synth);
  }
  return synth;
}

// Map MIDI pitch for drum kit: keep simple (membrane on C)
export function isDrum(name) { return name === "Drums (Kit)"; }
