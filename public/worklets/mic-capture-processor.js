/**
 * Zero-latency direct PCM recorder & optional live Auto-Tune monitor AudioWorkletProcessor.
 */
class MicCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.monitorEnabled = false;
    this.livePitchShift = false;
    this.correction = 0.85;
    this.scaleMask = new Array(12).fill(true);

    // Live ring buffer for pitch detection & dual-head granular shifter
    this.ringSize = 4096;
    this.ring = new Float32Array(this.ringSize);
    this.writePtr = 0;
    this.phaseA = 0;
    this.phaseB = 0.5;
    this.grainLen = 1024;
    this.currentRatio = 1.0;
    this.targetRatio = 1.0;
    this.sampleCounter = 0;

    this.port.onmessage = (e) => {
      const msg = e.data;
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "config") {
        if (typeof msg.recording === "boolean") this.recording = msg.recording;
        if (typeof msg.monitorEnabled === "boolean") this.monitorEnabled = msg.monitorEnabled;
        if (typeof msg.livePitchShift === "boolean") this.livePitchShift = msg.livePitchShift;
        if (typeof msg.correction === "number") this.correction = msg.correction;
        if (Array.isArray(msg.scaleMask) && msg.scaleMask.length === 12) {
          this.scaleMask = msg.scaleMask;
        }
      }
    };
  }

  snapMidi(midiFloat) {
    let best = Math.round(midiFloat);
    let bestDist = 999;
    const center = Math.round(midiFloat);
    for (let m = center - 12; m <= center + 12; m++) {
      const pc = ((m % 12) + 12) % 12;
      if (!this.scaleMask[pc]) continue;
      const d = Math.abs(m - midiFloat);
      if (d < bestDist) {
        bestDist = d;
        best = m;
      }
    }
    return best;
  }

  estimatePitchRatio() {
    const N = 1024;
    const minLag = Math.max(24, Math.floor(sampleRate / 950));
    const maxLag = Math.min(512, Math.floor(sampleRate / 70));

    let energy = 0;
    for (let i = 0; i < N; i++) {
      const s = this.ring[(this.writePtr - N + i + this.ringSize) % this.ringSize];
      energy += s * s;
    }
    const rms = Math.sqrt(energy / N);
    if (rms < 0.012) return 1.0;

    let bestLag = -1;
    let bestDiff = 1e9;
    let avgEnergy = 0;

    for (let lag = minLag; lag <= maxLag; lag++) {
      let diff = 0;
      for (let i = 0; i < 512; i += 2) {
        const a = this.ring[(this.writePtr - N + i + this.ringSize) % this.ringSize];
        const b = this.ring[(this.writePtr - N + i + lag + this.ringSize) % this.ringSize];
        const d = a - b;
        diff += d * d;
      }
      avgEnergy += diff;
      if (diff < bestDiff) {
        bestDiff = diff;
        bestLag = lag;
      }
    }

    const meanDiff = avgEnergy / Math.max(1, maxLag - minLag + 1);
    if (bestLag <= 0 || bestDiff > meanDiff * 0.25) return 1.0;

    const f0 = sampleRate / bestLag;
    const midi = 69 + 12 * Math.log2(f0 / 440);
    const target = this.snapMidi(midi);
    const shiftedMidi = midi + (target - midi) * this.correction;
    const ratio = Math.pow(2, (shiftedMidi - midi) / 12);
    return Math.max(0.5, Math.min(2.0, ratio));
  }

  readRing(delaySamples) {
    const pos = this.writePtr - delaySamples;
    const idx = ((Math.floor(pos) % this.ringSize) + this.ringSize) % this.ringSize;
    const next = (idx + 1) % this.ringSize;
    const frac = pos - Math.floor(pos);
    return this.ring[idx] * (1 - frac) + this.ring[next] * frac;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0]) return true;

    const ch0 = input[0];
    const n = ch0.length;

    if (this.recording) {
      const copy = new Float32Array(ch0);
      this.port.postMessage({ type: "chunk", samples: copy }, [copy.buffer]);
    }

    for (let i = 0; i < n; i++) {
      const s = ch0[i];
      this.ring[this.writePtr] = s;
      this.writePtr = (this.writePtr + 1) % this.ringSize;
      this.sampleCounter++;

      if (this.livePitchShift && this.sampleCounter % 256 === 0) {
        this.targetRatio = this.estimatePitchRatio();
      }
      this.currentRatio += (this.targetRatio - this.currentRatio) * 0.008;

      if (output && output[0]) {
        let outSample = 0;
        if (this.monitorEnabled) {
          if (!this.livePitchShift || Math.abs(this.currentRatio - 1.0) < 0.004) {
            outSample = s;
          } else {
            const speed = (1 - this.currentRatio) / this.grainLen;
            this.phaseA = (this.phaseA + speed + 1) % 1;
            this.phaseB = (this.phaseB + speed + 1) % 1;

            const dA = 64 + this.phaseA * this.grainLen;
            const dB = 64 + this.phaseB * this.grainLen;
            const wA = 0.5 * (1 - Math.cos(2 * Math.PI * this.phaseA));
            const wB = 0.5 * (1 - Math.cos(2 * Math.PI * this.phaseB));

            outSample = this.readRing(dA) * wA + this.readRing(dB) * wB;
          }
        }
        for (let ch = 0; ch < output.length; ch++) {
          output[ch][i] = outSample;
        }
      }
    }

    return true;
  }
}

registerProcessor("mic-capture-processor", MicCaptureProcessor);
