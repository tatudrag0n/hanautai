import * as Tone from "tone";

export class FxChain {
  constructor() {
    this.reverb = new Tone.Reverb({ decay: 2.5, wet: 0.25 });
    this.delay = new Tone.FeedbackDelay("8n", 0.35);
    this.delay.wet.value = 0.15;
    this.chorus = new Tone.Chorus(4, 2.5, 0.3);
    this.chorus.wet.value = 0;
    this.eq = new Tone.EQ3({ low: 0, mid: 0, high: 0 });
    this.dist = new Tone.Distortion(0);
    this.comp = new Tone.Compressor({ threshold: -24, ratio: 4, attack: 0.01, release: 0.1 });
    this.comp.wet = undefined;
    this.limiter = new Tone.Limiter(-1);
    this.masterGain = new Tone.Gain(0.9);

    // chain: input -> eq -> dist -> comp -> chorus -> delay -> reverb -> limiter -> gain -> dest
    this.input = new Tone.Gain(1);
    this.input.connect(this.eq);
    this.eq.connect(this.dist);
    this.dist.connect(this.comp);
    this.comp.connect(this.chorus);
    this.chorus.connect(this.delay);
    this.delay.connect(this.reverb);
    this.reverb.connect(this.limiter);
    this.limiter.connect(this.masterGain);
    this.masterGain.connect(Tone.Destination);
    this.chorus.start();
  }

  set(values) {
    this.reverb.wet.value = values.reverb;
    this.delay.wet.value = values.delay;
    this.chorus.wet.value = values.chorus;
    this.eq.low.value = values.eqLow;
    this.eq.mid.value = values.eqMid;
    this.eq.high.value = values.eqHigh;
    this.dist.distortion = values.dist;
    this.dist.wet.value = values.dist > 0 ? 1 : 0;
    // compressor amount via threshold
    this.comp.threshold.value = -12 - values.comp * 24;
  }

  dispose() {
    [this.reverb,this.delay,this.chorus,this.eq,this.dist,this.comp,this.limiter,this.masterGain,this.input].forEach(n=>{try{n.dispose();}catch(e){}});
  }
}
