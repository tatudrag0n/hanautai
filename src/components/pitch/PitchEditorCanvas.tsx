import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audioEngine } from "../../audio/audioEngine";
import {
  formatCentsOffset,
  isMidiInScale,
  midiToName,
  NOTE_NAMES,
  snapMidiToScale,
} from "../../dsp/musicTheory";
import { compileTargetPitchCurve } from "../../dsp/psola";
import type {
  AudioClip,
  PitchBlob,
  PitchDrawPoint,
  PitchSettings,
} from "../../types/studio";

export type PitchTool = "move" | "split" | "draw" | "reset";

interface PitchEditorCanvasProps {
  clip: AudioClip;
  pitchSettings: PitchSettings;
  bpm: number;
  timeSig: number;
  trackColor: string;
  tool: PitchTool;
  selectedBlobIds: string[];
  onSelectBlobs: (ids: string[]) => void;
  onUpdateBlobs: (updater: (blobs: PitchBlob[]) => PitchBlob[], recordHistory?: boolean) => void;
  onUpdateDrawnPitch: (
    updater: (pts: PitchDrawPoint[]) => PitchDrawPoint[],
    recordHistory?: boolean,
  ) => void;
  onSplitBlob: (blobId: string, time: number) => void;
  onToggleCustomScaleNote?: (pc: number) => void;
}

const MIN_MIDI = 36; // C2
const MAX_MIDI = 86; // D6
const PIANO_W = 54;

export const PitchEditorCanvas: React.FC<PitchEditorCanvasProps> = ({
  clip,
  pitchSettings,
  bpm,
  timeSig,
  trackColor,
  tool,
  selectedBlobIds,
  onSelectBlobs,
  onUpdateBlobs,
  onUpdateDrawnPitch,
  onSplitBlob,
  onToggleCustomScaleNote,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [zoomX, setZoomX] = useState(110); // pixels per second
  const [rowH, setRowH] = useState(18); // pixels per semitone
  const [scrollX, setScrollX] = useState(0);
  const [scrollMidiTop, setScrollMidiTop] = useState(76); // top visible MIDI
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverMidi, setHoverMidi] = useState<number | null>(null);

  // Auto-center vertically when switching clips
  useEffect(() => {
    if (clip.blobs.length > 0) {
      const avg =
        clip.blobs.reduce((s, b) => s + b.targetMidi, 0) / clip.blobs.length;
      setScrollMidiTop(Math.min(MAX_MIDI, Math.max(MIN_MIDI + 18, Math.round(avg + 9))));
    }
  }, [clip.id]);

  // Compile live target curve for visualization
  const compiledCurve = useMemo(() => {
    if (!clip.analysis) return null;
    return compileTargetPitchCurve(
      clip.analysis,
      clip.blobs,
      pitchSettings,
      clip.drawnPitch,
    );
  }, [clip.analysis, clip.blobs, clip.drawnPitch, pitchSettings]);

  const dragStateRef = useRef<
    | {
        mode: "moveBlob";
        startY: number;
        blobIds: string[];
        initialTargets: Record<string, number>;
        lastAuditionMidi: number | null;
      }
    | {
        mode: "draw";
        points: PitchDrawPoint[];
      }
    | {
        mode: "pan";
        startX: number;
        startY: number;
        initScrollX: number;
        initScrollMidiTop: number;
      }
    | null
  >(null);

  const timeToX = useCallback(
    (t: number) => PIANO_W + (t - scrollX) * zoomX,
    [scrollX, zoomX],
  );
  const xToTime = useCallback(
    (x: number) => scrollX + (x - PIANO_W) / zoomX,
    [scrollX, zoomX],
  );
  const midiToY = useCallback(
    (m: number) => (scrollMidiTop - m) * rowH,
    [rowH, scrollMidiTop],
  );
  const yToMidi = useCallback(
    (y: number) => scrollMidiTop - y / rowH,
    [rowH, scrollMidiTop],
  );

  const findBlobAt = useCallback(
    (time: number, midi: number): PitchBlob | null => {
      for (const b of clip.blobs) {
        if (time >= b.startTime - 0.02 && time <= b.endTime + 0.02) {
          if (Math.abs(midi - b.targetMidi) <= 0.68) {
            return b;
          }
        }
      }
      return null;
    },
    [clip.blobs],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const midiFloat = yToMidi(y);
    const midiInt = Math.round(midiFloat);

    // Clicking piano keyboard on the left
    if (x < PIANO_W) {
      if (e.altKey && onToggleCustomScaleNote) {
        onToggleCustomScaleNote(((midiInt % 12) + 12) % 12);
      } else {
        void audioEngine.playReferenceTone(midiInt, 0.3);
      }
      return;
    }

    // Middle-mouse or Space/Alt pan
    if (e.button === 1 || e.altKey) {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStateRef.current = {
        mode: "pan",
        startX: e.clientX,
        startY: e.clientY,
        initScrollX: scrollX,
        initScrollMidiTop: scrollMidiTop,
      };
      return;
    }

    const t = xToTime(x) - clip.startTime;
    const hitBlob = findBlobAt(t, midiFloat);

    if (tool === "split") {
      if (hitBlob) {
        onSplitBlob(hitBlob.id, Math.max(hitBlob.startTime + 0.04, Math.min(hitBlob.endTime - 0.04, t)));
      }
      return;
    }

    if (tool === "reset") {
      if (hitBlob) {
        onUpdateBlobs(
          (blobs) =>
            blobs.map((b) =>
              b.id === hitBlob.id
                ? {
                    ...b,
                    targetMidi: pitchSettings.scaleLock
                      ? snapMidiToScale(
                          b.rawMidi,
                          pitchSettings.keyRoot,
                          pitchSettings.scale,
                          pitchSettings.customNotes,
                        )
                      : Math.round(b.rawMidi),
                    correctionOverride: null,
                    vibratoScaleOverride: null,
                    formantOverride: null,
                    gainDb: 0,
                  }
                : b,
            ),
          true,
        );
        onUpdateDrawnPitch(
          (pts) =>
            pts.filter((p) => p.time < hitBlob.startTime || p.time > hitBlob.endTime),
          true,
        );
      }
      return;
    }

    if (tool === "draw") {
      e.currentTarget.setPointerCapture(e.pointerId);
      const pt = { time: Math.max(0, t), midi: midiFloat };
      dragStateRef.current = { mode: "draw", points: [pt] };
      return;
    }

    // Move / Select tool
    if (hitBlob) {
      const alreadySelected = selectedBlobIds.includes(hitBlob.id);
      let nextIds: string[];
      if (e.shiftKey) {
        nextIds = alreadySelected
          ? selectedBlobIds.filter((id) => id !== hitBlob.id)
          : [...selectedBlobIds, hitBlob.id];
      } else {
        nextIds = alreadySelected ? selectedBlobIds : [hitBlob.id];
      }
      onSelectBlobs(nextIds);

      const initialTargets: Record<string, number> = {};
      for (const b of clip.blobs) {
        if (nextIds.includes(b.id)) initialTargets[b.id] = b.targetMidi;
      }

      e.currentTarget.setPointerCapture(e.pointerId);
      dragStateRef.current = {
        mode: "moveBlob",
        startY: e.clientY,
        blobIds: nextIds,
        initialTargets,
        lastAuditionMidi: Math.round(hitBlob.targetMidi),
      };
      void audioEngine.playReferenceTone(hitBlob.targetMidi, 0.18);
    } else {
      onSelectBlobs([]);
      // Allow dragging empty space to pan horizontally/vertically gently
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStateRef.current = {
        mode: "pan",
        startX: e.clientX,
        startY: e.clientY,
        initScrollX: scrollX,
        initScrollMidiTop: scrollMidiTop,
      };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const t = xToTime(x) - clip.startTime;
    const m = yToMidi(y);
    setHoverTime(t);
    setHoverMidi(m);

    const ds = dragStateRef.current;
    if (!ds) return;

    if (ds.mode === "pan") {
      const dx = e.clientX - ds.startX;
      const dy = e.clientY - ds.startY;
      setScrollX(Math.max(0, ds.initScrollX - dx / zoomX));
      setScrollMidiTop(
        Math.max(MIN_MIDI + 10, Math.min(MAX_MIDI, ds.initScrollMidiTop + dy / rowH)),
      );
      return;
    }

    if (ds.mode === "draw") {
      ds.points.push({ time: Math.max(0, t), midi: m });
      onUpdateDrawnPitch((pts) => {
        const minT = Math.min(...ds.points.map((p) => p.time)) - 0.015;
        const maxT = Math.max(...ds.points.map((p) => p.time)) + 0.015;
        const kept = pts.filter((p) => p.time < minT || p.time > maxT);
        return [...kept, ...ds.points];
      }, false);
      return;
    }

    if (ds.mode === "moveBlob") {
      const dySemitones = (ds.startY - e.clientY) / rowH;
      const freeCentMode = e.shiftKey || !pitchSettings.scaleLock;

      let leadTarget = ds.lastAuditionMidi;
      onUpdateBlobs(
        (blobs) =>
          blobs.map((b) => {
            if (!ds.blobIds.includes(b.id)) return b;
            const rawNext = ds.initialTargets[b.id] + dySemitones;
            const snapped = freeCentMode
              ? Math.max(MIN_MIDI, Math.min(MAX_MIDI, rawNext))
              : snapMidiToScale(
                  rawNext,
                  pitchSettings.keyRoot,
                  pitchSettings.scale,
                  pitchSettings.customNotes,
                );
            if (b.id === ds.blobIds[0]) leadTarget = snapped;
            return { ...b, targetMidi: snapped };
          }),
        false,
      );

      if (
        leadTarget !== null &&
        Math.round(leadTarget) !== ds.lastAuditionMidi
      ) {
        ds.lastAuditionMidi = Math.round(leadTarget);
        void audioEngine.playReferenceTone(leadTarget, 0.14);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ds = dragStateRef.current;
    if (!ds) return;
    dragStateRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    if (ds.mode === "moveBlob") {
      onUpdateBlobs((b) => [...b], true);
    } else if (ds.mode === "draw") {
      onUpdateDrawnPitch((p) => [...p], true);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < PIANO_W) return;

    const t = xToTime(x) - clip.startTime;
    const m = yToMidi(y);
    const hit = findBlobAt(t, m);
    if (!hit) return;

    const snapped = snapMidiToScale(
      hit.rawMidi,
      pitchSettings.keyRoot,
      pitchSettings.scale,
      pitchSettings.customNotes,
    );
    onUpdateBlobs(
      (blobs) =>
        blobs.map((b) => (b.id === hit.id ? { ...b, targetMidi: snapped } : b)),
      true,
    );
    void audioEngine.playReferenceTone(snapped, 0.22);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      setZoomX((z) => Math.max(45, Math.min(400, z * (e.deltaY < 0 ? 1.12 : 0.89))));
    } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      setScrollX((s) => Math.max(0, s + e.deltaX / zoomX));
    } else if (e.shiftKey) {
      setScrollX((s) => Math.max(0, s + e.deltaY / zoomX));
    } else {
      setScrollMidiTop((top) =>
        Math.max(MIN_MIDI + 10, Math.min(MAX_MIDI, top - (e.deltaY > 0 ? 0.8 : -0.8))),
      );
    }
  };

  // Render loop at 60fps for crisp live playhead + smooth vector curves
  useEffect(() => {
    let rafId = 0;

    const render = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (canvas && container) {
        const w = container.clientWidth;
        const h = container.clientHeight;
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
          canvas.width = w * dpr;
          canvas.height = h * dpr;
        }

        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);

          // 1. Background & MIDI Note Grid Lanes
          ctx.fillStyle = "#0b0e15";
          ctx.fillRect(0, 0, w, h);

          const topMidi = Math.ceil(scrollMidiTop);
          const bottomMidi = Math.floor(scrollMidiTop - h / rowH);

          for (let m = bottomMidi; m <= topMidi; m++) {
            if (m < MIN_MIDI || m > MAX_MIDI) continue;
            const yTop = midiToY(m + 0.5);
            const pc = ((m % 12) + 12) % 12;
            const inScale = isMidiInScale(
              m,
              pitchSettings.keyRoot,
              pitchSettings.scale,
              pitchSettings.customNotes,
            );
            const isBlack = [1, 3, 6, 8, 10].includes(pc);

            if (!inScale && pitchSettings.scaleLock) {
              ctx.fillStyle = "rgba(8, 10, 16, 0.96)";
            } else if (isBlack) {
              ctx.fillStyle = "#111622";
            } else {
              ctx.fillStyle = "#151b2a";
            }
            ctx.fillRect(PIANO_W, yTop, w - PIANO_W, rowH);

            // C-note anchor line
            ctx.strokeStyle =
              pc === 0
                ? "rgba(56, 189, 248, 0.25)"
                : "rgba(148, 163, 184, 0.08)";
            ctx.lineWidth = pc === 0 ? 1.2 : 1;
            ctx.beginPath();
            ctx.moveTo(PIANO_W, yTop + rowH);
            ctx.lineTo(w, yTop + rowH);
            ctx.stroke();

            // Subtle scale center dotted line
            if (inScale) {
              ctx.fillStyle =
                pc === pitchSettings.keyRoot
                  ? "rgba(56, 189, 248, 0.08)"
                  : "rgba(255, 255, 255, 0.015)";
              ctx.fillRect(PIANO_W, yTop, w - PIANO_W, rowH);
            }
          }

          // 2. Beat / Bar Vertical Grid
          const beatSec = 60 / Math.max(40, bpm);
          const startBeat = Math.max(0, Math.floor(scrollX / beatSec));
          const endBeat = Math.ceil((scrollX + (w - PIANO_W) / zoomX) / beatSec);
          for (let b = startBeat; b <= endBeat; b++) {
            const x = timeToX(b * beatSec);
            if (x < PIANO_W) continue;
            const isBar = b % Math.max(1, timeSig) === 0;
            ctx.strokeStyle = isBar
              ? "rgba(148, 163, 184, 0.26)"
              : "rgba(148, 163, 184, 0.08)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();

            if (isBar) {
              ctx.fillStyle = "#64748b";
              ctx.font = "600 10px ui-monospace, monospace";
              ctx.fillText(`BAR ${Math.floor(b / timeSig) + 1}`, x + 4, 12);
            }
          }

          // 3. Waveform Backdrop along bottom
          if (clip.analysis && clip.analysis.waveformPeaks.length > 0) {
            const peaks = clip.analysis.waveformPeaks;
            const baseH = h - 22;
            ctx.fillStyle = "rgba(148, 163, 184, 0.14)";
            const bins = peaks.length;
            const binDur = clip.totalDuration / bins;
            for (let i = 0; i < bins; i++) {
              const bx = timeToX(clip.startTime + i * binDur);
              const bw = Math.max(1, binDur * zoomX);
              if (bx + bw < PIANO_W || bx > w) continue;
              const amp = peaks[i] * 34;
              ctx.fillRect(bx, baseH - amp, bw, amp * 1.4);
            }
          }

          // 4. Pitch Blobs (Melodyne-style capsules)
          for (const blob of clip.blobs) {
            const x1 = timeToX(clip.startTime + blob.startTime);
            const x2 = timeToX(clip.startTime + blob.endTime);
            if (x2 < PIANO_W || x1 > w) continue;

            const isSel = selectedBlobIds.includes(blob.id);
            const drawX = Math.max(PIANO_W, x1);
            const drawW = Math.max(4, x2 - drawX);

            // Ghost outline at raw pitch if shifted
            if (Math.abs(blob.targetMidi - blob.rawMidi) > 0.08) {
              const ry = midiToY(blob.rawMidi) - rowH * 0.42;
              ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
              ctx.setLineDash([3, 3]);
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.roundRect(drawX, ry, drawW, rowH * 0.84, 5);
              ctx.stroke();
              ctx.setLineDash([]);
            }

            const cy = midiToY(blob.targetMidi);
            const bh = rowH * 0.88;
            const by = cy - bh * 0.5;

            ctx.fillStyle = isSel
              ? "rgba(56, 189, 248, 0.42)"
              : `${trackColor}44`;
            ctx.strokeStyle = isSel ? "#f8fafc" : trackColor;
            ctx.lineWidth = isSel ? 2 : 1.3;

            ctx.beginPath();
            ctx.roundRect(drawX, by, drawW, bh, 5);
            ctx.fill();
            ctx.stroke();

            // Blob pitch label
            if (drawW > 34) {
              const label = `${midiToName(blob.targetMidi)} ${formatCentsOffset(blob.rawMidi)}`;
              ctx.fillStyle = "#e2e8f0";
              ctx.font = "600 10px system-ui, sans-serif";
              ctx.fillText(label, drawX + 5, by - 4);
            }
          }

          // 5. Raw Pitch Curve (dashed white/slate)
          if (clip.analysis) {
            const frames = clip.analysis.frames;
            ctx.strokeStyle = "rgba(226, 232, 240, 0.42)";
            ctx.lineWidth = 1.4;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            let penDown = false;
            for (const f of frames) {
              if (!f.voiced || f.midi <= 0) {
                penDown = false;
                continue;
              }
              const fx = timeToX(clip.startTime + f.time);
              if (fx < PIANO_W - 10 || fx > w + 10) {
                penDown = false;
                continue;
              }
              const fy = midiToY(f.midi);
              if (!penDown) {
                ctx.moveTo(fx, fy);
                penDown = true;
              } else {
                ctx.lineTo(fx, fy);
              }
            }
            ctx.stroke();
            ctx.setLineDash([]);
          }

          // 6. Corrected Pitch Curve (bright glowing neon curve!)
          if (clip.analysis && compiledCurve) {
            const frames = clip.analysis.frames;
            ctx.strokeStyle =
              pitchSettings.enabled && !pitchSettings.bypass
                ? "#38bdf8"
                : "#94a3b8";
            ctx.lineWidth = 2.4;
            ctx.shadowColor =
              pitchSettings.enabled && !pitchSettings.bypass
                ? "#38bdf8"
                : "transparent";
            ctx.shadowBlur = 6;
            ctx.beginPath();
            let penDown = false;
            for (let i = 0; i < frames.length; i++) {
              const f = frames[i];
              const tm = compiledCurve.targetMidis[i];
              if (!f.voiced || tm <= 0) {
                penDown = false;
                continue;
              }
              const fx = timeToX(clip.startTime + f.time);
              if (fx < PIANO_W - 10 || fx > w + 10) {
                penDown = false;
                continue;
              }
              const fy = midiToY(tm);
              if (!penDown) {
                ctx.moveTo(fx, fy);
                penDown = true;
              } else {
                ctx.lineTo(fx, fy);
              }
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
          }

          // 7. Split Tool Hover Guide
          if (tool === "split" && hoverTime !== null && hoverMidi !== null) {
            const hit = findBlobAt(hoverTime, hoverMidi);
            if (hit) {
              const sx = timeToX(clip.startTime + hoverTime);
              ctx.strokeStyle = "#f43f5e";
              ctx.lineWidth = 1.6;
              ctx.setLineDash([4, 2]);
              ctx.beginPath();
              ctx.moveTo(sx, midiToY(hit.targetMidi) - rowH);
              ctx.lineTo(sx, midiToY(hit.targetMidi) + rowH);
              ctx.stroke();
              ctx.setLineDash([]);
            }
          }

          // 8. Live Playhead Line
          const playSec = audioEngine.getPlayheadTime();
          const px = timeToX(playSec);
          if (px >= PIANO_W && px <= w) {
            ctx.strokeStyle = "#facc15";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(px, 0);
            ctx.lineTo(px, h);
            ctx.stroke();
          }

          // 9. Left Piano Roll Keyboard Overlay
          ctx.fillStyle = "#111622";
          ctx.fillRect(0, 0, PIANO_W, h);
          for (let m = bottomMidi; m <= topMidi; m++) {
            if (m < MIN_MIDI || m > MAX_MIDI) continue;
            const yTop = midiToY(m + 0.5);
            const pc = ((m % 12) + 12) % 12;
            const isBlack = [1, 3, 6, 8, 10].includes(pc);
            const inScale = isMidiInScale(
              m,
              pitchSettings.keyRoot,
              pitchSettings.scale,
              pitchSettings.customNotes,
            );
            const isHovered =
              hoverMidi !== null && Math.round(hoverMidi) === m;

            ctx.fillStyle = isHovered
              ? "#38bdf8"
              : isBlack
                ? "#0b0f17"
                : "#cbd5e1";
            ctx.fillRect(2, yTop + 0.5, isBlack ? PIANO_W * 0.65 : PIANO_W - 4, rowH - 1);

            if (inScale) {
              ctx.fillStyle =
                pc === pitchSettings.keyRoot ? "#38bdf8" : "#22c55e";
              ctx.beginPath();
              ctx.arc(PIANO_W - 8, yTop + rowH * 0.5, 2.5, 0, Math.PI * 2);
              ctx.fill();
            }

            if (pc === 0 || isHovered) {
              ctx.fillStyle = isBlack && !isHovered ? "#e2e8f0" : "#0f172a";
              ctx.font = "700 9px ui-monospace, monospace";
              ctx.fillText(
                `${NOTE_NAMES[pc]}${Math.floor(m / 12) - 1}`,
                5,
                yTop + rowH * 0.72,
              );
            }
          }

          ctx.strokeStyle = "#263044";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(PIANO_W, 0);
          ctx.lineTo(PIANO_W, h);
          ctx.stroke();

          ctx.restore();
        }
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [
    bpm,
    clip,
    compiledCurve,
    findBlobAt,
    hoverMidi,
    hoverTime,
    midiToY,
    pitchSettings,
    rowH,
    scrollMidiTop,
    scrollX,
    selectedBlobIds,
    timeSig,
    timeToX,
    tool,
    trackColor,
    zoomX,
  ]);

  return (
    <div className="pitch-canvas-shell">
      {/* Top-right Canvas Legend & Live Cursor Readout */}
      <div className="pitch-canvas-hud">
        <span className="hud-legend">
          <i className="legend-dash" /> 原音
        </span>
        <span className="hud-legend">
          <i className="legend-solid" /> 補正後
        </span>
        {hoverMidi !== null && (
          <span className="hud-note">
            {midiToName(hoverMidi)} {formatCentsOffset(hoverMidi)}
          </span>
        )}
      </div>

      <div className="pitch-canvas-overlay-zoom">
        {clip.totalDuration > 3 && (
          <input
            type="range"
            className="pitch-scroll-slider"
            min={0}
            max={Math.max(1, clip.startTime + clip.totalDuration - 2)}
            step={0.05}
            value={Math.min(scrollX, Math.max(1, clip.startTime + clip.totalDuration - 2))}
            onChange={(e) => setScrollX(Number(e.target.value))}
            title="横スクロール位置"
          />
        )}
        <button
          type="button"
          className="mini-btn"
          onClick={() => {
            const cw = containerRef.current?.clientWidth ?? 800;
            const fitZoom = Math.max(45, Math.min(260, (cw - PIANO_W - 24) / Math.max(2, clip.totalDuration)));
            setZoomX(fitZoom);
            setScrollX(Math.max(0, clip.startTime - 0.1));
          }}
          title="クリップ全体を表示"
        >
          Fit
        </button>
        <button
          type="button"
          className="mini-btn"
          onClick={() => setZoomX((z) => Math.min(350, z * 1.25))}
          title="横ズームイン"
        >
          H+
        </button>
        <button
          type="button"
          className="mini-btn"
          onClick={() => setZoomX((z) => Math.max(45, z * 0.8))}
          title="横ズームアウト"
        >
          H-
        </button>
        <button
          type="button"
          className="mini-btn"
          onClick={() => setRowH((r) => Math.min(32, r + 3))}
          title="縦ズームイン"
        >
          V+
        </button>
        <button
          type="button"
          className="mini-btn"
          onClick={() => setRowH((r) => Math.max(11, r - 3))}
          title="縦ズームアウト"
        >
          V-
        </button>
      </div>
      <div ref={containerRef} className="pitch-canvas-container">
        <canvas
          ref={canvasRef}
          className={`pitch-canvas tool-${tool}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={handleDoubleClick}
          onWheel={handleWheel}
          onPointerLeave={() => {
            setHoverTime(null);
            setHoverMidi(null);
          }}
        />
      </div>
    </div>
  );
};
