import type {
  CompSettings,
  EqSettings,
  MasterSettings,
  ModSettings,
  PitchSettings,
  SatSettings,
  SpaceBusSettings,
  TrackFxSettings,
  TrackRole,
} from "../types/studio";

export function defaultPitchSettings(role: TrackRole = "vocal"): PitchSettings {
  const isVocal = role === "vocal" || role === "harmony";
  return {
    enabled: isVocal,
    bypass: false,
    keyRoot: 0,
    scale: "major",
    customNotes: [true, false, true, false, true, true, false, true, false, true, false, true],
    scaleLock: true,
    correction: role === "vocal" ? 0.85 : role === "harmony" ? 0.92 : 0,
    retuneSpeedMs: role === "vocal" ? 42 : 25,
    vibratoCut: role === "harmony" ? 0.35 : 0.12,
    formantShift: 0,
    preserveConsonants: true,
  };
}

export function defaultEq(role: TrackRole = "vocal"): EqSettings {
  if (role === "vocal") {
    return {
      enabled: true,
      hpfEnabled: true,
      hpfFreq: 95,
      lowFreq: 160,
      lowGain: -1.5,
      midFreq: 2600,
      midGain: 2.5,
      midQ: 1.2,
      highFreq: 8500,
      highGain: 3.0,
    };
  }
  if (role === "harmony") {
    return {
      enabled: true,
      hpfEnabled: true,
      hpfFreq: 160,
      lowFreq: 180,
      lowGain: -2.5,
      midFreq: 2200,
      midGain: -1.0,
      midQ: 1.1,
      highFreq: 9000,
      highGain: 2.0,
    };
  }
  if (role === "bass") {
    return {
      enabled: true,
      hpfEnabled: true,
      hpfFreq: 32,
      lowFreq: 95,
      lowGain: 2.5,
      midFreq: 800,
      midGain: -2.0,
      midQ: 1.4,
      highFreq: 4500,
      highGain: -2.0,
    };
  }
  if (role === "drums") {
    return {
      enabled: true,
      hpfEnabled: true,
      hpfFreq: 30,
      lowFreq: 80,
      lowGain: 2.0,
      midFreq: 450,
      midGain: -2.0,
      midQ: 1.6,
      highFreq: 8000,
      highGain: 2.2,
    };
  }
  return {
    enabled: true,
    hpfEnabled: true,
    hpfFreq: 110,
    lowFreq: 150,
    lowGain: -1.0,
    midFreq: 1600,
    midGain: 0.5,
    midQ: 1.0,
    highFreq: 7500,
    highGain: 1.5,
  };
}

export function defaultComp(role: TrackRole = "vocal"): CompSettings {
  if (role === "vocal" || role === "harmony") {
    return {
      enabled: true,
      threshold: -19,
      ratio: 3.5,
      attackMs: 8,
      releaseMs: 110,
      knee: 6,
      makeupDb: 3.0,
      deEsserAmount: 0.35,
      deEsserFreq: 6800,
      gateThreshold: -80,
    };
  }
  if (role === "bass") {
    return {
      enabled: true,
      threshold: -18,
      ratio: 4.0,
      attackMs: 14,
      releaseMs: 140,
      knee: 4,
      makeupDb: 2.5,
      deEsserAmount: 0,
      deEsserFreq: 6500,
      gateThreshold: -80,
    };
  }
  if (role === "drums") {
    return {
      enabled: true,
      threshold: -15,
      ratio: 3.0,
      attackMs: 18,
      releaseMs: 90,
      knee: 4,
      makeupDb: 2.0,
      deEsserAmount: 0,
      deEsserFreq: 6500,
      gateThreshold: -80,
    };
  }
  return {
    enabled: false,
    threshold: -16,
    ratio: 2.5,
    attackMs: 15,
    releaseMs: 150,
    knee: 6,
    makeupDb: 1.5,
    deEsserAmount: 0,
    deEsserFreq: 6500,
    gateThreshold: -80,
  };
}

export function defaultSat(role: TrackRole = "vocal"): SatSettings {
  return {
    enabled: role === "vocal" || role === "bass",
    mode: role === "bass" ? "tape" : "tube",
    drive: role === "vocal" ? 0.18 : role === "bass" ? 0.25 : 0.15,
    tone: role === "vocal" ? 0.15 : 0,
    mix: role === "vocal" ? 0.32 : 0.35,
  };
}

export function defaultMod(role: TrackRole = "vocal"): ModSettings {
  return {
    enabled: role === "harmony" || role === "instrument",
    mode: role === "harmony" ? "doubler" : "wide",
    rate: role === "harmony" ? 0.7 : 0.45,
    depth: role === "harmony" ? 0.45 : 0.3,
    mix: role === "harmony" ? 0.42 : 0.25,
  };
}

export function defaultTrackFx(role: TrackRole = "vocal"): TrackFxSettings {
  return {
    order: ["eq", "comp", "sat", "mod"],
    eq: defaultEq(role),
    comp: defaultComp(role),
    sat: defaultSat(role),
    mod: defaultMod(role),
  };
}

export function defaultSpaceBus(): SpaceBusSettings {
  return {
    reverbType: "plate",
    reverbReturnDb: -2,
    reverbDecay: 1.75,
    reverbPreDelayMs: 18,
    reverbDamping: 6800,
    reverbWidth: 0.9,
    delaySync: "1/8",
    delayReturnDb: -4,
    delayTimeMs: 250,
    delayFeedback: 0.34,
    delayHighCut: 4200,
    delayPingPong: true,
  };
}

export function defaultMaster(): MasterSettings {
  return {
    volumeDb: 0,
    mono: false,
    width: 1.05,
    eqLowDb: 0.5,
    eqMidDb: 0,
    eqHighDb: 0.8,
    glueEnabled: true,
    glueThreshold: -12,
    glueRatio: 2.2,
    limiterEnabled: true,
    limiterCeilingDb: -0.3,
  };
}

export interface PitchPreset {
  id: string;
  label: string;
  desc: string;
  patch: Partial<PitchSettings>;
}

export const PITCH_PRESETS: PitchPreset[] = [
  {
    id: "natural",
    label: "ナチュラル補正",
    desc: "表現力とビブラートを残した自然な音程補正",
    patch: {
      enabled: true,
      bypass: false,
      correction: 0.72,
      retuneSpeedMs: 75,
      vibratoCut: 0.05,
      formantShift: 0,
    },
  },
  {
    id: "pop",
    label: "現代J-POP / 歌ってみた",
    desc: "芯のある正確なピッチでオケにピタッと馴染む",
    patch: {
      enabled: true,
      bypass: false,
      correction: 0.92,
      retuneSpeedMs: 28,
      vibratoCut: 0.22,
      formantShift: 0,
    },
  },
  {
    id: "kerokero",
    label: "ケロケロ (Hard Tune)",
    desc: "追従0msの定番エレクトロ・ケロケロボイス",
    patch: {
      enabled: true,
      bypass: false,
      correction: 1.0,
      retuneSpeedMs: 0,
      vibratoCut: 0.95,
      formantShift: 0,
    },
  },
  {
    id: "bright_air",
    label: "透明ハイトーン",
    desc: "フォルマント+1.5で抜ける明るさとタイトな補正",
    patch: {
      enabled: true,
      bypass: false,
      correction: 0.9,
      retuneSpeedMs: 32,
      vibratoCut: 0.25,
      formantShift: 1.5,
    },
  },
  {
    id: "deep_vocal",
    label: "チェスト / 太めボイス",
    desc: "フォルマント-2.2で落ち着きと厚みのある声質へ",
    patch: {
      enabled: true,
      bypass: false,
      correction: 0.85,
      retuneSpeedMs: 45,
      vibratoCut: 0.15,
      formantShift: -2.2,
    },
  },
];

export interface ChannelStripPreset {
  id: string;
  label: string;
  desc: string;
  fx: TrackFxSettings;
  sendReverb: number;
  sendDelay: number;
}

export const CHANNEL_FX_PRESETS: ChannelStripPreset[] = [
  {
    id: "utattemita_lead",
    label: "歌ってみたリード",
    desc: "抜けの良い煌びやかなEQ + 安定コンプ + 艶サチュレーション",
    sendReverb: 0.28,
    sendDelay: 0.18,
    fx: {
      order: ["eq", "comp", "sat", "mod"],
      eq: {
        enabled: true,
        hpfEnabled: true,
        hpfFreq: 100,
        lowFreq: 170,
        lowGain: -2.0,
        midFreq: 2900,
        midGain: 3.2,
        midQ: 1.3,
        highFreq: 9500,
        highGain: 3.8,
      },
      comp: {
        enabled: true,
        threshold: -21,
        ratio: 4.0,
        attackMs: 6,
        releaseMs: 95,
        knee: 5,
        makeupDb: 4.0,
        deEsserAmount: 0.45,
        deEsserFreq: 6800,
        gateThreshold: -65,
      },
      sat: {
        enabled: true,
        mode: "tube",
        drive: 0.22,
        tone: 0.25,
        mix: 0.35,
      },
      mod: {
        enabled: true,
        mode: "doubler",
        rate: 0.6,
        depth: 0.25,
        mix: 0.16,
      },
    },
  },
  {
    id: "whisper_ballad",
    label: "透明感ウィスパー",
    desc: "空気感のある高域と広がる立体空間",
    sendReverb: 0.48,
    sendDelay: 0.26,
    fx: {
      order: ["eq", "comp", "sat", "mod"],
      eq: {
        enabled: true,
        hpfEnabled: true,
        hpfFreq: 115,
        lowFreq: 180,
        lowGain: -1.5,
        midFreq: 1900,
        midGain: 1.2,
        midQ: 0.9,
        highFreq: 10500,
        highGain: 5.0,
      },
      comp: {
        enabled: true,
        threshold: -24,
        ratio: 3.2,
        attackMs: 12,
        releaseMs: 140,
        knee: 8,
        makeupDb: 3.5,
        deEsserAmount: 0.5,
        deEsserFreq: 7200,
        gateThreshold: -72,
      },
      sat: {
        enabled: true,
        mode: "tape",
        drive: 0.16,
        tone: 0.1,
        mix: 0.28,
      },
      mod: {
        enabled: true,
        mode: "wide",
        rate: 0.45,
        depth: 0.4,
        mix: 0.32,
      },
    },
  },
  {
    id: "rock_vocal",
    label: "ロック・アグレッシブ",
    desc: "前に張り付く強コンプと中域のドライブ感",
    sendReverb: 0.2,
    sendDelay: 0.24,
    fx: {
      order: ["comp", "eq", "sat", "mod"],
      eq: {
        enabled: true,
        hpfEnabled: true,
        hpfFreq: 110,
        lowFreq: 160,
        lowGain: -2.5,
        midFreq: 2100,
        midGain: 4.5,
        midQ: 1.5,
        highFreq: 7500,
        highGain: 2.8,
      },
      comp: {
        enabled: true,
        threshold: -23,
        ratio: 6.0,
        attackMs: 3,
        releaseMs: 75,
        knee: 3,
        makeupDb: 5.5,
        deEsserAmount: 0.4,
        deEsserFreq: 6400,
        gateThreshold: -60,
      },
      sat: {
        enabled: true,
        mode: "crisp",
        drive: 0.36,
        tone: 0.3,
        mix: 0.42,
      },
      mod: {
        enabled: false,
        mode: "doubler",
        rate: 0.8,
        depth: 0.3,
        mix: 0.2,
      },
    },
  },
  {
    id: "radio_lofi",
    label: "ラジオ / Lo-Fi",
    desc: "帯域を絞った味のある電話・ラジオ風",
    sendReverb: 0.12,
    sendDelay: 0.15,
    fx: {
      order: ["eq", "sat", "comp", "mod"],
      eq: {
        enabled: true,
        hpfEnabled: true,
        hpfFreq: 380,
        lowFreq: 420,
        lowGain: -8.0,
        midFreq: 1450,
        midGain: 6.5,
        midQ: 1.8,
        highFreq: 3200,
        highGain: -10.0,
      },
      comp: {
        enabled: true,
        threshold: -22,
        ratio: 5.0,
        attackMs: 4,
        releaseMs: 80,
        knee: 2,
        makeupDb: 4.5,
        deEsserAmount: 0,
        deEsserFreq: 6500,
        gateThreshold: -80,
      },
      sat: {
        enabled: true,
        mode: "lofi",
        drive: 0.45,
        tone: -0.2,
        mix: 0.6,
      },
      mod: {
        enabled: false,
        mode: "chorus",
        rate: 1.1,
        depth: 0.3,
        mix: 0.2,
      },
    },
  },
  {
    id: "flat_clean",
    label: "クリーン / 初期化",
    desc: "全エフェクトをフラットな初期状態に戻す",
    sendReverb: 0.12,
    sendDelay: 0.06,
    fx: {
      order: ["eq", "comp", "sat", "mod"],
      eq: {
        enabled: false,
        hpfEnabled: false,
        hpfFreq: 80,
        lowFreq: 120,
        lowGain: 0,
        midFreq: 1500,
        midGain: 0,
        midQ: 1.0,
        highFreq: 8000,
        highGain: 0,
      },
      comp: {
        enabled: false,
        threshold: -18,
        ratio: 3.0,
        attackMs: 10,
        releaseMs: 120,
        knee: 6,
        makeupDb: 0,
        deEsserAmount: 0,
        deEsserFreq: 6500,
        gateThreshold: -80,
      },
      sat: {
        enabled: false,
        mode: "tube",
        drive: 0.15,
        tone: 0,
        mix: 0.3,
      },
      mod: {
        enabled: false,
        mode: "doubler",
        rate: 0.6,
        depth: 0.3,
        mix: 0.25,
      },
    },
  },
];
