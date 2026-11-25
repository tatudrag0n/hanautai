import React, { useEffect, useRef } from "react";
import { buildWaveshaperCurve } from "../../dsp/biquadResponse";
import type { SatMode, SatSettings } from "../../types/studio";
import { RotaryKnob } from "../common/RotaryKnob";

interface SaturationEditorProps {
  sat: SatSettings;
  onChange: (patch: Partial<SatSettings>) => void;
}

const SAT_MODES: Array<{ id: SatMode; label: string; desc: string }> = [
  { id: "tube", label: "真空管 (Tube)", desc: "温かい倍音でボーカルに艶と存在感" },
  { id: "tape", label: "テープ (Tape)", desc: "丸みのある滑らかなアナログサチュレーション" },
  { id: "crisp", label: "エキサイター (Crisp)", desc: "輪郭を際立たせるエッジの効いたドライブ" },
  { id: "lofi", label: "Lo-Fi (Bit)", desc: "レトロで味のある質感" },
];

export const SaturationEditor: React.FC<SaturationEditorProps> = ({
  sat,
  onChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || 180;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#0a0d14";
    ctx.fillRect(0, 0, w, h);

    const pad = 16;
    const gw = w - pad * 2;
    const gh = h - pad * 2;

    // Axes
    ctx.strokeStyle = "rgba(148, 163, 184, 0.16)";
    ctx.beginPath();
    ctx.moveTo(pad, pad + gh * 0.5);
    ctx.lineTo(pad + gw, pad + gh * 0.5);
    ctx.moveTo(pad + gw * 0.5, pad);
    ctx.lineTo(pad + gw * 0.5, pad + gh);
    ctx.stroke();

    // Linear guide
    ctx.strokeStyle = "rgba(148, 163, 184, 0.22)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad, pad + gh);
    ctx.lineTo(pad + gw, pad);
    ctx.stroke();
    ctx.setLineDash([]);

    // Waveshaper curve
    const curve = buildWaveshaperCurve(sat.mode, sat.drive, 256);
    ctx.beginPath();
    for (let i = 0; i < curve.length; i++) {
      const x = pad + (i / (curve.length - 1)) * gw;
      const y = pad + (1 - (curve[i] + 1) * 0.5) * gh;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = sat.enabled ? "#fb7185" : "#64748b";
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.restore();
  }, [sat.drive, sat.enabled, sat.mode]);

  return (
    <div className="fx-editor-grid">
      <div className="sat-visual-wrap">
        <canvas ref={canvasRef} className="sat-canvas" />
        <div className="mode-pills">
          {SAT_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`mode-pill ${sat.mode === m.id ? "active" : ""}`}
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
          label="ドライブ (倍音)"
          value={Math.round(sat.drive * 100)}
          min={0}
          max={100}
          defaultValue={22}
          step={1}
          color="#fb7185"
          format={(v) => `${Math.round(v)}%`}
          onChange={(v) => onChange({ enabled: true, drive: v / 100 })}
        />
        <RotaryKnob
          label="トーン"
          value={Math.round(sat.tone * 100)}
          min={-100}
          max={100}
          defaultValue={15}
          step={1}
          bipolar
          color="#fbbf24"
          format={(v) => `${v > 0 ? "+" : ""}${Math.round(v)}%`}
          onChange={(v) => onChange({ enabled: true, tone: v / 100 })}
        />
        <RotaryKnob
          label="ミックス (Dry/Wet)"
          value={Math.round(sat.mix * 100)}
          min={0}
          max={100}
          defaultValue={32}
          step={1}
          color="#38bdf8"
          format={(v) => `${Math.round(v)}%`}
          onChange={(v) => onChange({ enabled: true, mix: v / 100 })}
        />
      </div>
    </div>
  );
};
