/**
 * WSOLA time-stretching (pitch-preserving).
 *
 * factor > 1 lengthens the audio (slower), factor < 1 shortens it (faster).
 * The waveform-similarity search runs on the mono mix so every channel is
 * cut at the same positions and stereo imaging stays intact.
 */

const WINDOW = 2048;
const SYNTH_HOP = 512;

function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const len = Math.min(...channels.map((c) => c.length));
  const out = new Float32Array(len);
  for (const ch of channels) {
    for (let i = 0; i < len; i++) out[i] += ch[i] / channels.length;
  }
  return out;
}

export function timeStretchChannels(channels: Float32Array[], factor: number): Float32Array[] {
  if (channels.length === 0) return [];
  const inLen = Math.min(...channels.map((c) => c.length));
  if (inLen === 0 || !Number.isFinite(factor) || factor <= 0) {
    return channels.map((c) => c.slice());
  }
  const clamped = Math.min(2, Math.max(0.5, factor));
  if (Math.abs(clamped - 1) < 0.001) return channels.map((c) => c.slice());

  const mono = mixToMono(channels);
  const anaHop = SYNTH_HOP / clamped;
  const outLen = Math.floor(inLen * clamped);
  const outputs = channels.map(() => new Float32Array(outLen + WINDOW));
  const norm = new Float32Array(outLen + WINDOW);

  // Hann window
  const win = new Float32Array(WINDOW);
  for (let i = 0; i < WINDOW; i++) win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (WINDOW - 1)));

  const tolerance = Math.floor(anaHop);
  let inPos = 0; // fractional analysis position
  let prevInPos = -1;

  for (let outPos = 0; outPos < outLen; outPos += SYNTH_HOP) {
    const expected = Math.round(inPos);
    let bestPos = expected;

    if (prevInPos >= 0) {
      // Search around the expected position for the segment most similar
      // to the tail of the already-synthesized output.
      const lo = Math.max(0, expected - tolerance);
      const hi = Math.min(inLen - WINDOW, expected + tolerance);
      let bestCorr = -Infinity;
      const cmpLen = SYNTH_HOP;
      for (let cand = lo; cand <= hi; cand += 4) {
        let corr = 0;
        for (let i = 0; i < cmpLen; i++) {
          corr += mono[cand + i] * (outputs[0][outPos + i] / (norm[outPos + i] || 1));
        }
        if (corr > bestCorr) {
          bestCorr = corr;
          bestPos = cand;
        }
      }
    }
    bestPos = Math.min(bestPos, Math.max(0, inLen - WINDOW));

    for (let ch = 0; ch < channels.length; ch++) {
      const src = channels[ch];
      const dst = outputs[ch];
      for (let i = 0; i < WINDOW; i++) {
        dst[outPos + i] += src[bestPos + i] * win[i];
      }
    }
    for (let i = 0; i < WINDOW; i++) norm[outPos + i] += win[i];

    prevInPos = bestPos;
    inPos += anaHop;
    if (inPos > inLen - WINDOW) break;
  }

  return outputs.map((dst) => {
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const n = norm[i];
      out[i] = n > 1e-6 ? dst[i] / n : 0;
    }
    return out;
  });
}
