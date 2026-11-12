// YIN pitch detector
export class YinDetector {
  constructor(sampleRate, minFreq = 70, maxFreq = 900) {
    this.sr = sampleRate;
    this.minFreq = minFreq;
    this.maxFreq = maxFreq;
    this.minTau = Math.floor(sampleRate / maxFreq);
    this.maxTau = Math.floor(sampleRate / minFreq);
  }

  detect(buffer) {
    const n = buffer.length;
    const tauMax = Math.min(this.maxTau, n / 2);
    // difference function
    const diff = new Float32Array(tauMax + 1);
    for (let tau = 0; tau <= tauMax; tau++) {
      let sum = 0;
      for (let j = 0; j < n - tau; j++) {
        const d = buffer[j] - buffer[j + tau];
        sum += d * d;
      }
      diff[tau] = sum;
    }
    // cumulative mean normalized difference
    const cmnd = new Float32Array(tauMax + 1);
    cmnd[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      running += diff[tau];
      cmnd[tau] = running === 0 ? 1 : diff[tau] * tau / running;
    }
    // find first tau below threshold
    const threshold = 0.15;
    let tau = -1;
    for (let t = this.minTau; t < tauMax; t++) {
      if (cmnd[t] < threshold) {
        // local minimum
        while (t + 1 < tauMax && cmnd[t + 1] < cmnd[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau === -1) {
      // global min in range
      let minVal = Infinity, minTau = -1;
      for (let t = this.minTau; t < tauMax; t++) {
        if (cmnd[t] < minVal) { minVal = cmnd[t]; minTau = t; }
      }
      if (minVal < 0.5) tau = minTau;
    }
    if (tau === -1) return { freq: -1, confidence: 0 };
    // parabolic interpolation
    let betterTau = tau;
    if (tau > 0 && tau < tauMax) {
      const x0 = cmnd[tau - 1], x1 = cmnd[tau], x2 = cmnd[tau + 1];
      const denom = 2 * (2 * x1 - x2 - x0);
      if (denom !== 0) betterTau = tau + (x2 - x0) / denom;
    }
    const freq = this.sr / betterTau;
    const confidence = 1 - cmnd[tau];
    return { freq, confidence };
  }
}

export function freqToMidi(freq) {
  if (freq <= 0) return -1;
  return 69 + 12 * Math.log2(freq / 440);
}

export function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

export function rms(buffer) {
  let s = 0;
  for (let i = 0; i < buffer.length; i++) s += buffer[i] * buffer[i];
  return Math.sqrt(s / buffer.length);
}
