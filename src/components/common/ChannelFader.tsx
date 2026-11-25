import React, { useRef } from "react";

interface ChannelFaderProps {
  valueDb: number;
  color?: string;
  minHeight?: number;
  onChange: (db: number) => void;
  onCommit?: () => void;
}

// Non-linear console fader taper: 0 dB sits at 76% of track height
function dbToNorm(db: number): number {
  if (db <= -59.5) return 0;
  if (db >= 6) return 1;
  if (db >= -18) {
    return 0.42 + ((db + 18) / 24) * 0.58;
  }
  return ((db + 60) / 42) * 0.42;
}

function normToDb(norm: number): number {
  const n = Math.max(0, Math.min(1, norm));
  if (n <= 0.005) return -60;
  if (n >= 0.42) {
    return -18 + ((n - 0.42) / 0.58) * 24;
  }
  return -60 + (n / 0.42) * 42;
}

export const ChannelFader: React.FC<ChannelFaderProps> = ({
  valueDb,
  color = "#38bdf8",
  minHeight = 96,
  onChange,
  onCommit,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<{
    startY: number;
    startNorm: number;
    trackH: number;
  } | null>(null);

  const norm = dbToNorm(valueDb);
  const capPct = (1 - norm) * 100;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = trackRef.current?.getBoundingClientRect();
    const trackH = Math.max(60, rect?.height ?? 130);
    let initialNorm = norm;
    if (rect && !(e.target as HTMLElement).classList.contains("fader-cap")) {
      initialNorm = Math.max(
        0,
        Math.min(1, 1 - (e.clientY - rect.top) / rect.height),
      );
      onChange(Math.round(normToDb(initialNorm) * 10) / 10);
    }
    draggingRef.current = { startY: e.clientY, startNorm: initialNorm, trackH };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const sens = e.shiftKey
      ? draggingRef.current.trackH * 3
      : draggingRef.current.trackH;
    const dy = draggingRef.current.startY - e.clientY;
    const nextNorm = draggingRef.current.startNorm + dy / sens;
    onChange(Math.round(normToDb(nextNorm) * 10) / 10);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    onCommit?.();
  };

  const handleDoubleClick = () => {
    onChange(0);
    onCommit?.();
  };

  const ticks = [6, 0, -6, -12, -24, -48];

  return (
    <div className="fader-wrap" style={{ minHeight }}>
      <div className="fader-scale">
        {ticks.map((t) => (
          <span
            key={t}
            className={`fader-tick ${t === 0 ? "zero" : ""}`}
            style={{ top: `${(1 - dbToNorm(t)) * 100}%` }}
          >
            {t > 0 ? `+${t}` : t}
          </span>
        ))}
      </div>
      <div
        ref={trackRef}
        className="fader-track"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        title="ドラッグで音量調整 / Shiftで微調整 / ダブルクリックで 0.0 dB"
      >
        <div className="fader-groove" />
        <div
          className="fader-fill"
          style={{
            height: `${norm * 100}%`,
            background: `linear-gradient(to top, ${color}55, ${color})`,
          }}
        />
        <div
          className="fader-zero-line"
          style={{ top: `${(1 - dbToNorm(0)) * 100}%` }}
        />
        <div
          className="fader-cap"
          style={{ top: `${capPct}%`, borderColor: color }}
        >
          <span className="fader-cap-line" />
        </div>
      </div>
    </div>
  );
};
