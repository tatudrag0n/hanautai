import React, { useEffect, useRef } from "react";
import type { ModMode, ModSettings } from "../../types/studio";
import { RotaryKnob } from "../common/RotaryKnob";

interface ModulationEditorProps {
  mod: ModSettings;
  onChange: (patch: Partial<ModSettings>) => void;
}

const MOD_MODES: Array<{ id: ModMode; label: string; desc: string }> = [
  { id: "doubler", label: "ダブラー (Doubler)", desc: "ボーカルを左右に厚く広げる定番効果" },
  { id: "chorus", label: "コーラス (Chorus)", desc: "揺らぎのあるリッチな広がり" },
  { id: "wide", label: "ワイド (Stereo Wide)", desc: "微細ディレイによる透明なステレオ感" },
];

export const ModulationEditor: React.FC<ModulationEditorProps> = ({
  mod,
  onChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let rafId = 0;
    const render = (ts: number) => {
      const canvas = canvasRef.current;
      if (canvas) {
        const w = canvas.clientWidth || 300;
        const h = canvas.clientHeight || 170;
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
          canvas.width = w * dpr;
          canvas.height = h * dpr;
        }
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);
          ctx.fillStyle = "#0a0d14";
          ctx.fillRect(0, 0, w, h);

          const cx = w * 0.5;
          const cy = h * 0.78;
          const maxR = Math.min(w * 0.42, h * 0.68);

          // Stereo semicircular radar
          ctx.strokeStyle = "rgba(148, 163, 184, 0.16)";
          ctx.lineWidth = 1;
          for (const f of [0.4, 0.7, 1.0]) {
            ctx.beginPath();
            ctx.arc(cx, cy, maxR * f, Math.PI, 0);
            ctx.stroke();
          }

          const spread = mod.enabled ? mod.mix * 0.9 + mod.depth * 0.35 : 0.05;
          const phase = (ts / 1000) * mod.rate * Math.PI * 2;
          const wobble = Math.sin(phase) * mod.depth * 0.25;

          const angleLeft = -Math.PI * 0.5 - spread * 0.7 + wobble;
          const angleRight = -Math.PI * 0.5 + spread * 0.7 - wobble;

          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, maxR * 0.92, angleLeft - Math.PI * 0.5 + Math.PI * 0.5, angleRight);
          ctx.closePath();
          ctx.fillStyle = mod.enabled
            ? "rgba(192, 132, 252, 0.26)"
            : "rgba(148, 163, 184, 0.08)";
          ctx.fill();

          ctx.fillStyle = "#cbd5e1";
          ctx.font = "700 10px ui-monospace, monospace";
          ctx.fillText("L", cx - maxR - 12, cy);
          ctx.fillText("R", cx + maxR + 4, cy);
          ctx.fillText("C", cx - 3, cy - maxR - 6);
          ctx.restore();
        }
      }
      rafId = requestAnimationFrame(render);
    };
    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [mod.depth, mod.enabled, mod.mix, mod.rate]);

  return (
    <div className="fx-editor-grid">
      <div className="sat-visual-wrap">
        <canvas ref={canvasRef} className="sat-canvas" />
        <div className="mode-pills">
          {MOD_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`mode-pill ${mod.mode === m.id ? "active" : ""}`}
              title={m.desc}
              onClick={() => onChange({ enabled: true, mode: m.id })}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="fx-knobs-bar">
        <RotaryKnob
          label="揺れ速度 (Rate)"
          value={mod.rate}
          min={0.1}
          max={4.5}
          defaultValue={0.6}
          step={0.05}
          color="#c084fc"
          format={(v) => `${v.toFixed(2)}Hz`}
          onChange={(v) => onChange({ enabled: true, rate: v })}
        />
        <RotaryKnob
          label="深さ (Depth)"
          value={Math.round(mod.depth * 100)}
          min={0}
          max={100}
          defaultValue={35}
          step={1}
          color="#c084fc"
          format={(v) => `${Math.round(v)}%`}
          onChange={(v) => onChange({ enabled: true, depth: v / 100 })}
        />
        <RotaryKnob
          label="広がり (Mix)"
          value={Math.round(mod.mix * 100)}
          min={0}
          max={100}
          defaultValue={30}
          step={1}
          color="#38bdf8"
          format={(v) => `${Math.round(v)}%`}
          onChange={(v) => onChange({ enabled: true, mix: v / 100 })}
        />
      </div>
    </div>
  );
};
