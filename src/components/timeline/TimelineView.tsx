import React, { useEffect, useRef, useState } from "react";
import { Copy, Scissors, Trash2, Upload } from "lucide-react";
import { audioEngine } from "../../audio/audioEngine";
import { computeMinMaxPeaks } from "../../dsp/pitchAnalysis";
import { nextId } from "../../store/useStudioStore";
import type { AudioClip, LoopRegion, Track } from "../../types/studio";

interface TimelineViewProps {
  tracks: Track[];
  bpm: number;
  timeSig: number;
  loop: LoopRegion;
  selectedTrackId: string;
  selectedClipId: string | null;
  onSelectTrack: (id: string) => void;
  onSelectClip: (trackId: string, clipId: string) => void;
  onSeek: (timeSec: number) => void;
  onUpdateLoop: (loop: LoopRegion) => void;
  onUpdateTrack: (trackId: string, updater: (t: Track) => Track, rec?: boolean) => void;
  onImportFiles: (files: FileList | File[], trackId?: string, startTime?: number) => void;
  onOpenPitchForClip: (trackId: string, clipId: string) => void;
}

const HEADER_W = 175;
const TRACK_H = 74;

export const TimelineView: React.FC<TimelineViewProps> = ({
  tracks,
  bpm,
  timeSig,
  loop,
  selectedTrackId,
  selectedClipId,
  onSelectTrack,
  onSelectClip,
  onSeek,
  onUpdateLoop,
  onUpdateTrack,
  onImportFiles,
  onOpenPitchForClip,
}) => {
  const [pxPerSec, setPxPerSec] = useState(86);
  const [snapToBeat, setSnapToBeat] = useState(true);
  const playheadRef = useRef<HTMLDivElement>(null);

  const totalSec = Math.max(
    16,
    loop.endTime + 4,
    ...tracks.flatMap((t) => t.clips.map((c) => c.startTime + c.duration + 4)),
  );

  // Smooth 60fps playhead needle
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      if (playheadRef.current) {
        const t = audioEngine.getPlayheadTime();
        playheadRef.current.style.transform = `translateX(${HEADER_W + t * pxPerSec}px)`;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [pxPerSec]);

  const beatSec = 60 / Math.max(40, bpm);
  const totalBeats = Math.ceil(totalSec / beatSec);

  const handleRulerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - HEADER_W;
    if (x < 0) return;
    const t = Math.max(0, x / pxPerSec);
    onSeek(t);
  };

  const handleClipDragStart = (
    e: React.PointerEvent<HTMLDivElement>,
    track: Track,
    clip: AudioClip,
  ) => {
    e.stopPropagation();
    onSelectTrack(track.id);
    onSelectClip(track.id, clip.id);
    const startX = e.clientX;
    const origStart = clip.startTime;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      let next = Math.max(0, origStart + dx / pxPerSec);
      if (snapToBeat && !ev.shiftKey) {
        const grid = beatSec * 0.25; // 1/16 beat snap
        next = Math.round(next / grid) * grid;
      }
      onUpdateTrack(
        track.id,
        (t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clip.id ? { ...c, startTime: next } : c,
          ),
        }),
        false,
      );
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const selectedTrack = tracks.find((t) => t.id === selectedTrackId);
  const selectedClip = selectedTrack?.clips.find((c) => c.id === selectedClipId) ?? null;

  const splitSelectedClipAtPlayhead = () => {
    if (!selectedTrack || !selectedClip) return;
    const t = audioEngine.getPlayheadTime();
    if (
      t <= selectedClip.startTime + 0.05 ||
      t >= selectedClip.startTime + selectedClip.duration - 0.05
    ) {
      return;
    }
    const splitRel = t - selectedClip.startTime;
    const sampleSplit = Math.round((selectedClip.offset + splitRel) * selectedClip.sampleRate);

    const leftCh = selectedClip.rawChannels.map((ch) => ch.slice(0, sampleSplit));
    const rightCh = selectedClip.rawChannels.map((ch) => ch.slice(sampleSplit));

    const leftClip: AudioClip = {
      ...selectedClip,
      duration: splitRel,
      totalDuration: splitRel,
      rawChannels: leftCh,
      waveformPeaks: computeMinMaxPeaks(leftCh, 240),
      analysis: null,
      blobs: [],
      processedChannels: null,
    };
    const rightClip: AudioClip = {
      ...selectedClip,
      id: nextId("clip"),
      name: `${selectedClip.name} (2)`,
      startTime: t,
      offset: 0,
      duration: selectedClip.duration - splitRel,
      totalDuration: selectedClip.duration - splitRel,
      rawChannels: rightCh,
      waveformPeaks: computeMinMaxPeaks(rightCh, 240),
      analysis: null,
      blobs: [],
      processedChannels: null,
    };

    onUpdateTrack(
      selectedTrack.id,
      (tr) => ({
        ...tr,
        clips: tr.clips.flatMap((c) =>
          c.id === selectedClip.id ? [leftClip, rightClip] : [c],
        ),
      }),
      true,
    );
  };

  const duplicateSelectedClip = () => {
    if (!selectedTrack || !selectedClip) return;
    const copy: AudioClip = {
      ...selectedClip,
      id: nextId("clip"),
      name: `${selectedClip.name} Copy`,
      startTime: selectedClip.startTime + selectedClip.duration,
      blobs: selectedClip.blobs.map((b) => ({ ...b, id: nextId("blob") })),
    };
    onUpdateTrack(
      selectedTrack.id,
      (tr) => ({ ...tr, clips: [...tr.clips, copy] }),
      true,
    );
  };

  const deleteSelectedClip = () => {
    if (!selectedTrack || !selectedClip) return;
    onUpdateTrack(
      selectedTrack.id,
      (tr) => ({
        ...tr,
        clips: tr.clips.filter((c) => c.id !== selectedClip.id),
      }),
      true,
    );
  };

  return (
    <div className="timeline-view">
      {/* Timeline Toolbar */}
      <div className="timeline-toolbar">
        <div className="tool-group">
          <button
            type="button"
            className={`mini-btn ${snapToBeat ? "active" : ""}`}
            onClick={() => setSnapToBeat(!snapToBeat)}
          >
            グリッド吸着 {snapToBeat ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            className={`mini-btn ${loop.enabled ? "active" : ""}`}
            onClick={() => onUpdateLoop({ ...loop, enabled: !loop.enabled })}
          >
            ループ {loop.enabled ? "ON" : "OFF"}
          </button>
          <label className="compact-num">
            <span>Loop範囲(秒)</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={loop.startTime.toFixed(1)}
              onChange={(e) =>
                onUpdateLoop({
                  ...loop,
                  startTime: Math.max(0, Math.min(loop.endTime - 0.5, Number(e.target.value))),
                })
              }
            />
            <span>〜</span>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={loop.endTime.toFixed(1)}
              onChange={(e) =>
                onUpdateLoop({
                  ...loop,
                  endTime: Math.max(loop.startTime + 0.5, Number(e.target.value)),
                })
              }
            />
          </label>
        </div>

        <div className="tool-group">
          {selectedClip && (
            <>
              <span className="inspector-badge">{selectedClip.name}</span>
              <label className="inline-slider">
                <span>Gain</span>
                <input
                  type="range"
                  min={-24}
                  max={12}
                  step={0.5}
                  value={selectedClip.gainDb}
                  onChange={(e) => {
                    const g = Number(e.target.value);
                    if (!selectedTrack) return;
                    onUpdateTrack(selectedTrack.id, (tr) => ({
                      ...tr,
                      clips: tr.clips.map((c) =>
                        c.id === selectedClip.id ? { ...c, gainDb: g } : c,
                      ),
                    }));
                  }}
                />
                <span>{selectedClip.gainDb > 0 ? "+" : ""}{selectedClip.gainDb.toFixed(1)}dB</span>
              </label>
              <button
                type="button"
                className="mini-btn"
                onClick={splitSelectedClipAtPlayhead}
                title="再生位置でクリップを分割"
              >
                <Scissors size={12} /> 分割
              </button>
              <button
                type="button"
                className="mini-btn"
                onClick={duplicateSelectedClip}
                title="クリップ複製"
              >
                <Copy size={12} /> 複製
              </button>
              <button
                type="button"
                className="mini-btn danger"
                onClick={deleteSelectedClip}
                title="クリップ削除"
              >
                <Trash2 size={12} />
              </button>
            </>
          )}
        </div>

        <div className="tool-group">
          <button
            type="button"
            className="mini-btn"
            onClick={() => setPxPerSec((z) => Math.max(30, z * 0.8))}
          >
            縮小
          </button>
          <button
            type="button"
            className="mini-btn"
            onClick={() => setPxPerSec((z) => Math.min(240, z * 1.25))}
          >
            拡大
          </button>
        </div>
      </div>

      {/* Scrollable Arrangement Area */}
      <div
        className="timeline-scroll"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length > 0) {
            onImportFiles(e.dataTransfer.files, selectedTrackId, 0);
          }
        }}
      >
        <div
          className="timeline-canvas-inner"
          style={{ width: HEADER_W + totalSec * pxPerSec }}
        >
          {/* Ruler */}
          <div className="timeline-ruler" onPointerDown={handleRulerPointerDown}>
            <div className="ruler-corner" style={{ width: HEADER_W }}>
              BAR / TIME (クリックで移動)
            </div>
            <div className="ruler-ticks">
              {loop.enabled && (
                <div
                  className="loop-bar-highlight"
                  style={{
                    left: loop.startTime * pxPerSec,
                    width: Math.max(8, (loop.endTime - loop.startTime) * pxPerSec),
                  }}
                />
              )}
              {Array.from({ length: totalBeats }).map((_, b) => {
                const isBar = b % Math.max(1, timeSig) === 0;
                return (
                  <div
                    key={b}
                    className={`ruler-tick ${isBar ? "bar" : ""}`}
                    style={{ left: b * beatSec * pxPerSec }}
                  >
                    {isBar && <span>{Math.floor(b / timeSig) + 1}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Track Lanes */}
          {tracks.map((track) => (
            <div
              key={track.id}
              className={`timeline-row ${track.id === selectedTrackId ? "selected" : ""}`}
              style={{ height: TRACK_H }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                const x = Math.max(0, e.clientX - rect.left - HEADER_W);
                if (e.dataTransfer.files.length > 0) {
                  onImportFiles(e.dataTransfer.files, track.id, x / pxPerSec);
                }
              }}
              onClick={() => onSelectTrack(track.id)}
            >
              <div className="timeline-track-head" style={{ width: HEADER_W }}>
                <span className="dot" style={{ background: track.color }} />
                <div className="head-info">
                  <strong>{track.name}</strong>
                  <small>{track.clips.length} クリップ</small>
                </div>
                <label className="upload-mini-btn" title="このトラックへ音声ファイルを追加">
                  <Upload size={12} />
                  <input
                    type="file"
                    accept="audio/*"
                    hidden
                    onChange={(e) => {
                      if (e.target.files) onImportFiles(e.target.files, track.id, 0);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>

              <div className="timeline-lane">
                {track.clips.length === 0 && (
                  <div className="timeline-empty-hint">
                    ここに音声ファイルをドロップ または 上部の「録音」で収録
                  </div>
                )}
                {track.clips.map((clip) => (
                  <ClipBlock
                    key={clip.id}
                    clip={clip}
                    color={track.color}
                    pxPerSec={pxPerSec}
                    selected={clip.id === selectedClipId}
                    onPointerDown={(e) => handleClipDragStart(e, track, clip)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onOpenPitchForClip(track.id, clip.id);
                    }}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Playhead Needle */}
          <div ref={playheadRef} className="timeline-playhead">
            <div className="playhead-cap" />
          </div>
        </div>
      </div>
    </div>
  );
};

interface ClipBlockProps {
  clip: AudioClip;
  color: string;
  pxPerSec: number;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onDoubleClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}

const ClipBlock: React.FC<ClipBlockProps> = ({
  clip,
  color,
  pxPerSec,
  selected,
  onPointerDown,
  onDoubleClick,
}) => {
  const width = Math.max(24, clip.duration * pxPerSec);
  const peaks = clip.waveformPeaks;
  const bins = peaks.length / 2;

  // Build crisp SVG waveform path
  const midY = 26;
  let pathD = `M 0 ${midY}`;
  for (let i = 0; i < bins; i++) {
    const x = (i / Math.max(1, bins - 1)) * width;
    const min = peaks[i * 2];
    const max = peaks[i * 2 + 1];
    pathD += ` L ${x.toFixed(1)} ${(midY - max * 22).toFixed(1)} L ${x.toFixed(1)} ${(midY - min * 22).toFixed(1)}`;
  }

  return (
    <div
      className={`clip-block ${selected ? "selected" : ""}`}
      style={{
        left: clip.startTime * pxPerSec,
        width,
        borderColor: selected ? "#f8fafc" : color,
        background: `${color}22`,
      }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      title={`${clip.name} (ドラッグで移動 / ダブルクリックでピッチ編集)`}
    >
      <div className="clip-title" style={{ background: `${color}44` }}>
        <span>{clip.name}</span>
        {clip.analysis && <span className="clip-pitch-tag">PITCH</span>}
      </div>
      <svg className="clip-wave-svg" viewBox={`0 0 ${width} 52`} preserveAspectRatio="none">
        <path d={pathD} stroke={color} strokeWidth={1.1} fill="none" />
      </svg>
    </div>
  );
};
