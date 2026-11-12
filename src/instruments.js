import * as Tone from "tone";

export const LEGACY_MAP = {
  "Piano": "acoustic_grand_piano",
  "Electric Piano": "electric_piano_1",
  "Strings": "string_ensemble_1",
  "Synth Lead": "lead_2_sawtooth",
  "Synth Pad": "pad_2_warm",
  "Bass": "electric_bass_finger",
  "Pluck": "pizzicato_strings",
  "Marimba": "marimba",
  "Flute": "flute",
  "Organ": "drawbar_organ",
  "Drums (Kit)": "Drums (TR-808)",
  "Drums (TR-808)": "Drums (TR-808)"
};

// Curated list of instruments (same as before, minus smplr-specific)
export const INSTRUMENTS = [
  { label: "Piano (Grand)", value: "acoustic_grand_piano", type: "sampler" },
  { label: "Piano (Bright)", value: "bright_acoustic_piano", type: "sampler" },
  { label: "Electric Piano 1", value: "electric_piano_1", type: "sampler" },
  { label: "Electric Piano 2", value: "electric_piano_2", type: "sampler" },
  { label: "Honky-tonk Piano", value: "honkytonk_piano", type: "sampler" },
  { label: "Harpsichord", value: "harpsichord", type: "sampler" },
  { label: "Clavinet", value: "clavinet", type: "sampler" },
  { label: "Celesta", value: "celesta", type: "sampler" },
  { label: "Glockenspiel", value: "glockenspiel", type: "sampler" },
  { label: "Music Box", value: "music_box", type: "sampler" },
  { label: "Vibraphone", value: "vibraphone", type: "sampler" },
  { label: "Marimba", value: "marimba", type: "sampler" },
  { label: "Xylophone", value: "xylophone", type: "sampler" },
  { label: "Tubular Bells", value: "tubular_bells", type: "sampler" },
  { label: "Dulcimer", value: "dulcimer", type: "sampler" },
  { label: "Drawbar Organ", value: "drawbar_organ", type: "sampler" },
  { label: "Percussive Organ", value: "percussive_organ", type: "sampler" },
  { label: "Rock Organ", value: "rock_organ", type: "sampler" },
  { label: "Church Organ", value: "church_organ", type: "sampler" },
  { label: "Reed Organ", value: "reed_organ", type: "sampler" },
  { label: "Accordion", value: "accordion", type: "sampler" },
  { label: "Harmonica", value: "harmonica", type: "sampler" },
  { label: "Tango Accordion", value: "tango_accordion", type: "sampler" },
  { label: "Acoustic Guitar (Nylon)", value: "acoustic_guitar_nylon", type: "sampler" },
  { label: "Acoustic Guitar (Steel)", value: "acoustic_guitar_steel", type: "sampler" },
  { label: "Electric Guitar (Jazz)", value: "electric_guitar_jazz", type: "sampler" },
  { label: "Electric Guitar (Clean)", value: "electric_guitar_clean", type: "sampler" },
  { label: "Electric Guitar (Muted)", value: "electric_guitar_muted", type: "sampler" },
  { label: "Overdriven Guitar", value: "overdriven_guitar", type: "sampler" },
  { label: "Distortion Guitar", value: "distortion_guitar", type: "sampler" },
  { label: "Acoustic Bass", value: "acoustic_bass", type: "sampler" },
  { label: "Electric Bass (Finger)", value: "electric_bass_finger", type: "sampler" },
  { label: "Electric Bass (Pick)", value: "electric_bass_pick", type: "sampler" },
  { label: "Fretless Bass", value: "fretless_bass", type: "sampler" },
  { label: "Slap Bass 1", value: "slap_bass_1", type: "sampler" },
  { label: "Slap Bass 2", value: "slap_bass_2", type: "sampler" },
  { label: "Synth Bass 1", value: "synth_bass_1", type: "sampler" },
  { label: "Synth Bass 2", value: "synth_bass_2", type: "sampler" },
  { label: "Violin", value: "violin", type: "sampler" },
  { label: "Viola", value: "viola", type: "sampler" },
  { label: "Cello", value: "cello", type: "sampler" },
  { label: "Contrabass", value: "contrabass", type: "sampler" },
  { label: "Tremolo Strings", value: "tremolo_strings", type: "sampler" },
  { label: "Pizzicato Strings", value: "pizzicato_strings", type: "sampler" },
  { label: "Orchestral Harp", value: "orchestral_harp", type: "sampler" },
  { label: "Timpani", value: "timpani", type: "sampler" },
  { label: "String Ensemble 1", value: "string_ensemble_1", type: "sampler" },
  { label: "String Ensemble 2", value: "string_ensemble_2", type: "sampler" },
  { label: "Synth Strings 1", value: "synth_strings_1", type: "sampler" },
  { label: "Synth Strings 2", value: "synth_strings_2", type: "sampler" },
  { label: "Choir Aahs", value: "choir_aahs", type: "sampler" },
  { label: "Voice Oohs", value: "voice_oohs", type: "sampler" },
  { label: "Synth Choir", value: "synth_choir", type: "sampler" },
  { label: "Orchestra Hit", value: "orchestra_hit", type: "sampler" },
  { label: "Trumpet", value: "trumpet", type: "sampler" },
  { label: "Trombone", value: "trombone", type: "sampler" },
  { label: "Tuba", value: "tuba", type: "sampler" },
  { label: "Muted Trumpet", value: "muted_trumpet", type: "sampler" },
  { label: "French Horn", value: "french_horn", type: "sampler" },
  { label: "Brass Section", value: "brass_section", type: "sampler" },
  { label: "Synth Brass 1", value: "synth_brass_1", type: "sampler" },
  { label: "Synth Brass 2", value: "synth_brass_2", type: "sampler" },
  { label: "Soprano Sax", value: "soprano_sax", type: "sampler" },
  { label: "Alto Sax", value: "alto_sax", type: "sampler" },
  { label: "Tenor Sax", value: "tenor_sax", type: "sampler" },
  { label: "Baritone Sax", value: "baritone_sax", type: "sampler" },
  { label: "Oboe", value: "oboe", type: "sampler" },
  { label: "English Horn", value: "english_horn", type: "sampler" },
  { label: "Bassoon", value: "bassoon", type: "sampler" },
  { label: "Clarinet", value: "clarinet", type: "sampler" },
  { label: "Piccolo", value: "piccolo", type: "sampler" },
  { label: "Flute", value: "flute", type: "sampler" },
  { label: "Recorder", value: "recorder", type: "sampler" },
  { label: "Pan Flute", value: "pan_flute", type: "sampler" },
  { label: "Blown Bottle", value: "blown_bottle", type: "sampler" },
  { label: "Shakuhachi", value: "shakuhachi", type: "sampler" },
  { label: "Whistle", value: "whistle", type: "sampler" },
  { label: "Ocarina", value: "ocarina", type: "sampler" },
  { label: "Lead 1 (Square)", value: "lead_1_square", type: "sampler" },
  { label: "Lead 2 (Sawtooth)", value: "lead_2_sawtooth", type: "sampler" },
  { label: "Lead 3 (Calliope)", value: "lead_3_calliope", type: "sampler" },
  { label: "Lead 4 (Chiff)", value: "lead_4_chiff", type: "sampler" },
  { label: "Lead 5 (Charang)", value: "lead_5_charang", type: "sampler" },
  { label: "Lead 6 (Voice)", value: "lead_6_voice", type: "sampler" },
  { label: "Lead 7 (Fifths)", value: "lead_7_fifths", type: "sampler" },
  { label: "Lead 8 (Bass+Lead)", value: "lead_8_bass__lead", type: "sampler" },
  { label: "Pad 1 (New Age)", value: "pad_1_new_age", type: "sampler" },
  { label: "Pad 2 (Warm)", value: "pad_2_warm", type: "sampler" },
  { label: "Pad 3 (Polysynth)", value: "pad_3_polysynth", type: "sampler" },
  { label: "Pad 4 (Choir)", value: "pad_4_choir", type: "sampler" },
  { label: "Pad 5 (Bowed)", value: "pad_5_bowed", type: "sampler" },
  { label: "Pad 6 (Metallic)", value: "pad_6_metallic", type: "sampler" },
  { label: "Pad 7 (Halo)", value: "pad_7_halo", type: "sampler" },
  { label: "Pad 8 (Sweep)", value: "pad_8_sweep", type: "sampler" },
  { label: "FX 1 (Rain)", value: "fx_1_rain", type: "sampler" },
  { label: "FX 2 (Soundtrack)", value: "fx_2_soundtrack", type: "sampler" },
  { label: "FX 3 (Crystal)", value: "fx_3_crystal", type: "sampler" },
  { label: "FX 4 (Atmosphere)", value: "fx_4_atmosphere", type: "sampler" },
  { label: "FX 5 (Brightness)", value: "fx_5_brightness", type: "sampler" },
  { label: "FX 6 (Goblins)", value: "fx_6_goblins", type: "sampler" },
  { label: "FX 7 (Echoes)", value: "fx_7_echoes", type: "sampler" },
  { label: "FX 8 (Sci-Fi)", value: "fx_8_scifi", type: "sampler" },
  { label: "Sitar", value: "sitar", type: "sampler" },
  { label: "Banjo", value: "banjo", type: "sampler" },
  { label: "Shamisen", value: "shamisen", type: "sampler" },
  { label: "Koto", value: "koto", type: "sampler" },
  { label: "Kalimba", value: "kalimba", type: "sampler" },
  { label: "Bag pipe", value: "bagpipe", type: "sampler" },
  { label: "Fiddle", value: "fiddle", type: "sampler" },
  { label: "Shanai", value: "shanai", type: "sampler" },
  { label: "Tinkle Bell", value: "tinkle_bell", type: "sampler" },
  { label: "Agogo", value: "agogo", type: "sampler" },
  { label: "Steel Drums", value: "steel_drums", type: "sampler" },
  { label: "Woodblock", value: "woodblock", type: "sampler" },
  { label: "Taiko Drum", value: "taiko_drum", type: "sampler" },
  { label: "Melodic Tom", value: "melodic_tom", type: "sampler" },
  { label: "Synth Drum", value: "synth_drum", type: "sampler" },
  { label: "Reverse Cymbal", value: "reverse_cymbal", type: "sampler" },
  { label: "Guitar Fret Noise", value: "guitar_fret_noise", type: "sampler" },
  { label: "Breath Noise", value: "breath_noise", type: "sampler" },
  { label: "Seashore", value: "seashore", type: "sampler" },
  { label: "Bird Tweet", value: "bird_tweet", type: "sampler" },
  { label: "Telephone Ring", value: "telephone_ring", type: "sampler" },
  { label: "Helicopter", value: "helicopter", type: "sampler" },
  { label: "Applause", value: "applause", type: "sampler" },
  { label: "Gunshot", value: "gunshot", type: "sampler" },
  { label: "Drums (TR-808)", value: "Drums (TR-808)", type: "drum" }
];

const MELODIC_NOTES = ["C4"];
const DRUM_NOTES = ["C4"];

function baseUrl(inst) {
  if (inst === "Drums (TR-808)") {
    return "https://dave4mpls.github.io/midi-js-soundfonts-with-drums/FluidR3_GM/percussion-mp3/";
  }
  return `https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/${inst}-mp3/`;
}

export function createInstrument(nameOrValue) {
  const legacy = LEGACY_MAP[nameOrValue];
  const lookup = legacy || nameOrValue;
  const entry = INSTRUMENTS.find(i => i.value === lookup || i.label === lookup);
  const isDrumInst = (entry && entry.type === "drum") || lookup === "Drums (TR-808)";

  if (isDrumInst) {
    // Use synthetic drum for timing accuracy
    const synth = new Tone.MembraneSynth();
    synth.ready = Promise.resolve();
    return synth;
  }

  const instName = entry ? entry.value : lookup;
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
    onload: () => resolveReady(),
    onerror: (e) => { console.warn("sample load error", e); resolveReady(); },
    release: 1
  });
  sampler.ready = ready;
  return sampler;
}

export function isDrum(nameOrValue) {
  if (nameOrValue === "Drums (Kit)" || nameOrValue === "Drums (TR-808)") return true;
  const legacy = LEGACY_MAP[nameOrValue];
  const lookup = legacy || nameOrValue;
  const entry = INSTRUMENTS.find(i => i.value === lookup || i.label === lookup);
  return !!entry && entry.type === "drum";
}
