// The pinned npm distribution is loaded before the app by index.html.
export const {
  start, Transport, Destination, Frequency, Part, Gain, Panner, Sampler,
  MembraneSynth, Reverb, FeedbackDelay, Chorus, EQ3, Distortion, Compressor, Limiter
} = globalThis.Tone;
