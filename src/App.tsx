import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlignLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Sliders,
  Upload,
  Volume2,
  Wand2,
} from "lucide-react";
import { CHANNEL_FX_PRESETS } from "./audio/presets";
import { EffectsRackView } from "./components/effects/EffectsRackView";
import { MixerConsole } from "./components/mixer/MixerConsole";
import { ShortcutsModal } from "./components/modals/ShortcutsModal";
import { PitchStudio } from "./components/pitch/PitchStudio";
import { TimelineView } from "./components/timeline/TimelineView";
import { TopBar } from "./components/transport/TopBar";
import { useStudioStore } from "./store/useStudioStore";

export const App: React.FC = () => {
  const store = useStudioStore();
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try {
      return localStorage.getItem("hanautai-theme") === "light"
        ? "light"
        : "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("hanautai-theme", theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);

  const [showHelp, setShowHelp] = useState(false);
  const [consoleHeight, setConsoleHeight] = useState(326);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounterRef = useRef(0);

  const {
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
    autoMix,
    applyReferencePitch,
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
  } = store;

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.tagName === "TEXTAREA")
      ) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        void togglePlay();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "r") {
          e.preventDefault();
          void toggleRecord();
        } else if (k === "m" && selectedTrack) {
          e.preventDefault();
          updateTrack(selectedTrack.id, (t) => ({ ...t, mute: !t.mute }), {
            recordHistory: true,
          });
        } else if (k === "s" && selectedTrack) {
          e.preventDefault();
          updateTrack(selectedTrack.id, (t) => ({ ...t, solo: !t.solo }), {
            recordHistory: true,
          });
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, selectedTrack, togglePlay, toggleRecord, undo, updateTrack]);

  const handleSplitterDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = consoleHeight;

    const onMove = (ev: PointerEvent) => {
      const dy = startY - ev.clientY;
      const maxH = Math.max(280, window.innerHeight - 280);
      setConsoleHeight(Math.max(250, Math.min(maxH, startH + dy)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const trackIdx = project.tracks.findIndex((t) => t.id === selectedTrackId);
  const stepTrack = (dir: -1 | 1) => {
    if (project.tracks.length === 0) return;
    const nextIdx =
      (trackIdx + dir + project.tracks.length) % project.tracks.length;
    setSelectedTrackId(project.tracks[nextIdx].id);
  };

  return (
    <div
      className="studio-root"
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          dragCounterRef.current++;
          setIsDraggingFile(true);
        }
      }}
      onDragLeave={() => {
        dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
        if (dragCounterRef.current === 0) setIsDraggingFile(false);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        dragCounterRef.current = 0;
        setIsDraggingFile(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          const audioFiles = Array.from(e.dataTransfer.files).filter(
            (f) =>
              f.type.startsWith("audio/") ||
              /\.(wav|mp3|ogg|flac|m4a|aac|webm)$/i.test(f.name),
          );
          if (audioFiles.length > 0) {
            e.preventDefault();
            void importAudioFiles(audioFiles, selectedTrackId, 0);
          }
        }
      }}
    >
      <TopBar
        projectName={project.name}
        selectedTrackName={selectedTrack?.name ?? "トラック"}
        bpm={project.bpm}
        timeSig={project.timeSig}
        loopEnabled={project.loop.enabled}
        isPlaying={isPlaying}
        isRecording={isRecording}
        metronome={metronome}
        micMonitor={micMonitor}
        micLiveAutotune={micLiveAutotune}
        canUndo={canUndo}
        canRedo={canRedo}
        theme={theme}
        onToggleTheme={() =>
          setTheme((t) => (t === "dark" ? "light" : "dark"))
        }
        onRenameProject={(name) =>
          updateProject((prev) => ({ ...prev, name }), true)
        }
        onTogglePlay={() => void togglePlay()}
        onStop={stopTransport}
        onReturnZero={() => seekTransport(0)}
        onToggleRecord={() => void toggleRecord()}
        onToggleLoop={() =>
          updateProject((prev) => ({
            ...prev,
            loop: { ...prev.loop, enabled: !prev.loop.enabled },
          }))
        }
        onToggleMetronome={toggleMetronome}
        onChangeBpm={(bpm) =>
          updateProject((prev) => ({ ...prev, bpm }), false)
        }
        onToggleMicMonitor={() => setMicMonitor((v) => !v)}
        onToggleMicLiveAutotune={() => setMicLiveAutotune((v) => !v)}
        onUndo={undo}
        onRedo={redo}
        onImportAudio={(files) => void importAudioFiles(files, selectedTrackId, 0)}
        onExportWav={(mode) => {
          if (mode === "loop") {
            void exportWavMix({ loopOnly: true, label: "loop" });
          } else if (mode === "stem" && selectedTrack) {
            void exportWavMix({
              soloTrackId: selectedTrack.id,
              label: selectedTrack.name,
            });
          } else {
            void exportWavMix({ label: "mix" });
          }
        }}
        onSaveProject={exportProjectJson}
        onLoadProject={(f) => void importProjectJson(f)}
        onResetDemo={resetDemoProject}
        onNewEmpty={resetEmptyProject}
        onOpenHelp={() => setShowHelp(true)}
      />

      {/* Workspace Mode & Active Track Bar */}
      <div className="workspace-nav">
        <div className="nav-tabs">
          <button
            type="button"
            className={`nav-tab ${topTab === "pitch" && !consoleExpanded ? "active" : ""}`}
            onClick={() => {
              setConsoleExpanded(false);
              setTopTab("pitch");
            }}
          >
            <Activity size={14} />
            <span>ピッチ補正</span>
            {selectedTrack?.pitch.enabled && !selectedTrack.pitch.bypass && (
              <span className="tab-live-dot" title="このトラックのピッチ補正が有効" />
            )}
          </button>
          <button
            type="button"
            className={`nav-tab ${topTab === "effects" && !consoleExpanded ? "active" : ""}`}
            onClick={() => {
              setConsoleExpanded(false);
              setTopTab("effects");
            }}
          >
            <Sliders size={14} />
            <span>エフェクト</span>
          </button>
          <button
            type="button"
            className={`nav-tab ${topTab === "timeline" && !consoleExpanded ? "active" : ""}`}
            onClick={() => {
              setConsoleExpanded(false);
              setTopTab("timeline");
            }}
          >
            <AlignLeft size={14} />
            <span>タイムライン</span>
          </button>
        </div>

        {/* Compact Active Track Switcher (Never Overflows) */}
        <div className="active-track-switcher">
          <button
            type="button"
            className="mini-btn icon-sq"
            onClick={() => stepTrack(-1)}
            title="前のトラックへ"
          >
            <ChevronLeft size={13} />
          </button>
          <div className="track-select-box">
            <span
              className="dot"
              style={{ background: selectedTrack?.color ?? "#38bdf8" }}
            />
            <select
              value={selectedTrackId}
              onChange={(e) => setSelectedTrackId(e.target.value)}
              title="編集対象のトラックを切り替え"
            >
              {project.tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="mini-btn icon-sq"
            onClick={() => stepTrack(1)}
            title="次のトラックへ"
          >
            <ChevronRight size={13} />
          </button>
        </div>

        <div className="nav-right">
          <button
            type="button"
            className="auto-mix-btn"
            onClick={autoMix}
            title="全トラックを解析して、音量バランス・EQ・コンプ・ピッチ補正・マスターまで自動で整えます（元に戻すで取り消し可）"
          >
            <Wand2 size={13} /> おまかせMIX
          </button>
          <span className="status-pill" title={statusMessage}>
            {statusMessage}
          </span>
          <button
            type="button"
            className="mini-btn"
            onClick={() => setConsoleExpanded((v) => !v)}
            title="ミキサーコンソールの表示サイズを切り替え"
          >
            {consoleExpanded ? (
              <>
                <ChevronDown size={13} /> 分割表示
              </>
            ) : (
              <>
                <ChevronUp size={13} /> ミキサー拡大
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Split Workspace */}
      <main className="studio-main">
        {!consoleExpanded && selectedTrack && (
          <section className="top-deck">
            {topTab === "pitch" && (
              <PitchStudio
                track={selectedTrack}
                allTracks={project.tracks}
                clip={selectedClip}
                bpm={project.bpm}
                timeSig={project.timeSig}
                onSelectTrack={setSelectedTrackId}
                onToggleSolo={() =>
                  updateTrack(
                    selectedTrack.id,
                    (t) => ({ ...t, solo: !t.solo }),
                    { recordHistory: true },
                  )
                }
                onUpdatePitch={(patch, opts) =>
                  updateTrackPitch(selectedTrack.id, patch, opts)
                }
                onEnsureAnalyzed={(clipId) =>
                  ensureClipAnalyzed(selectedTrack.id, clipId)
                }
                onUpdateBlobs={(clipId, updater, rec) =>
                  updateClipBlobs(selectedTrack.id, clipId, updater, rec)
                }
                onUpdateDrawnPitch={(clipId, updater, rec) =>
                  updateClipDrawnPitch(selectedTrack.id, clipId, updater, rec)
                }
                onSplitBlob={(clipId, blobId, t) =>
                  splitBlobAtTime(selectedTrack.id, clipId, blobId, t)
                }
                onAutoDetectKey={() => autoDetectKey(selectedTrack.id)}
                onApplyReferencePitch={(file) => applyReferencePitch(selectedTrack.id, selectedClip?.id ?? null, file)}
                onGenerateHarmony={(semi) =>
                  duplicateHarmonyTrack(selectedTrack.id, semi)
                }
                onStartRecord={() => void toggleRecord()}
              />
            )}

            {topTab === "effects" && (
              <EffectsRackView
                track={selectedTrack}
                spaceBus={project.spaceBus}
                master={project.master}
                activeModule={activeFxModule}
                onSelectModule={setActiveFxModule}
                onUpdateTrackFx={(updater, rec) =>
                  updateTrackFx(selectedTrack.id, updater, rec)
                }
                onUpdateTrackSends={(rev, dly) =>
                  updateTrack(selectedTrack.id, (t) => ({
                    ...t,
                    sendReverb: rev,
                    sendDelay: dly,
                  }))
                }
                onUpdateSpaceBus={(patch) => updateSpaceBus(patch)}
                onUpdateMaster={(patch) => updateMaster(patch)}
                onApplyPreset={(presetId) => {
                  const found = CHANNEL_FX_PRESETS.find((p) => p.id === presetId);
                  if (!found) return;
                  updateTrack(
                    selectedTrack.id,
                    (t) => ({
                      ...t,
                      sendReverb: found.sendReverb,
                      sendDelay: found.sendDelay,
                      fx: structuredClone(found.fx),
                    }),
                    { recordHistory: true },
                  );
                }}
              />
            )}

            {topTab === "timeline" && (
              <TimelineView
                tracks={project.tracks}
                bpm={project.bpm}
                timeSig={project.timeSig}
                loop={project.loop}
                selectedTrackId={selectedTrackId}
                selectedClipId={selectedClip?.id ?? selectedClipId}
                onSelectTrack={setSelectedTrackId}
                onSelectClip={(tid, cid) => {
                  setSelectedTrackId(tid);
                  setSelectedClipId(cid);
                }}
                onSeek={seekTransport}
                onUpdateLoop={(loop) =>
                  updateProject((prev) => ({ ...prev, loop }), false)
                }
                onUpdateTrack={(tid, updater, rec) =>
                  updateTrack(tid, updater, { recordHistory: rec })
                }
                onImportFiles={(files, tid, t0) =>
                  void importAudioFiles(files, tid, t0)
                }
                onOpenPitchForClip={(tid, cid) => {
                  setSelectedTrackId(tid);
                  setSelectedClipId(cid);
                  ensureClipAnalyzed(tid, cid);
                  setTopTab("pitch");
                }}
              />
            )}
          </section>
        )}

        {!consoleExpanded && (
          <div
            className="deck-splitter"
            onPointerDown={handleSplitterDown}
            title="上下ドラッグでエディタとミキサーの比率を調整"
          >
            <span className="splitter-grip" />
          </div>
        )}

        {/* Bottom Mixing Console */}
        <section
          className={`bottom-console ${consoleExpanded ? "expanded" : ""}`}
          style={consoleExpanded ? undefined : { height: consoleHeight }}
        >
          <MixerConsole
            tracks={project.tracks}
            master={project.master}
            selectedTrackId={selectedTrackId}
            onSelectTrack={setSelectedTrackId}
            onUpdateTrack={(tid, updater, rec) =>
              updateTrack(tid, updater, { recordHistory: rec })
            }
            onDeleteTrack={deleteTrack}
            onAddTrack={(role) => addTrack(role)}
            onOpenPitch={(tid) => {
              setSelectedTrackId(tid);
              setConsoleExpanded(false);
              setTopTab("pitch");
            }}
            onOpenFxModule={(tid, mod) => {
              setSelectedTrackId(tid);
              setActiveFxModule(mod);
              setConsoleExpanded(false);
              setTopTab("effects");
            }}
            onUpdateMaster={(patch) => updateMaster(patch)}
          />
        </section>
      </main>

      {/* Mobile bottom navigation (phones only, shown via CSS) */}
      <nav className="mobile-nav" aria-label="画面切り替え">
        <button
          type="button"
          className={`mobile-nav-btn ${!consoleExpanded && topTab === "pitch" ? "active" : ""}`}
          onClick={() => {
            setConsoleExpanded(false);
            setTopTab("pitch");
          }}
        >
          <Activity size={20} />
          <span>ピッチ</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-btn ${!consoleExpanded && topTab === "effects" ? "active" : ""}`}
          onClick={() => {
            setConsoleExpanded(false);
            setTopTab("effects");
          }}
        >
          <Sliders size={20} />
          <span>エフェクト</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-btn ${!consoleExpanded && topTab === "timeline" ? "active" : ""}`}
          onClick={() => {
            setConsoleExpanded(false);
            setTopTab("timeline");
          }}
        >
          <AlignLeft size={20} />
          <span>タイムライン</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-btn ${consoleExpanded ? "active" : ""}`}
          onClick={() => setConsoleExpanded(true)}
        >
          <Volume2 size={20} />
          <span>ミキサー</span>
        </button>
      </nav>

      {isDraggingFile && (
        <div className="file-drop-overlay">
          <div className="file-drop-box">
            <Upload size={40} />
            <strong>ここに音声ファイルをドロップ</strong>
            <span>WAV / MP3 / OGG / FLAC を新規または選択中のトラックに読み込みます</span>
          </div>
        </div>
      )}

      {showHelp && <ShortcutsModal onClose={() => setShowHelp(false)} />}
    </div>
  );
};

export default App;
