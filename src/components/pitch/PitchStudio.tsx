import React, { useRef, useState } from "react";
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Eraser,
  Headphones,
  MousePointer2,
  Pencil,
  RotateCcw,
  Scissors,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";
import { PITCH_PRESETS } from "../../audio/presets";
import {
  formatCentsOffset,
  getScaleMask,
  midiToName,
  NOTE_NAMES,
  SCALE_LABELS,
  snapMidiToScale,
} from "../../dsp/musicTheory";
import type {
  AudioClip,
  PitchBlob,
  PitchDrawPoint,
  PitchSettings,
  ScaleType,
  Track,
} from "../../types/studio";
import { RotaryKnob } from "../common/RotaryKnob";
import { useIsMobile } from "../../hooks/useIsMobile";
import { PitchEditorCanvas, type PitchTool } from "./PitchEditorCanvas";

interface PitchStudioProps {
  track: Track;
  allTracks: Track[];
  clip: AudioClip | null;
  bpm: number;
  timeSig: number;
  onSelectTrack: (trackId: string) => void;
  onToggleSolo: () => void;
  onUpdatePitch: (
    patch: Partial<PitchSettings>,
    options?: { snapBlobsToScale?: boolean; recordHistory?: boolean },
  ) => void;
  onEnsureAnalyzed: (clipId: string) => void;
  onUpdateBlobs: (
    clipId: string,
    updater: (blobs: PitchBlob[]) => PitchBlob[],
    recordHistory?: boolean,
  ) => void;
  onUpdateDrawnPitch: (
    clipId: string,
    updater: (pts: PitchDrawPoint[]) => PitchDrawPoint[],
    recordHistory?: boolean,
  ) => void;
  onSplitBlob: (clipId: string, blobId: string, time: number) => void;
  onAutoDetectKey: () => void;
  onApplyReferencePitch: (file: File) => void;
  onGenerateHarmony: (semitones: number) => void;
  onStartRecord: () => void;
}

export const PitchStudio: React.FC<PitchStudioProps> = ({
  track,
  allTracks,
  clip,
  bpm,
  timeSig,
  onSelectTrack,
  onToggleSolo,
  onUpdatePitch,
  onEnsureAnalyzed,
  onUpdateBlobs,
  onUpdateDrawnPitch,
  onSplitBlob,
  onAutoDetectKey,
  onApplyReferencePitch,
  onGenerateHarmony,
  onStartRecord,
}) => {
  const [tool, setTool] = useState<PitchTool>("move");
  const isMobile = useIsMobile();
  const [moreOpen, setMoreOpen] = useState(false);
  const showMore = !isMobile || moreOpen;
  const refFileInputRef = useRef<HTMLInputElement>(null);
  const [selectedBlobIds, setSelectedBlobIds] = useState<string[]>([]);

  const pitch = track.pitch;
  const scaleMask = getScaleMask(pitch.keyRoot, pitch.scale, pitch.customNotes);

  const selectedBlobs = clip
    ? clip.blobs.filter((b) => selectedBlobIds.includes(b.id))
    : [];
  const primaryBlob = selectedBlobs[0] ?? null;

  const vocalTracksWithAnalysis = allTracks.filter(
    (t) => t.id !== track.id && t.clips.some((c) => Boolean(c.analysis)),
  );

  const activePresetId =
    PITCH_PRESETS.find(
      (p) =>
        Math.abs((p.patch.correction ?? -1) - pitch.correction) < 0.02 &&
        Math.abs((p.patch.retuneSpeedMs ?? -1) - pitch.retuneSpeedMs) < 3 &&
        Math.abs((p.patch.vibratoCut ?? -1) - pitch.vibratoCut) < 0.04 &&
        Math.abs((p.patch.formantShift ?? 99) - pitch.formantShift) < 0.2,
    )?.id ?? null;

  const handleToggleScaleNote = (pc: number) => {
    const next = [...scaleMask];
    next[pc] = !next[pc];
    onUpdatePitch(
      { scale: "custom", customNotes: next },
      { snapBlobsToScale: pitch.scaleLock, recordHistory: true },
    );
  };

  const handleSnapAll = () => {
    if (!clip) return;
    onUpdateBlobs(
      clip.id,
      (blobs) =>
        blobs.map((b) => ({
          ...b,
          targetMidi: snapMidiToScale(
            b.rawMidi,
            pitch.keyRoot,
            pitch.scale,
            pitch.customNotes,
          ),
        })),
      true,
    );
  };

  const handleResetAllBlobs = () => {
    if (!clip) return;
    onUpdateBlobs(
      clip.id,
      (blobs) =>
        blobs.map((b) => ({
          ...b,
          targetMidi: Math.round(b.rawMidi),
          correctionOverride: null,
          vibratoScaleOverride: null,
          formantOverride: null,
          gainDb: 0,
        })),
      true,
    );
    onUpdateDrawnPitch(clip.id, () => [], true);
  };

  if (!clip) {
    return (
      <div className="empty-studio-panel">
        <Activity size={36} className="muted-icon" />
        <h3>「{track.name}」にオーディオクリップがありません</h3>
        <p>
          マイクで歌を録音するか、音声ファイル (WAV / MP3 / OGG)
          を画面へドロップするとピッチ補正を始められます。
        </p>
        <div className="empty-actions">
          <button type="button" className="btn-accent" onClick={onStartRecord}>
            ● このトラックへ録音する
          </button>
          {vocalTracksWithAnalysis.map((vt) => (
            <button
              key={vt.id}
              type="button"
              className="mini-btn"
              onClick={() => onSelectTrack(vt.id)}
            >
              「{vt.name}」を開く
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!clip.analysis) {
    return (
      <div className="empty-studio-panel">
        <Sparkles size={36} className="muted-icon" />
        <h3>「{clip.name}」はピッチ未解析のトラックです</h3>
        <p>
          現在は楽器・リズムトラックとして読み込まれています。ボーカルやソロメロディとしてピッチ補正を行う場合は下のボタンから解析してください。
        </p>
        <div className="empty-actions">
          <button
            type="button"
            className="btn-accent"
            onClick={() => onEnsureAnalyzed(clip.id)}
          >
            このクリップをピッチ解析する
          </button>
          {vocalTracksWithAnalysis.map((vt) => (
            <button
              key={vt.id}
              type="button"
              className="mini-btn"
              onClick={() => onSelectTrack(vt.id)}
            >
              ボーカル「{vt.name}」を編集する
            </button>
          ))}
        </div>
      </div>
    );
  }

  const isBypassed = pitch.bypass || !pitch.enabled;

  return (
    <div className="pitch-studio">
      {/* Top Pitch Control Bar */}
      <div className="pitch-topbar">
        <div className="pitch-section">
          <div className="ab-cluster">
            <div className="ab-segmented" title="原音(Before)と補正後(After)をワンクリック比較">
              <button
                type="button"
                className={isBypassed ? "active before" : ""}
                onClick={() =>
                  onUpdatePitch({ enabled: true, bypass: true }, { recordHistory: false })
                }
              >
                原音 Before
              </button>
              <button
                type="button"
                className={!isBypassed ? "active after" : ""}
                onClick={() =>
                  onUpdatePitch({ enabled: true, bypass: false }, { recordHistory: false })
                }
              >
                補正後 After
              </button>
            </div>
            <button
              type="button"
              className={`mini-btn solo-chip ${track.solo ? "active" : ""}`}
              onClick={onToggleSolo}
              title="このトラックだけ単独試聴 (Solo)"
            >
              <Headphones size={12} /> 単独試聴 {track.solo ? "ON" : "OFF"}
            </button>
          </div>

          <div className="pitch-knobs-row">
            <RotaryKnob
              label="補正強度"
              value={Math.round(pitch.correction * 100)}
              min={0}
              max={100}
              defaultValue={85}
              step={1}
              size={42}
              color="#38bdf8"
              format={(v) => `${Math.round(v)}%`}
              onChange={(v) => onUpdatePitch({ correction: v / 100 })}
            />
            <RotaryKnob
              label="追従速度"
              value={pitch.retuneSpeedMs}
              min={0}
              max={220}
              defaultValue={42}
              step={1}
              size={42}
              color="#22d3ee"
              format={(v) => (v === 0 ? "0ms(ケロ)" : `${Math.round(v)}ms`)}
              onChange={(v) => onUpdatePitch({ retuneSpeedMs: v })}
            />
            <RotaryKnob
              label="揺れ抑制"
              value={Math.round(pitch.vibratoCut * 100)}
              min={-50}
              max={100}
              defaultValue={12}
              step={1}
              size={42}
              bipolar
              color="#a78bfa"
              format={(v) => `${v > 0 ? "+" : ""}${Math.round(v)}%`}
              onChange={(v) => onUpdatePitch({ vibratoCut: v / 100 })}
            />
            <RotaryKnob
              label="声質/フォルマント"
              value={pitch.formantShift}
              min={-12}
              max={12}
              defaultValue={0}
              step={0.1}
              size={42}
              bipolar
              color="#f472b6"
              format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}st`}
              onChange={(v) => onUpdatePitch({ formantShift: v })}
            />
          </div>
        </div>

        {/* Mobile: key & preset items collapse behind one toggle */}
        <button
          type="button"
          className="tool-chip pitch-more-toggle"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
        >
          キー・プリセット {moreOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {showMore && (
        <>
        {/* Key & Scale Bar */}
        <div className="pitch-section key-section">
          <div className="key-selectors">
            <label className="compact-select">
              <span>Key</span>
              <select
                value={pitch.keyRoot}
                onChange={(e) =>
                  onUpdatePitch(
                    { keyRoot: Number(e.target.value) },
                    { snapBlobsToScale: pitch.scaleLock, recordHistory: true },
                  )
                }
              >
                {NOTE_NAMES.map((n, idx) => (
                  <option key={n} value={idx}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="compact-select">
              <span>Scale</span>
              <select
                value={pitch.scale}
                onChange={(e) =>
                  onUpdatePitch(
                    { scale: e.target.value as ScaleType },
                    { snapBlobsToScale: pitch.scaleLock, recordHistory: true },
                  )
                }
              >
                {(Object.keys(SCALE_LABELS) as ScaleType[]).map((s) => (
                  <option key={s} value={s}>
                    {SCALE_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="tool-chip"
              onClick={onAutoDetectKey}
              title="メロディから曲のキーを自動判定"
            >
              <Wand2 size={12} /> キー自動判定
            </button>
            <button
              type="button"
              className={`tool-chip ${pitch.scaleLock ? "selected" : ""}`}
              onClick={() => onUpdatePitch({ scaleLock: !pitch.scaleLock })}
              title="ON時はスケール内の音程に自動吸着します"
            >
              音階吸着 {pitch.scaleLock ? "ON" : "OFF"}
            </button>
          </div>

          <div className="mini-scale-keys" title="クリックで使用する音階(カスタムスケール)を切り替え">
            {NOTE_NAMES.map((name, pc) => {
              const active = scaleMask[pc];
              const isRoot = pc === pitch.keyRoot;
              const isSharp = name.includes("#");
              return (
                <button
                  key={name}
                  type="button"
                  className={`scale-key-btn ${isSharp ? "sharp" : ""} ${active ? "on" : ""} ${isRoot ? "root" : ""}`}
                  onClick={() => handleToggleScaleNote(pc)}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Presets & Harmony Helper */}
        <div className="pitch-section presets-section">
          <div className="preset-pills">
            {PITCH_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`preset-pill ${activePresetId === p.id ? "active" : ""}`}
                title={p.desc}
                onClick={() => onUpdatePitch(p.patch, { recordHistory: true })}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="harmony-actions">
            <button
              type="button"
              className="tool-chip"
              onClick={() => onGenerateHarmony(4)}
              title="このトラックを複製して3度上のハモリを自動生成"
            >
              + ハモリ生成 (+3度)
            </button>
            <button
              type="button"
              className="tool-chip"
              onClick={() => onGenerateHarmony(7)}
              title="このトラックを複製して5度上のハモリを自動生成"
            >
              + ハモリ生成 (+5度)
            </button>
          </div>
        </div>
        </>
        )}
      </div>
      {/* Tool Strip & Selected Note Inspector */}
      <div className="pitch-toolbar">
        <div className="tool-group">
          <button
            type="button"
            className={`tool-btn ${tool === "move" ? "active" : ""}`}
            onClick={() => setTool("move")}
            title="ノートを上下ドラッグして音程修正 (Shiftで微調整)"
          >
            <MousePointer2 size={13} /> 移動・補正
          </button>
          <button
            type="button"
            className={`tool-btn ${tool === "split" ? "active" : ""}`}
            onClick={() => setTool("split")}
            title="しゃくりや語尾をクリック位置で分割"
          >
            <Scissors size={13} /> 分割
          </button>
          <button
            type="button"
            className={`tool-btn ${tool === "draw" ? "active" : ""}`}
            onClick={() => setTool("draw")}
            title="ピッチカーブをマウスで自由描画"
          >
            <Pencil size={13} /> 手描き
          </button>
          <button
            type="button"
            className={`tool-btn ${tool === "reset" ? "active" : ""}`}
            onClick={() => setTool("reset")}
            title="クリックしたノートを初期状態に戻す"
          >
            <Eraser size={13} /> 個別リセット
          </button>
        </div>

        <div className="blob-inspector">
          {primaryBlob ? (
            <>
              <span className="inspector-badge">
                選択: <strong>{midiToName(primaryBlob.targetMidi)}</strong>{" "}
                <small>(原音ズレ {formatCentsOffset(primaryBlob.rawMidi)})</small>
              </span>
              <label className="inline-slider">
                <span>音量</span>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={0.5}
                  value={primaryBlob.gainDb}
                  onChange={(e) => {
                    const g = Number(e.target.value);
                    onUpdateBlobs(
                      clip.id,
                      (blobs) =>
                        blobs.map((b) =>
                          selectedBlobIds.includes(b.id) ? { ...b, gainDb: g } : b,
                        ),
                      false,
                    );
                  }}
                />
                <span>{primaryBlob.gainDb > 0 ? "+" : ""}{primaryBlob.gainDb.toFixed(1)} dB</span>
              </label>
              <button
                type="button"
                className="mini-btn"
                onClick={() =>
                  onUpdateBlobs(
                    clip.id,
                    (blobs) =>
                      blobs.map((b) =>
                        selectedBlobIds.includes(b.id)
                          ? { ...b, targetMidi: b.targetMidi + 1 }
                          : b,
                      ),
                    true,
                  )
                }
              >
                +1半音
              </button>
              <button
                type="button"
                className="mini-btn"
                onClick={() =>
                  onUpdateBlobs(
                    clip.id,
                    (blobs) =>
                      blobs.map((b) =>
                        selectedBlobIds.includes(b.id)
                          ? { ...b, targetMidi: b.targetMidi - 1 }
                          : b,
                      ),
                    true,
                  )
                }
              >
                -1半音
              </button>
            </>
          ) : (
            <span className="hint-text">
              ノートを上下ドラッグで音程変更 / ダブルクリックでスケール吸着 / Shift+ドラッグでセント微調整
            </span>
          )}
        </div>

        <div className="batch-actions">
          <button
            type="button"
            className="mini-btn"
            onClick={() => refFileInputRef.current?.click()}
            title="分離済みの参照ボーカル音声を読み込み、そのピッチに合わせて補正します（音声そのものは保存されません）"
          >
            <Upload size={12} /> 参照ピッチ取込
          </button>
          <input
            ref={refFileInputRef}
            type="file"
            accept="audio/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onApplyReferencePitch(f);
              e.target.value = "";
            }}
          />
          <button type="button" className="mini-btn" onClick={handleSnapAll}>
            全体吸着
          </button>
          <button
            type="button"
            className="mini-btn"
            onClick={handleResetAllBlobs}
            title="全ノートの編集をリセット"
          >
            <RotateCcw size={12} /> 初期化
          </button>
        </div>
      </div>

      {/* Melodyne-Style Pitch Canvas */}
      <PitchEditorCanvas
        clip={clip}
        pitchSettings={pitch}
        bpm={bpm}
        timeSig={timeSig}
        trackColor={track.color}
        tool={tool}
        selectedBlobIds={selectedBlobIds}
        onSelectBlobs={setSelectedBlobIds}
        onUpdateBlobs={(updater, rec) => onUpdateBlobs(clip.id, updater, rec)}
        onUpdateDrawnPitch={(updater, rec) =>
          onUpdateDrawnPitch(clip.id, updater, rec)
        }
        onSplitBlob={(blobId, t) => onSplitBlob(clip.id, blobId, t)}
        onToggleCustomScaleNote={handleToggleScaleNote}
      />
    </div>
  );
};
