import { useCallback, useEffect, useRef, useState } from "react";
import { audioEngine } from "../audio/audioEngine";
import {
  defaultMaster,
  defaultPitchSettings,
  defaultSpaceBus,
  defaultTrackFx,
} from "../audio/presets";
import { createDemoStems } from "../dsp/demoAudio";
import { detectKeyAndScale, getScaleMask, snapMidiToScale } from "../dsp/musicTheory";
import {
  analyzePitch,
  computeMinMaxPeaks,
  splitPitchBlob,
} from "../dsp/pitchAnalysis";
import { synthesizePsola } from "../dsp/psola";
import { encodeWav } from "../dsp/wavExport";
import type {
  AudioClip,
  FxModuleId,
  MasterSettings,
  PitchBlob,
  PitchDrawPoint,
  PitchSettings,
  SpaceBusSettings,
  StudioProject,
  TopViewTab,
  Track,
  TrackFxSettings,
  TrackRole,
} from "../types/studio";

export const TRACK_COLORS = [
  "#38bdf8",
  "#c084fc",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#60a5fa",
  "#f472b6",
  "#2dd4bf",
];

let uidCounter = 1;
export function nextId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${uidCounter++}`;
}

export function buildClipFromAudio(options: {
  id?: string;
  name: string;
  channels: Float32Array[];
  sampleRate: number;
  startTime?: number;
  pitchSettings?: PitchSettings;
  runPitchAnalysis: boolean;
}): AudioClip {
  const { channels, sampleRate, runPitchAnalysis } = options;
  const totalDuration = (channels[0]?.length ?? 0) / sampleRate;
  const peaks = computeMinMaxPeaks(channels, 360);
  const analysis = runPitchAnalysis
    ? analyzePitch(
        channels,
        sampleRate,
        options.pitchSettings?.keyRoot ?? 0,
        options.pitchSettings?.scale ?? "major",
        options.pitchSettings?.customNotes,
      )
    : null;
  const blobs = analysis ? analysis.blobs.map((b) => ({ ...b })) : [];

  let processedChannels: Float32Array[] | null = null;
  if (analysis && options.pitchSettings?.enabled && !options.pitchSettings.bypass) {
    processedChannels = synthesizePsola(
      channels,
      analysis,
      blobs,
      options.pitchSettings,
      [],
    );
  }

  return {
    id: options.id ?? nextId("clip"),
    name: options.name,
    startTime: options.startTime ?? 0,
    offset: 0,
    duration: totalDuration,
    totalDuration,
    gainDb: 0,
    fadeIn: 0.01,
    fadeOut: 0.02,
    rawChannels: channels,
    sampleRate,
    waveformPeaks: peaks,
    analysis,
    blobs,
    drawnPitch: [],
    processedChannels,
  };
}

export function createInitialDemoProject(): StudioProject {
  const demo = createDemoStems(44100);
  const tracks: Track[] = demo.stems.map((stem) => {
    const pitch = defaultPitchSettings(stem.role);
    const fx = defaultTrackFx(stem.role);
    const analyze = stem.role === "vocal" || stem.role === "harmony";
    const clip = buildClipFromAudio({
      name: `${stem.name} Take 1`,
      channels: stem.channels,
      sampleRate: stem.sampleRate,
      startTime: 0,
      pitchSettings: pitch,
      runPitchAnalysis: analyze,
    });

    const volumeDb =
      stem.role === "vocal"
        ? 0.5
        : stem.role === "harmony"
          ? -6.5
          : stem.role === "instrument"
            ? -5.0
            : stem.role === "bass"
              ? -3.5
              : -2.0;
    const pan = stem.role === "harmony" ? 0.14 : stem.role === "instrument" ? -0.1 : 0;

    return {
      id: stem.id,
      name: stem.name,
      role: stem.role,
      color: stem.color,
      trimDb: 0,
      phaseInvert: false,
      volumeDb,
      pan,
      mute: false,
      solo: false,
      armed: stem.role === "vocal",
      sendReverb: stem.role === "vocal" ? 0.28 : stem.role === "harmony" ? 0.42 : stem.role === "instrument" ? 0.18 : 0.06,
      sendDelay: stem.role === "vocal" ? 0.18 : stem.role === "harmony" ? 0.24 : 0.04,
      pitch,
      fx,
      clips: [clip],
    };
  });

  return {
    name: "City Pop Demo Session",
    bpm: demo.bpm,
    timeSig: 4,
    tracks,
    spaceBus: defaultSpaceBus(),
    master: defaultMaster(),
    loop: {
      enabled: true,
      startTime: 0,
      endTime: demo.duration,
    },
  };
}

export function createEmptyProject(): StudioProject {
  const pitch = defaultPitchSettings("vocal");
  return {
    name: "新規ミックスプロジェクト",
    bpm: 120,
    timeSig: 4,
    tracks: [
      {
        id: nextId("track"),
        name: "メインボーカル",
        role: "vocal",
        color: TRACK_COLORS[0],
        trimDb: 0,
        phaseInvert: false,
        volumeDb: 0,
        pan: 0,
        mute: false,
        solo: false,
        armed: true,
        sendReverb: 0.25,
        sendDelay: 0.15,
        pitch,
        fx: defaultTrackFx("vocal"),
        clips: [],
      },
      {
        id: nextId("track"),
        name: "カラオケ / オケ",
        role: "instrument",
        color: TRACK_COLORS[2],
        trimDb: 0,
        phaseInvert: false,
        volumeDb: -2,
        pan: 0,
        mute: false,
        solo: false,
        armed: false,
        sendReverb: 0.05,
        sendDelay: 0,
        pitch: defaultPitchSettings("instrument"),
        fx: defaultTrackFx("instrument"),
        clips: [],
      },
    ],
    spaceBus: defaultSpaceBus(),
    master: defaultMaster(),
    loop: { enabled: false, startTime: 0, endTime: 16 },
  };
}

export type ActiveFxFocus = FxModuleId | "space" | "master";

export function useStudioStore() {
  const [project, setProject] = useState<StudioProject>(() =>
    createInitialDemoProject(),
  );
  const [selectedTrackId, setSelectedTrackId] = useState<string>(
    () => "track_vocal",
  );
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [topTab, setTopTab] = useState<TopViewTab>("pitch");
  const [activeFxModule, setActiveFxModule] = useState<ActiveFxFocus>("eq");
  const [consoleExpanded, setConsoleExpanded] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [metronome, setMetronome] = useState(false);
  const [micMonitor, setMicMonitor] = useState(false);
  const [micLiveAutotune, setMicLiveAutotune] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("準備完了 — ▶ 再生またはマイク録音で試せます");

  // History stacks
  const pastRef = useRef<StudioProject[]>([]);
  const futureRef = useRef<StudioProject[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const psolaTimerRef = useRef<Map<string, number>>(new Map());

  // Sync audioEngine whenever project changes
  useEffect(() => {
    audioEngine.syncProject(project);
  }, [project]);

  useEffect(() => {
    const timers = psolaTimerRef.current;
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
    };
  }, []);

  const selectedTrack =
    project.tracks.find((t) => t.id === selectedTrackId) ?? project.tracks[0] ?? null;

  const selectedClip =
    selectedTrack?.clips.find((c) => c.id === selectedClipId) ??
    selectedTrack?.clips[0] ??
    null;

  const pushHistory = useCallback((prev: StudioProject) => {
    pastRef.current = [...pastRef.current.slice(-29), prev];
    futureRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  const updateProject = useCallback(
    (updater: (prev: StudioProject) => StudioProject, recordHistory = true) => {
      setProject((prev) => {
        if (recordHistory) pushHistory(prev);
        return updater(prev);
      });
    },
    [pushHistory],
  );

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    setProject((cur) => {
      const prev = pastRef.current[pastRef.current.length - 1];
      pastRef.current = pastRef.current.slice(0, -1);
      futureRef.current = [cur, ...futureRef.current.slice(0, 29)];
      setCanUndo(pastRef.current.length > 0);
      setCanRedo(true);
      return prev;
    });
    setStatusMessage("元に戻しました (Undo)");
  }, []);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    setProject((cur) => {
      const next = futureRef.current[0];
      futureRef.current = futureRef.current.slice(1);
      pastRef.current = [...pastRef.current.slice(-29), cur];
      setCanUndo(true);
      setCanRedo(futureRef.current.length > 0);
      return next;
    });
    setStatusMessage("やり直しました (Redo)");
  }, []);

  const reprocessTrackPitch = useCallback(
    (track: Track): Track => {
      const clips = track.clips.map((clip) => {
        if (!clip.analysis) return clip;
        const processed = synthesizePsola(
          clip.rawChannels,
          clip.analysis,
          clip.blobs,
          track.pitch,
          clip.drawnPitch,
        );
        return { ...clip, processedChannels: processed };
      });
      const updated = { ...track, clips };
      audioEngine.hotSwapTrackAudio(updated);
      return updated;
    },
    [],
  );

  const scheduleTrackPitchReprocess = useCallback(
    (trackId: string, immediate: boolean) => {
      const prevTimer = psolaTimerRef.current.get(trackId);
      if (prevTimer !== undefined) {
        window.clearTimeout(prevTimer);
        psolaTimerRef.current.delete(trackId);
      }

      const run = () => {
        psolaTimerRef.current.delete(trackId);
        setProject((prev) => ({
          ...prev,
          tracks: prev.tracks.map((t) =>
            t.id === trackId ? reprocessTrackPitch(t) : t,
          ),
        }));
      };

      if (immediate) {
        run();
      } else {
        const id = window.setTimeout(run, 65);
        psolaTimerRef.current.set(trackId, id);
      }
    },
    [reprocessTrackPitch],
  );

  const updateTrack = useCallback(
    (
      trackId: string,
      updater: (t: Track) => Track,
      options: { recordHistory?: boolean; reprocessPitch?: boolean } = {},
    ) => {
      const { recordHistory = false, reprocessPitch = false } = options;
      setProject((prev) => {
        if (recordHistory) pushHistory(prev);
        const tracks = prev.tracks.map((t) => {
          if (t.id !== trackId) return t;
          const next = updater(t);
          return reprocessPitch && recordHistory ? reprocessTrackPitch(next) : next;
        });
        return { ...prev, tracks };
      });
      if (reprocessPitch && !recordHistory) {
        scheduleTrackPitchReprocess(trackId, false);
      }
    },
    [pushHistory, reprocessTrackPitch, scheduleTrackPitchReprocess],
  );

  const updateTrackFx = useCallback(
    (trackId: string, updater: (fx: TrackFxSettings) => TrackFxSettings, recordHistory = false) => {
      updateTrack(
        trackId,
        (t) => ({ ...t, fx: updater(t.fx) }),
        { recordHistory },
      );
    },
    [updateTrack],
  );

  const updateTrackPitch = useCallback(
    (
      trackId: string,
      patch: Partial<PitchSettings>,
      options: { snapBlobsToScale?: boolean; recordHistory?: boolean } = {},
    ) => {
      updateTrack(
        trackId,
        (t) => {
          const nextPitch = { ...t.pitch, ...patch };
          const clips = options.snapBlobsToScale
            ? t.clips.map((c) => ({
                ...c,
                blobs: c.blobs.map((b) => ({
                  ...b,
                  targetMidi: snapMidiToScale(
                    b.rawMidi,
                    nextPitch.keyRoot,
                    nextPitch.scale,
                    nextPitch.customNotes,
                  ),
                })),
              }))
            : t.clips;
          return { ...t, pitch: nextPitch, clips };
        },
        { recordHistory: options.recordHistory ?? false, reprocessPitch: true },
      );
    },
    [updateTrack],
  );

  const ensureClipAnalyzed = useCallback(
    (trackId: string, clipId: string) => {
      updateTrack(
        trackId,
        (t) => {
          const clips = t.clips.map((c) => {
            if (c.id !== clipId || c.analysis) return c;
            const analysis = analyzePitch(
              c.rawChannels,
              c.sampleRate,
              t.pitch.keyRoot,
              t.pitch.scale,
              t.pitch.customNotes,
            );
            return {
              ...c,
              analysis,
              blobs: analysis.blobs.map((b) => ({ ...b })),
            };
          });
          return { ...t, clips };
        },
        { reprocessPitch: true },
      );
    },
    [updateTrack],
  );

  const updateClipBlobs = useCallback(
    (
      trackId: string,
      clipId: string,
      updater: (blobs: PitchBlob[]) => PitchBlob[],
      recordHistory = true,
    ) => {
      updateTrack(
        trackId,
        (t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, blobs: updater(c.blobs) } : c,
          ),
        }),
        { recordHistory, reprocessPitch: true },
      );
    },
    [updateTrack],
  );

  const updateClipDrawnPitch = useCallback(
    (
      trackId: string,
      clipId: string,
      updater: (pts: PitchDrawPoint[]) => PitchDrawPoint[],
      recordHistory = false,
    ) => {
      updateTrack(
        trackId,
        (t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, drawnPitch: updater(c.drawnPitch) } : c,
          ),
        }),
        { recordHistory, reprocessPitch: true },
      );
    },
    [updateTrack],
  );

  const splitBlobAtTime = useCallback(
    (trackId: string, clipId: string, blobId: string, time: number) => {
      updateTrack(
        trackId,
        (t) => ({
          ...t,
          clips: t.clips.map((c) => {
            if (c.id !== clipId || !c.analysis) return c;
            return {
              ...c,
              blobs: splitPitchBlob(c.blobs, blobId, time, c.analysis.frames),
            };
          }),
        }),
        { recordHistory: true, reprocessPitch: true },
      );
    },
    [updateTrack],
  );

  const autoDetectKey = useCallback(
    (trackId: string) => {
      const track = project.tracks.find((t) => t.id === trackId);
      const clip = track?.clips[0];
      if (!track || !clip?.analysis) {
        setStatusMessage("ピッチ解析済みのボーカルクリップを選択してください");
        return;
      }
      const res = detectKeyAndScale(clip.analysis.frames, clip.blobs);
      updateTrackPitch(
        trackId,
        { keyRoot: res.keyRoot, scale: res.scale, scaleLock: true },
        { snapBlobsToScale: true, recordHistory: true },
      );
      const rootNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
      setStatusMessage(
        `キーを自動判定しました: ${rootNames[res.keyRoot]} ${res.scale === "major" ? "Major" : "Minor"}`,
      );
    },
    [project.tracks, updateTrackPitch],
  );

  // ---- Transport Actions ----

  const togglePlay = useCallback(async () => {
    if (audioEngine.getIsPlaying()) {
      audioEngine.pause();
      setIsPlaying(false);
    } else {
      await audioEngine.play(project);
      setIsPlaying(true);
    }
  }, [project]);

  const stopTransport = useCallback(() => {
    const returnTo = project.loop.enabled ? project.loop.startTime : 0;
    audioEngine.stop(returnTo);
    setIsPlaying(false);
  }, [project.loop]);

  const seekTransport = useCallback((timeSec: number) => {
    audioEngine.seek(timeSec);
  }, []);

  const toggleMetronome = useCallback(() => {
    setMetronome((prev) => {
      const next = !prev;
      audioEngine.setMetronome(next);
      return next;
    });
  }, []);

  // ---- Recording ----

  const recordStartTimeRef = useRef(0);
  const recordTargetTrackRef = useRef<string | null>(null);

  const toggleRecord = useCallback(async () => {
    if (isRecording) {
      const { channels, sampleRate } = audioEngine.stopMicRecording();
      setIsRecording(false);
      if (audioEngine.getIsPlaying()) {
        audioEngine.pause();
        setIsPlaying(false);
      }
      const targetId = recordTargetTrackRef.current ?? selectedTrack?.id;
      const targetTrack = project.tracks.find((t) => t.id === targetId);
      if (!targetTrack || channels[0].length < sampleRate * 0.15) {
        setStatusMessage("録音データが短すぎます");
        return;
      }

      const clip = buildClipFromAudio({
        name: `録音 Take ${targetTrack.clips.length + 1}`,
        channels,
        sampleRate,
        startTime: recordStartTimeRef.current,
        pitchSettings: targetTrack.pitch,
        runPitchAnalysis: true,
      });

      updateTrack(
        targetTrack.id,
        (t) => ({
          ...t,
          pitch: { ...t.pitch, enabled: true },
          clips: [...t.clips, clip],
        }),
        { recordHistory: true },
      );
      setSelectedTrackId(targetTrack.id);
      setSelectedClipId(clip.id);
      setTopTab("pitch");
      setStatusMessage(
        `録音完了 (${clip.duration.toFixed(1)}s / ${clip.blobs.length} ノート検出)`,
      );
      return;
    }

    const armedTrack =
      project.tracks.find((t) => t.armed) ?? selectedTrack ?? project.tracks[0];
    if (!armedTrack) return;

    try {
      const scaleMask = getScaleMask(
        armedTrack.pitch.keyRoot,
        armedTrack.pitch.scale,
        armedTrack.pitch.customNotes,
      );
      await audioEngine.startMicRecording({
        monitorEnabled: micMonitor,
        livePitchShift: micLiveAutotune,
        correction: armedTrack.pitch.correction,
        scaleMask,
      });
      recordStartTimeRef.current = audioEngine.getPlayheadTime();
      recordTargetTrackRef.current = armedTrack.id;
      setIsRecording(true);
      if (!audioEngine.getIsPlaying()) {
        await audioEngine.play(project, recordStartTimeRef.current);
        setIsPlaying(true);
      }
      setStatusMessage(`「${armedTrack.name}」に録音中...`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage(`マイク録音エラー: ${msg}`);
      setIsRecording(false);
    }
  }, [
    isRecording,
    micLiveAutotune,
    micMonitor,
    project,
    selectedTrack,
    updateTrack,
  ]);

  useEffect(() => {
    if (isRecording && selectedTrack) {
      audioEngine.updateMicConfig({
        monitorEnabled: micMonitor,
        livePitchShift: micLiveAutotune,
        correction: selectedTrack.pitch.correction,
        scaleMask: getScaleMask(
          selectedTrack.pitch.keyRoot,
          selectedTrack.pitch.scale,
          selectedTrack.pitch.customNotes,
        ),
      });
    }
  }, [
    isRecording,
    micLiveAutotune,
    micMonitor,
    selectedTrack,
    selectedTrack?.pitch.correction,
    selectedTrack?.pitch.keyRoot,
    selectedTrack?.pitch.scale,
    selectedTrack?.pitch.customNotes,
  ]);

  // ---- Track & Clip Operations ----

  const addTrack = useCallback(
    (role: TrackRole = "vocal", name?: string) => {
      const id = nextId("track");
      const count = project.tracks.length + 1;
      const color = TRACK_COLORS[(count - 1) % TRACK_COLORS.length];
      const labelMap: Record<TrackRole, string> = {
        vocal: `ボーカル ${count}`,
        harmony: `ハモリ ${count}`,
        instrument: `楽器 ${count}`,
        bass: `ベース ${count}`,
        drums: `ドラム ${count}`,
      };
      const track: Track = {
        id,
        name: name ?? labelMap[role],
        role,
        color,
        trimDb: 0,
        phaseInvert: false,
        volumeDb: 0,
        pan: 0,
        mute: false,
        solo: false,
        armed: false,
        sendReverb: role === "vocal" || role === "harmony" ? 0.25 : 0.08,
        sendDelay: role === "vocal" ? 0.12 : 0,
        pitch: defaultPitchSettings(role),
        fx: defaultTrackFx(role),
        clips: [],
      };
      updateProject((prev) => ({ ...prev, tracks: [...prev.tracks, track] }));
      setSelectedTrackId(id);
      setStatusMessage(`トラック「${track.name}」を追加しました`);
      return id;
    },
    [project.tracks.length, updateProject],
  );

  const duplicateHarmonyTrack = useCallback(
    (sourceTrackId: string, semitones = 4) => {
      const src = project.tracks.find((t) => t.id === sourceTrackId);
      if (!src) return;
      const id = nextId("track");
      const color = TRACK_COLORS[project.tracks.length % TRACK_COLORS.length];

      const clonedPitch: PitchSettings = {
        ...src.pitch,
        enabled: true,
        bypass: false,
        correction: 0.94,
        retuneSpeedMs: 25,
        vibratoCut: 0.35,
      };

      const clonedClips: AudioClip[] = src.clips.map((c) => {
        const shiftedBlobs = c.blobs.map((b) => ({
          ...b,
          id: nextId("blob"),
          targetMidi: snapMidiToScale(
            b.targetMidi + semitones,
            clonedPitch.keyRoot,
            clonedPitch.scale,
            clonedPitch.customNotes,
          ),
        }));
        const processed = c.analysis
          ? synthesizePsola(c.rawChannels, c.analysis, shiftedBlobs, clonedPitch, [])
          : null;
        return {
          ...c,
          id: nextId("clip"),
          name: `${c.name} (+${semitones}st)`,
          blobs: shiftedBlobs,
          drawnPitch: [],
          processedChannels: processed,
        };
      });

      const copyTrack: Track = {
        ...src,
        id,
        name: `${src.name} ハモリ(+${semitones})`,
        role: "harmony",
        color,
        volumeDb: -5.5,
        pan: src.pan === 0 ? 0.25 : -src.pan,
        armed: false,
        sendReverb: Math.min(1, src.sendReverb + 0.14),
        pitch: clonedPitch,
        fx: defaultTrackFx("harmony"),
        clips: clonedClips,
      };

      updateProject((prev) => ({ ...prev, tracks: [...prev.tracks, copyTrack] }));
      setSelectedTrackId(id);
      setStatusMessage(`ハモリトラック (+${semitones}半音) を生成しました！`);
    },
    [project.tracks, updateProject],
  );

  const deleteTrack = useCallback(
    (trackId: string) => {
      if (project.tracks.length <= 1) {
        setStatusMessage("最低1つのトラックが必要です");
        return;
      }
      updateProject((prev) => ({
        ...prev,
        tracks: prev.tracks.filter((t) => t.id !== trackId),
      }));
      if (selectedTrackId === trackId) {
        const remaining = project.tracks.find((t) => t.id !== trackId);
        if (remaining) setSelectedTrackId(remaining.id);
      }
    },
    [project.tracks, selectedTrackId, updateProject],
  );

  const importAudioFiles = useCallback(
    async (files: FileList | File[], targetTrackId?: string, startTime = 0) => {
      const list = Array.from(files);
      if (list.length === 0) return;

      for (const file of list) {
        try {
          setStatusMessage(`「${file.name}」を読み込み・解析中...`);
          const buf = await file.arrayBuffer();
          const { channels, sampleRate } = await audioEngine.decodeAudioFile(buf);

          let destTrackId = targetTrackId ?? selectedTrack?.id;
          let destTrack = project.tracks.find((t) => t.id === destTrackId);

          if (!destTrack || list.length > 1) {
            const newId = nextId("track");
            const color = TRACK_COLORS[project.tracks.length % TRACK_COLORS.length];
            const pitch = defaultPitchSettings("vocal");
            const clip = buildClipFromAudio({
              name: file.name.replace(/\.[^.]+$/, ""),
              channels,
              sampleRate,
              startTime,
              pitchSettings: pitch,
              runPitchAnalysis: true,
            });
            const newTrack: Track = {
              id: newId,
              name: file.name.replace(/\.[^.]+$/, ""),
              role: "vocal",
              color,
              trimDb: 0,
              phaseInvert: false,
              volumeDb: 0,
              pan: 0,
              mute: false,
              solo: false,
              armed: false,
              sendReverb: 0.2,
              sendDelay: 0.1,
              pitch,
              fx: defaultTrackFx("vocal"),
              clips: [clip],
            };
            updateProject((prev) => ({
              ...prev,
              tracks: [...prev.tracks, newTrack],
            }));
            setSelectedTrackId(newId);
            setSelectedClipId(clip.id);
            setStatusMessage(`「${file.name}」を取り込みました`);
          } else {
            const clip = buildClipFromAudio({
              name: file.name.replace(/\.[^.]+$/, ""),
              channels,
              sampleRate,
              startTime,
              pitchSettings: destTrack.pitch,
              runPitchAnalysis:
                destTrack.role === "vocal" || destTrack.role === "harmony",
            });
            updateTrack(
              destTrack.id,
              (t) => ({ ...t, clips: [...t.clips, clip] }),
              { recordHistory: true },
            );
            setSelectedClipId(clip.id);
            setStatusMessage(`「${file.name}」を「${destTrack.name}」に追加しました`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setStatusMessage(`読込失敗 (${file.name}): ${msg}`);
        }
      }
    },
    [project.tracks, selectedTrack, updateProject, updateTrack],
  );

  // ---- Export WAV / Save JSON ----

  const exportWavMix = useCallback(
    async (options: { loopOnly?: boolean; soloTrackId?: string; label?: string } = {}) => {
      try {
        setStatusMessage("高品質ミックスWAVをレンダリング中...");
        const { channels, sampleRate } = await audioEngine.renderMixOffline(
          project,
          options,
        );
        const wavBuf = encodeWav(channels, sampleRate, 16);
        const blob = new Blob([wavBuf], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const suffix = options.label ?? (options.loopOnly ? "loop" : "mix");
        a.download = `${project.name.replace(/\s+/g, "_")}_${suffix}.wav`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        setStatusMessage("WAVファイルを書き出しました！");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatusMessage(`WAV書き出しエラー: ${msg}`);
      }
    },
    [project],
  );

  const exportProjectJson = useCallback(() => {
    const serializable = {
      version: 2,
      name: project.name,
      bpm: project.bpm,
      timeSig: project.timeSig,
      spaceBus: project.spaceBus,
      master: project.master,
      loop: project.loop,
      tracks: project.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => ({
          id: c.id,
          name: c.name,
          startTime: c.startTime,
          offset: c.offset,
          duration: c.duration,
          totalDuration: c.totalDuration,
          gainDb: c.gainDb,
          fadeIn: c.fadeIn,
          fadeOut: c.fadeOut,
          sampleRate: c.sampleRate,
          blobs: c.blobs,
          drawnPitch: c.drawnPitch,
          // Encode PCM compactly as base64 wav inside JSON for full project portability
          wavBase64: arrayBufferToBase64(encodeWav(c.rawChannels, c.sampleRate, 16)),
        })),
      })),
    };
    const blob = new Blob([JSON.stringify(serializable)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, "_")}.hanautai.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    setStatusMessage("プロジェクトを保存しました (.hanautai.json)");
  }, [project]);

  const importProjectJson = useCallback(async (file: File) => {
    try {
      setStatusMessage("プロジェクトを読み込み中...");
      const text = await file.text();
      const raw = JSON.parse(text);
      if (!raw || !Array.isArray(raw.tracks)) {
        throw new Error("不正なプロジェクトファイルです");
      }

      const loadedTracks: Track[] = [];
      for (const rt of raw.tracks) {
        const clips: AudioClip[] = [];
        for (const rc of rt.clips ?? []) {
          if (typeof rc.wavBase64 === "string") {
            const ab = base64ToArrayBuffer(rc.wavBase64);
            const { channels, sampleRate } = await audioEngine.decodeAudioFile(ab);
            const built = buildClipFromAudio({
              id: rc.id,
              name: rc.name,
              channels,
              sampleRate,
              startTime: rc.startTime ?? 0,
              pitchSettings: rt.pitch,
              runPitchAnalysis: rt.role === "vocal" || rt.role === "harmony",
            });
            built.offset = rc.offset ?? 0;
            built.duration = rc.duration ?? built.totalDuration;
            built.gainDb = rc.gainDb ?? 0;
            built.fadeIn = rc.fadeIn ?? 0.01;
            built.fadeOut = rc.fadeOut ?? 0.02;
            if (Array.isArray(rc.blobs) && rc.blobs.length > 0 && built.analysis) {
              built.blobs = rc.blobs;
              built.drawnPitch = rc.drawnPitch ?? [];
              built.processedChannels = synthesizePsola(
                built.rawChannels,
                built.analysis,
                built.blobs,
                rt.pitch,
                built.drawnPitch,
              );
            }
            clips.push(built);
          }
        }
        loadedTracks.push({
          ...rt,
          clips,
        });
      }

      audioEngine.stop(0);
      setIsPlaying(false);
      setProject({
        name: raw.name ?? "読み込んだプロジェクト",
        bpm: raw.bpm ?? 120,
        timeSig: raw.timeSig ?? 4,
        tracks: loadedTracks,
        spaceBus: raw.spaceBus ?? defaultSpaceBus(),
        master: raw.master ?? defaultMaster(),
        loop: raw.loop ?? { enabled: false, startTime: 0, endTime: 16 },
      });
      if (loadedTracks[0]) setSelectedTrackId(loadedTracks[0].id);
      pastRef.current = [];
      futureRef.current = [];
      setCanUndo(false);
      setCanRedo(false);
      setStatusMessage("プロジェクトを読み込みました");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage(`読込失敗: ${msg}`);
    }
  }, []);

  const resetDemoProject = useCallback(() => {
    audioEngine.stop(0);
    setIsPlaying(false);
    const demo = createInitialDemoProject();
    setProject(demo);
    setSelectedTrackId(demo.tracks[0].id);
    setSelectedClipId(null);
    pastRef.current = [];
    futureRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
    setStatusMessage("デモスタジオプロジェクトを復元しました");
  }, []);

  const resetEmptyProject = useCallback(() => {
    audioEngine.stop(0);
    setIsPlaying(false);
    const empty = createEmptyProject();
    setProject(empty);
    setSelectedTrackId(empty.tracks[0].id);
    setSelectedClipId(null);
    pastRef.current = [];
    futureRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
    setStatusMessage("空の新規プロジェクトを作成しました（音声ファイルをドロップするか録音できます）");
  }, []);

  const updateSpaceBus = useCallback(
    (patch: Partial<SpaceBusSettings>, recordHistory = false) => {
      updateProject(
        (prev) => ({ ...prev, spaceBus: { ...prev.spaceBus, ...patch } }),
        recordHistory,
      );
    },
    [updateProject],
  );

  const updateMaster = useCallback(
    (patch: Partial<MasterSettings>, recordHistory = false) => {
      updateProject(
        (prev) => ({ ...prev, master: { ...prev.master, ...patch } }),
        recordHistory,
      );
    },
    [updateProject],
  );

  return {
    project,
    selectedTrack,
    selectedClip,
    selectedTrackId,
    setSelectedTrackId,
    selectedClipId,
    setSelectedClipId,
    topTab,
    setTopTab,
    activeFxModule,
    setActiveFxModule,
    consoleExpanded,
    setConsoleExpanded,
    isPlaying,
    isRecording,
    metronome,
    micMonitor,
    setMicMonitor,
    micLiveAutotune,
    setMicLiveAutotune,
    statusMessage,
    setStatusMessage,
    canUndo,
    canRedo,
    undo,
    redo,
    updateProject,
    updateTrack,
    updateTrackFx,
    updateTrackPitch,
    ensureClipAnalyzed,
    updateClipBlobs,
    updateClipDrawnPitch,
    splitBlobAtTime,
    autoDetectKey,
    togglePlay,
    stopTransport,
    seekTransport,
    toggleMetronome,
    toggleRecord,
    addTrack,
    duplicateHarmonyTrack,
    deleteTrack,
    importAudioFiles,
    exportWavMix,
    exportProjectJson,
    importProjectJson,
    resetDemoProject,
    resetEmptyProject,
    updateSpaceBus,
    updateMaster,
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
