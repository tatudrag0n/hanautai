import * as Tone from "tone";
import * as smplr from "smplr";

export const INSTRUMENTS = [
  { label: "Piano (Grand)", value: "acoustic_grand_piano", type: "soundfont" },
  { label: "Piano (Bright)", value: "bright_acoustic_piano", type: "soundfont" },
  { label: "Electric Piano 1", value: "electric_piano_1", type: "soundfont" },
  { label: "Electric Piano 2", value: "electric_piano_2", type: "soundfont" },
  { label: "Honky-tonk Piano", value: "honkytonk_piano", type: "soundfont" },
  { label: "Harpsichord", value: "harpsichord", type: "soundfont" },
  { label: "Clavinet", value: "clavinet", type: "soundfont" },
  { label: "Celesta", value: "celesta", type: "soundfont" },
  { label: "Glockenspiel", value: "glockenspiel", type: "soundfont" },
  { label: "Music Box", value: "music_box", type: "soundfont" },
  { label: "Vibraphone", value: "vibraphone", type: "soundfont" },
  { label: "Marimba", value: "marimba", type: "soundfont" },
  { label: "Xylophone", value: "xylophone", type: "soundfont" },
  { label: "Tubular Bells", value: "tubular_bells", type: "soundfont" },
  { label: "Dulcimer", value: "dulcimer", type: "soundfont" },
  { label: "Drawbar Organ", value: "drawbar_organ", type: "soundfont" },
  { label: "Percussive Organ", value: "percussive_organ", type: "soundfont" },
  { label: "Rock Organ", value: "rock_organ", type: "soundfont" },
  { label: "Church Organ", value: "church_organ", type: "soundfont" },
  { label: "Reed Organ", value: "reed_organ", type: "soundfont" },
  { label: "Accordion", value: "accordion", type: "soundfont" },
  { label: "Harmonica", value: "harmonica", type: "soundfont" },
  { label: "Tango Accordion", value: "tango_accordion", type: "soundfont" },
  { label: "Acoustic Guitar (Nylon)", value: "acoustic_guitar_nylon", type: "soundfont" },
  { label: "Acoustic Guitar (Steel)", value: "acoustic_guitar_steel", type: "soundfont" },
  { label: "Electric Guitar (Jazz)", value: "electric_guitar_jazz", type: "soundfont" },
  { label: "Electric Guitar (Clean)", value: "electric_guitar_clean", type: "soundfont" },
  { label: "Electric Guitar (Muted)", value: "electric_guitar_muted", type: "soundfont" },
  { label: "Overdriven Guitar", value: "overdriven_guitar", type: "soundfont" },
  { label: "Distortion Guitar", value: "distortion_guitar", type: "soundfont" },
  { label: "Acoustic Bass", value: "acoustic_bass", type: "soundfont" },
  { label: "Electric Bass (Finger)", value: "electric_bass_finger", type: "soundfont" },
  { label: "Electric Bass (Pick)", value: "electric_bass_pick", type: "soundfont" },
  { label: "Fretless Bass", value: "fretless_bass", type: "soundfont" },
  { label: "Slap Bass 1", value: "slap_bass_1", type: "soundfont" },
  { label: "Slap Bass 2", value: "slap_bass_2", type: "soundfont" },
  { label: "Synth Bass 1", value: "synth_bass_1", type: "soundfont" },
  { label: "Synth Bass 2", value: "synth_bass_2", type: "soundfont" },
  { label: "Violin", value: "violin", type: "soundfont" },
  { label: "Viola", value: "viola", type: "soundfont" },
  { label: "Cello", value: "cello", type: "soundfont" },
  { label: "Contrabass", value: "contrabass", type: "soundfont" },
  { label: "Tremolo Strings", value: "tremolo_strings", type: "soundfont" },
  { label: "Pizzicato Strings", value: "pizzicato_strings", type: "soundfont" },
  { label: "Orchestral Harp", value: "orchestral_harp", type: "soundfont" },
  { label: "Timpani", value: "timpani", type: "soundfont" },
  { label: "String Ensemble 1", value: "string_ensemble_1", type: "soundfont" },
  { label: "String Ensemble 2", value: "string_ensemble_2", type: "soundfont" },
  { label: "Synth Strings 1", value: "synth_strings_1", type: "soundfont" },
  { label: "Synth Strings 2", value: "synth_strings_2", type: "soundfont" },
  { label: "Choir Aahs", value: "choir_aahs", type: "soundfont" },
  { label: "Voice Oohs", value: "voice_oohs", type: "soundfont" },
  { label: "Synth Choir", value: "synth_choir", type: "soundfont" },
  { label: "Orchestra Hit", value: "orchestra_hit", type: "soundfont" },
  { label: "Trumpet", value: "trumpet", type: "soundfont" },
  { label: "Trombone", value: "trombone", type: "soundfont" },
  { label: "Tuba", value: "tuba", type: "soundfont" },
  { label: "Muted Trumpet", value: "muted_trumpet", type: "soundfont" },
  { label: "French Horn", value: "french_horn", type: "soundfont" },
  { label: "Brass Section", value: "brass_section", type: "soundfont" },
  { label: "Synth Brass 1", value: "synth_brass_1", type: "soundfont" },
  { label: "Synth Brass 2", value: "synth_brass_2", type: "soundfont" },
  { label: "Soprano Sax", value: "soprano_sax", type: "soundfont" },
  { label: "Alto Sax", value: "alto_sax", type: "soundfont" },
  { label: "Tenor Sax", value: "tenor_sax", type: "soundfont" },
  { label: "Baritone Sax", value: "baritone_sax", type: "soundfont" },
  { label: "Oboe", value: "oboe", type: "soundfont" },
  { label: "English Horn", value: "english_horn", type: "soundfont" },
  { label: "Bassoon", value: "bassoon", type: "soundfont" },
  { label: "Clarinet", value: "clarinet", type: "soundfont" },
  { label: "Piccolo", value: "piccolo", type: "soundfont" },
  { label: "Flute", value: "flute", type: "soundfont" },
  { label: "Recorder", value: "recorder", type: "soundfont" },
  { label: "Pan Flute", value: "pan_flute", type: "soundfont" },
  { label: "Blown Bottle", value: "blown_bottle", type: "soundfont" },
  { label: "Shakuhachi", value: "shakuhachi", type: "soundfont" },
  { label: "Whistle", value: "whistle", type: "soundfont" },
  { label: "Ocarina", value: "ocarina", type: "soundfont" },
  { label: "Lead 1 (Square)", value: "lead_1_square", type: "soundfont" },
  { label: "Lead 2 (Sawtooth)", value: "lead_2_sawtooth", type: "soundfont" },
  { label: "Lead 3 (Calliope)", value: "lead_3_calliope", type: "soundfont" },
  { label: "Lead 4 (Chiff)", value: "lead_4_chiff", type: "soundfont" },
  { label: "Lead 5 (Charang)", value: "lead_5_charang", type: "soundfont" },
  { label: "Lead 6 (Voice)", value: "lead_6_voice", type: "soundfont" },
  { label: "Lead 7 (Fifths)", value: "lead_7_fifths", type: "soundfont" },
  { label: "Lead 8 (Bass+Lead)", value: "lead_8_bass__lead", type: "soundfont" },
  { label: "Pad 1 (New Age)", value: "pad_1_new_age", type: "soundfont" },
  { label: "Pad 2 (Warm)", value: "pad_2_warm", type: "soundfont" },
  { label: "Pad 3 (Polysynth)", value: "pad_3_polysynth", type: "soundfont" },
  { label: "Pad 4 (Choir)", value: "pad_4_choir", type: "soundfont" },
  { label: "Pad 5 (Bowed)", value: "pad_5_bowed", type: "soundfont" },
  { label: "Pad 6 (Metallic)", value: "pad_6_metallic", type: "soundfont" },
  { label: "Pad 7 (Halo)", value: "pad_7_halo", type: "soundfont" },
  { label: "Pad 8 (Sweep)", value: "pad_8_sweep", type: "soundfont" },
  { label: "FX 1 (Rain)", value: "fx_1_rain", type: "soundfont" },
  { label: "FX 2 (Soundtrack)", value: "fx_2_soundtrack", type: "soundfont" },
  { label: "FX 3 (Crystal)", value: "fx_3_crystal", type: "soundfont" },
  { label: "FX 4 (Atmosphere)", value: "fx_4_atmosphere", type: "soundfont" },
  { label: "FX 5 (Brightness)", value: "fx_5_brightness", type: "soundfont" },
  { label: "FX 6 (Goblins)", value: "fx_6_goblins", type: "soundfont" },
  { label: "FX 7 (Echoes)", value: "fx_7_echoes", type: "soundfont" },
  { label: "FX 8 (Sci-Fi)", value: "fx_8_scifi", type: "soundfont" },
  { label: "Sitar", value: "sitar", type: "soundfont" },
  { label: "Banjo", value: "banjo", type: "soundfont" },
  { label: "Shamisen", value: "shamisen", type: "soundfont" },
  { label: "Koto", value: "koto", type: "soundfont" },
  { label: "Kalimba", value: "kalimba", type: "soundfont" },
  { label: "Bag pipe", value: "bagpipe", type: "soundfont" },
  { label: "Fiddle", value: "fiddle", type: "soundfont" },
  { label: "Shanai", value: "shanai", type: "soundfont" },
  { label: "Tinkle Bell", value: "tinkle_bell", type: "soundfont" },
  { label: "Agogo", value: "agogo", type: "soundfont" },
  { label: "Steel Drums", value: "steel_drums", type: "soundfont" },
  { label: "Woodblock", value: "woodblock", type: "soundfont" },
  { label: "Taiko Drum", value: "taiko_drum", type: "soundfont" },
  { label: "Melodic Tom", value: "melodic_tom", type: "soundfont" },
  { label: "Synth Drum", value: "synth_drum", type: "soundfont" },
  { label: "Reverse Cymbal", value: "reverse_cymbal", type: "soundfont" },
  { label: "Guitar Fret Noise", value: "guitar_fret_noise", type: "soundfont" },
  { label: "Breath Noise", value: "breath_noise", type: "soundfont" },
  { label: "Seashore", value: "seashore", type: "soundfont" },
  { label: "Bird Tweet", value: "bird_tweet", type: "soundfont" },
  { label: "Telephone Ring", value: "telephone_ring", type: "soundfont" },
  { label: "Helicopter", value: "helicopter", type: "soundfont" },
  { label: "Applause", value: "applause", type: "soundfont" },
  { label: "Gunshot", value: "gunshot", type: "soundfont" },
  { label: "Drums (TR-808)", value: "Drums (TR-808)", type: "drum" }
];

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
  "Drums (Kit)": "Drums (TR-808)"
};
let _cacheStorage = null;
function getCacheStorage() {
  if (!_cacheStorage) {
    try { _cacheStorage = new smplr.CacheStorage("hanautai"); } catch (e) { _cacheStorage = null; }
  }
  return _cacheStorage;
}

export function createInstrument(nameOrValue, ctx) {
  const legacy = LEGACY_MAP[nameOrValue];
  const lookup = legacy || nameOrValue;
  const entry = INSTRUMENTS.find(i => i.value === lookup || i.label === lookup);
  if (!ctx) {
    ctx = (Tone.context && Tone.context.rawContext) ? Tone.context.rawContext : Tone.context;
  }
  const cache = getCacheStorage();
  const opts = cache ? { cacheStorage: cache } : {};
  // Prefer native context from a Tone node if possible (passed in)
  if ((entry && entry.type === "drum") || lookup === "Drums (TR-808)") {
    return new smplr.DrumMachine(ctx, { kit: "TR-808", ...opts });
  }
  const instName = entry ? entry.value : lookup;
  return new smplr.Soundfont(ctx, { instrument: instName, ...opts });
}

export function isDrum(nameOrValue) {
  if (nameOrValue === "Drums (Kit)" || nameOrValue === "Drums (TR-808)") return true;
  const legacy = LEGACY_MAP[nameOrValue];
  const lookup = legacy || nameOrValue;
  const entry = INSTRUMENTS.find(i => i.value === lookup || i.label === lookup);
  return !!entry && entry.type === "drum";
}

export function instrumentValueToLabel(v) {
  const e = INSTRUMENTS.find(i => i.value === v);
  return e ? e.label : v;
}
