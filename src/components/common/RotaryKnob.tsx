import React, { useCallback, useRef } from "react";
import { useIsMobile } from "../../hooks/useIsMobile";

interface RotaryKnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  defaultValue?: number;
  step?: number;
  size?: number;
  color?: string;
  bipolar?: boolean;
  format?: (val: number) => string;
  onChange: (val: number) => void;
  onCommit?: () => void;
}

export const RotaryKnob: React.FC<RotaryKnobProps> = ({
  label,
  value,
  min,
  max,
  defaultValue,
  step = 0.01,
  size = 46,
  color = "#38bdf8",
  bipolar = false,
  format,
  onChange,
  onCommit,
}) => {
  const isMobile = useIsMobile();
  const dragRef = useRef<{ startY: number; startVal: number } | null>(null);

  const clampAndSnap = useCallback(
    (v: number) => {
      const clamped = Math.max(min, Math.min(max, v));
      if (step > 0) {
        return Math.round(clamped / step) * step;
      }
      return clamped;
    },
    [min, max, step],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startVal: value };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dy = dragRef.current.startY - e.clientY;
    const range = max - min;
    const sens = e.shiftKey ? 550 : 140;
    const next = clampAndSnap(dragRef.current.startVal + (dy / sens) * range);
    onChange(next);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    onCommit?.();
  };

  const handleDoubleClick = () => {
    const reset = defaultValue ?? (bipolar ? (min + max) / 2 : min);
    onChange(clampAndSnap(reset));
    onCommit?.();
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const range = max - min;
    const delta = (e.deltaY < 0 ? 1 : -1) * range * (e.shiftKey ? 0.01 : 0.04);
    onChange(clampAndSnap(value + delta));
  };

  const norm = Math.max(0, Math.min(1, (value - min) / Math.max(1e-6, max - min)));
  const startDeg = -135;
  const sweepDeg = 270;
  const angleDeg = startDeg + norm * sweepDeg;

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.37;

  const polar = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  const arcPath = (a1: number, a2: number) => {
    if (Math.abs(a2 - a1) < 0.5) return "";
    const from = Math.min(a1, a2);
    const to = Math.max(a1, a2);
    const p1 = polar(from);
    const p2 = polar(to);
    const large = to - from > 180 ? 1 : 0;
    return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  };

  const bgPath = arcPath(startDeg, startDeg + sweepDeg);
  const zeroDeg = bipolar
    ? startDeg + ((0 - min) / Math.max(1e-6, max - min)) * sweepDeg
    : startDeg;
  const valPath = arcPath(zeroDeg, angleDeg);
  const dot = polar(angleDeg);

  const displayText = format
    ? format(value)
    : Number.isInteger(step)
      ? `${Math.round(value)}`
      : value.toFixed(1);

  // On phones a rotary drag is hard to hit and hard to read, so the same
  // value binding is presented as a wide horizontal slider instead.
  if (isMobile) {
    return (
      <div className="knob-slider" onDoubleClick={handleDoubleClick}>
        {label && <span className="knob-label">{label}</span>}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(clampAndSnap(Number(e.target.value)))}
          onPointerUp={() => onCommit?.()}
          onKeyUp={() => onCommit?.()}
        />
        <span className="knob-val">{displayText}</span>
      </div>
    );
  }

  return (
    <div
      className="rotary-knob"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onWheel={handleWheel}
      title={`${label} (ドラッグ: 調整 / Shift: 微調整 / ダブルクリック: リセット)`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={cx}
          cy={cy}
          r={r * 0.74}
          fill="#181c26"
          stroke="#2b3245"
          strokeWidth={1.5}
        />
        <path
          d={bgPath}
          fill="none"
          stroke="#262c3d"
          strokeWidth={3}
          strokeLinecap="round"
        />
        {valPath && (
          <path
            d={valPath}
            fill="none"
            stroke={color}
            strokeWidth={3.2}
            strokeLinecap="round"
          />
        )}
        <line
          x1={cx}
          y1={cy}
          x2={cx + (dot.x - cx) * 0.72}
          y2={cy + (dot.y - cy) * 0.72}
          stroke="#f8fafc"
          strokeWidth={2}
          strokeLinecap="round"
        />
      </svg>
      {label && <span className="knob-label">{label}</span>}
      <span className="knob-val">{displayText}</span>
    </div>
  );
};
