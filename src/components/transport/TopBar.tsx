import React, { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  FilePlus2,
  FolderOpen,
  Headphones,
  HelpCircle,
  Mic,
  Pause,
  Play,
  Redo2,
  Repeat,
  RotateCcw,
  Save,
  SkipBack,
  Sparkles,
  Square,
  Undo2,
  Upload,
  Volume2,
} from "lucide-react";
import { audioEngine } from "../../audio/audioEngine";
import { formatCentsOffset, midiToName } from "../../dsp/musicTheory";

interface TopBarProps {
  projectName: string;
  selectedTrackName: string;
  bpm: number;
  timeSig: number;
  loopEnabled: boolean;
  isPlaying: boolean;
  isRecording: boolean;
  metronome: boolean;
  micMonitor: boolean;
  micLiveAutotune: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onRenameProject: (name: string) => void;
  onTogglePlay: () => void;
  onStop: () => void;
  onReturnZero: () => void;
  onToggleRecord: () => void;
  onToggleLoop: () => void;
  onToggleMetronome: () => void;
  onChangeBpm: (bpm: number) => void;
  onToggleMicMonitor: () => void;
  onToggleMicLiveAutotune: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onImportAudio: (files: FileList) => void;
  onExportWav: (mode: "mix" | "loop" | "stem") => void;
  onSaveProject: () => void;
  onLoadProject: (file: File) => void;
  onResetDemo: () => void;
  onNewEmpty: () => void;
  onOpenHelp: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  projectName,
  selectedTrackName,
  bpm,
  timeSig,
  loopEnabled,
  isPlaying,
  isRecording,
  metronome,
  micMonitor,
  micLiveAutotune,
  canUndo,
  canRedo,
  onRenameProject,
  onTogglePlay,
  onStop,
  onReturnZero,
  onToggleRecord,
  onToggleLoop,
  onToggleMetronome,
  onChangeBpm,
  onToggleMicMonitor,
  onToggleMicLiveAutotune,
  onUndo,
  onRedo,
  onImportAudio,
  onExportWav,
  onSaveProject,
  onLoadProject,
  onResetDemo,
  onNewEmpty,
  onOpenHelp,
}) => {
  const timeRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const tunerRef = useRef<HTMLSpanElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(projectName);
  const [openMenu, setOpenMenu] = useState<"project" | "export" | null>(null);

  useEffect(() => {
    const close = () => setOpenMenu(null);
    if (openMenu) {
      window.addEventListener("pointerdown", close);
      return () => window.removeEventListener("pointerdown", close);
    }
  }, [openMenu]);

  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      const t = audioEngine.getPlayheadTime();
      if (timeRef.current) {
        const mins = Math.floor(t / 60);
        const secs = Math.floor(t % 60);
        const ms = Math.floor((t % 1) * 100);
        timeRef.current.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
      }
      if (barRef.current) {
        const beats = t * (bpm / 60);
        const bar = Math.floor(beats / Math.max(1, timeSig)) + 1;
        const beat = Math.floor(beats % Math.max(1, timeSig)) + 1;
        barRef.current.textContent = `BAR ${bar}.${beat}`;
      }
      if (tunerRef.current && isRecording) {
        const pitch = audioEngine.getLiveMicPitch();
        tunerRef.current.textContent =
          pitch.voiced && pitch.midi > 0
            ? `${midiToName(pitch.midi)} ${formatCentsOffset(pitch.midi)}`
            : "聴取中...";
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [bpm, isRecording, timeSig]);

  const commitTitle = () => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== projectName) {
      onRenameProject(trimmed);
    }
  };

  return (
    <header className="topbar">
      {/* Left: Brand & Editable Project Name */}
      <div className="topbar-brand">
        <div className="brand-mark">HM</div>
        <div className="brand-text">
          <strong>HanautAI Mix Studio</strong>
          {editingTitle ? (
            <input
              className="brand-title-input"
              value={titleDraft}
              autoFocus
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTitle();
                if (e.key === "Escape") setEditingTitle(false);
              }}
            />
          ) : (
            <small
              className="brand-subtitle"
              onClick={() => {
                setTitleDraft(projectName);
                setEditingTitle(true);
              }}
              title="クリックでプロジェクト名を変更"
            >
              {projectName}
            </small>
          )}
        </div>
      </div>

      {/* Center: Transport & Timing */}
      <div className="topbar-transport">
        <div className="transport-cluster">
          <button
            type="button"
            className="t-btn icon-only"
            onClick={onReturnZero}
            title="先頭に戻る"
          >
            <SkipBack size={14} />
          </button>
          <button
            type="button"
            className={`t-btn play ${isPlaying ? "active" : ""}`}
            onClick={onTogglePlay}
            title="再生 / 一時停止 (Space)"
          >
            {isPlaying ? <Pause size={15} /> : <Play size={15} />}
            <span>{isPlaying ? "一時停止" : "再生"}</span>
          </button>
          <button
            type="button"
            className="t-btn icon-only"
            onClick={onStop}
            title="停止してループ開始位置へ戻る"
          >
            <Square size={13} />
          </button>
          <button
            type="button"
            className={`t-btn rec ${isRecording ? "recording" : ""}`}
            onClick={onToggleRecord}
            title="マイク録音開始 / 停止 (R)"
          >
            <Mic size={14} />
            <span>{isRecording ? "録音停止" : "録音"}</span>
          </button>
        </div>

        {isRecording && (
          <span ref={tunerRef} className="live-tuner-badge">
            聴取中...
          </span>
        )}

        <div className="lcd-display">
          <span ref={timeRef} className="lcd-time">
            00:00.00
          </span>
          <span className="lcd-sep">|</span>
          <span ref={barRef} className="lcd-bar">
            BAR 1.1
          </span>
        </div>

        <label className="bpm-box" title="テンポ (BPM)">
          <span>BPM</span>
          <input
            type="number"
            min={40}
            max={240}
            value={bpm}
            onChange={(e) => {
              const v = Math.max(40, Math.min(240, Number(e.target.value) || 120));
              onChangeBpm(v);
            }}
          />
        </label>

        <div className="transport-cluster">
          <button
            type="button"
            className={`t-btn ${loopEnabled ? "accent-on" : ""}`}
            onClick={onToggleLoop}
            title="ループ再生 ON/OFF"
          >
            <Repeat size={13} />
            <span>ループ</span>
          </button>

          <button
            type="button"
            className={`t-btn ${metronome ? "accent-on" : ""}`}
            onClick={onToggleMetronome}
            title="メトロノーム ON/OFF"
          >
            <Volume2 size={13} />
            <span>クリック</span>
          </button>

          <button
            type="button"
            className={`t-btn ${micMonitor ? "accent-on" : ""}`}
            onClick={onToggleMicMonitor}
            title="録音中マイクモニター (ヘッドホン推奨)"
          >
            <Headphones size={13} />
          </button>

          {micMonitor && (
            <button
              type="button"
              className={`t-btn ${micLiveAutotune ? "accent-on" : ""}`}
              onClick={onToggleMicLiveAutotune}
              title="モニター時リアルタイムAuto-Tune ON/OFF"
            >
              <Sparkles size={13} />
              <span>Live補正</span>
            </button>
          )}
        </div>
      </div>

      {/* Right: Undo, Import, Project Menu & WAV Export */}
      <div className="topbar-actions">
        <div className="transport-cluster">
          <button
            type="button"
            className="t-btn icon-only"
            disabled={!canUndo}
            onClick={onUndo}
            title="元に戻す (Ctrl/Cmd+Z)"
          >
            <Undo2 size={14} />
          </button>
          <button
            type="button"
            className="t-btn icon-only"
            disabled={!canRedo}
            onClick={onRedo}
            title="やり直す (Ctrl/Cmd+Shift+Z)"
          >
            <Redo2 size={14} />
          </button>
        </div>

        <button
          type="button"
          className="action-btn"
          onClick={() => audioInputRef.current?.click()}
          title="音声ファイル (WAV / MP3 / OGG / FLAC等) を取り込む"
        >
          <Upload size={13} />
          <span>音声読込</span>
        </button>
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) onImportAudio(e.target.files);
            e.target.value = "";
          }}
        />

        {/* Project Dropdown */}
        <div className="menu-anchor" onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`action-btn ${openMenu === "project" ? "active" : ""}`}
            onClick={() =>
              setOpenMenu((m) => (m === "project" ? null : "project"))
            }
          >
            <FolderOpen size={13} />
            <span>プロジェクト</span>
            <ChevronDown size={12} />
          </button>
          {openMenu === "project" && (
            <div className="dropdown-menu">
              <button
                type="button"
                onClick={() => {
                  setOpenMenu(null);
                  onSaveProject();
                }}
              >
                <Save size={13} /> ファイルに保存 (.hanautai.json)
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpenMenu(null);
                  projectInputRef.current?.click();
                }}
              >
                <FolderOpen size={13} /> ファイルから開く
              </button>
              <div className="menu-divider" />
              <button
                type="button"
                onClick={() => {
                  setOpenMenu(null);
                  if (confirm("現在の編集を破棄してデモスタジオを復元しますか？")) {
                    onResetDemo();
                  }
                }}
              >
                <RotateCcw size={13} /> デモソングに戻す
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpenMenu(null);
                  if (confirm("現在の編集を破棄して空の新規プロジェクトを作成しますか？")) {
                    onNewEmpty();
                  }
                }}
              >
                <FilePlus2 size={13} /> 空の新規プロジェクト
              </button>
            </div>
          )}
        </div>
        <input
          ref={projectInputRef}
          type="file"
          accept=".json,.hanautai.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onLoadProject(f);
            e.target.value = "";
          }}
        />

        {/* Split WAV Export Button */}
        <div className="menu-anchor split-export" onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="export-wav-btn main"
            onClick={() => onExportWav("mix")}
            title="全トラック・ピッチ補正・エフェクト込みで高品質WAV書き出し"
          >
            <Download size={13} />
            <span>WAV書き出し</span>
          </button>
          <button
            type="button"
            className="export-wav-btn caret"
            onClick={() =>
              setOpenMenu((m) => (m === "export" ? null : "export"))
            }
            title="書き出しオプション"
          >
            <ChevronDown size={13} />
          </button>
          {openMenu === "export" && (
            <div className="dropdown-menu right">
              <button
                type="button"
                onClick={() => {
                  setOpenMenu(null);
                  onExportWav("mix");
                }}
              >
                <Download size={13} /> ミックス全体 (.wav)
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpenMenu(null);
                  onExportWav("loop");
                }}
              >
                <Repeat size={13} /> ループ範囲のみ (.wav)
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpenMenu(null);
                  onExportWav("stem");
                }}
              >
                <Mic size={13} /> 「{selectedTrackName}」単体ステム (.wav)
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          className="t-btn icon-only"
          onClick={onOpenHelp}
          title="操作ガイド & ショートカット"
        >
          <HelpCircle size={15} />
        </button>
      </div>
    </header>
  );
};
