import React, { useEffect, useRef } from "react";
import { audioEngine, gainToDb } from "../../audio/audioEngine";
import { computeCompressorOutputDb } from "../../dsp/biquadResponse";
import type { CompSettings } from "../../types/studio";
import { RotaryKnob } from "../common/RotaryKnob";

interface CompressorEditorProps {
  trackId: string;
  comp: CompSettings;
  onChange: (patch: Partial<CompSettings>) => void;
}

export const CompressorEditor: React.FC<CompressorEditorProps> = ({
  trackId,
  comp,
  onChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let rafId = 0;

    const render = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const w = canvas.clientWidth || 320;
        const h = canvas.clientHeight || 200;
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
          canvas.width = w * dpr;
          canvas.height = h * dpr;
        }
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);

          const pad = 22;
          const graphW = w - 64;
          const graphH = h - pad * 2;

          ctx.fillStyle = "#0a0d14";
          ctx.fillRect(0, 0, w, h);

          const dbToX = (db: number) => pad + ((db + 54) / 54) * graphW;
          const dbToY = (db: number) =>
            pad + graphH - ((Math.max(-54, Math.min(12, db)) + 54) / 66) * graphH;

          // Grid
          ctx.strokeStyle = "rgba(148, 163, 184, 0.1)";
          ctx.lineWidth = 1;
          for (const db of [-48, -36, -24, -12, 0]) {
            const x = dbToX(db);
            ctx.beginPath();
            ctx.moveTo(x, pad);
            ctx.lineTo(x, pad + graphH);
            ctx.stroke();

            const y = dbToY(db);
            ctx.beginPath();
            ctx.moveTo(pad, y);
            ctx.lineTo(pad + graphW, y);
            ctx.stroke();
          }

          // 1:1 unity reference
          ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(dbToX(-54), dbToY(-54));
          ctx.lineTo(dbToX(0), dbToY(0));
          ctx.stroke();
          ctx.setLineDash([]);

          // Transfer Curve
          ctx.beginPath();
          for (let db = -54; db <= 0; db += 0.5) {
            const outDb = computeCompressorOutputDb(db, comp);
            const x = dbToX(db);
            const y = dbToY(outDb);
            if (db === -54) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = comp.enabled ? "#f59e0b" : "#64748b";
          ctx.lineWidth = 2.6;
          ctx.stroke();

          // Threshold crosshair
          const tx = dbToX(comp.threshold);
          ctx.strokeStyle = "rgba(245, 158, 11, 0.4)";
          ctx.beginPath();
          ctx.moveTo(tx, pad);
          ctx.lineTo(tx, pad + graphH);
          ctx.stroke();

          // Live Input Ball & Gain Reduction Bar
          const meters = audioEngine.sampleMeter(trackId);
          const curRmsDb = Math.max(-54, Math.min(0, gainToDb(Math.max(meters.rmsL, meters.rmsR))));
          if (audioEngine.getIsPlaying() && curRmsDb > -53) {
            const bx = dbToX(curRmsDb);
            const by = dbToY(computeCompressorOutputDb(curRmsDb, comp));
            ctx.fillStyle = "#38bdf8";
            ctx.beginPath();
            ctx.arc(bx, by, 5, 0, Math.PI * 2);
            ctx.fill();
          }

          // Right-hand Gain Reduction Meter
          const grX = pad + graphW + 18;
          const grW = 18;
          ctx.fillStyle = "#141925";
          ctx.fillRect(grX, pad, grW, graphH);
          const gr = Math.max(-24, Math.min(0, meters.grDb ?? 0));
          const grH = (-gr / 24) * graphH;
          ctx.fillStyle = "#fb7185";
          ctx.fillRect(grX + 2, pad, grW - 4, grH);
          ctx.fillStyle = "#cbd5e1";
          ctx.font = "700 10px ui-monospace, monospace";
          ctx.fillText("GR", grX + 2, pad - 6);
          ctx.fillText(`${gr.toFixed(1)}`, grX - 2, pad + graphH + 14);

          ctx.restore();
        }
      }
      rafId = requestAnimationFrame(render);
    };
    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [comp, trackId]);

  // 1-knob vocal leveling helper
  const applyEasyPunch = (amount: number) => {
    const t = -10 - amount * 18;
    const r = 2 + amount * 4;
    const m = amount * 5.5;
    onChange({
      enabled: true,
      threshold: Math.round(t),
      ratio: Math.round(r * 10) / 10,
      makeupDb: Math.round(m * 10) / 10,
    });
  };

  return (
    <div className="fx-editor-grid">
      <div className="comp-visual-wrap">
        <canvas ref={canvasRef} className="comp-canvas" />
        <div className="easy-macro-bar">
          <span className="macro-title">ワンノブ簡単コンプ (安定感)</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={Math.max(0, Math.min(1, (-10 - comp.threshold) / 18))}
            onChange={(e) => applyEasyPunch(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="fx-knobs-bar">
        <RotaryKnob
          label="スレッショルド"
          value={comp.threshold}
          min={-50}
          max={0}
          defaultValue={-19}
          step={0.5}
          color="#f59e0b"
          format={(v) => `${v.toFixed(1)}dB`}
          onChange={(v) => onChange({ enabled: true, threshold: v })}
        />
        <RotaryKnob
          label="レシオ"
          value={comp.ratio}
          min={1}
          max={20}
          defaultValue={3.5}
          step={0.1}
          color="#f59e0b"
          format={(v) => `${v.toFixed(1)}:1`}
          onChange={(v) => onChange({ enabled: true, ratio: v })}
        />
        <RotaryKnob
          label="アタック"
          value={comp.attackMs}
          min={0.5}
          max={100}
          defaultValue={8}
          step={0.5}
          color="#38bdf8"
          format={(v) => `${v.toFixed(1)}ms`}
          onChange={(v) => onChange({ enabled: true, attackMs: v })}
        />
        <RotaryKnob
          label="リリース"
          value={comp.releaseMs}
          min={10}
          max={1000}
          defaultValue={110}
          step={5}
          color="#38bdf8"
          format={(v) => `${Math.round(v)}ms`}
          onChange={(v) => onChange({ enabled: true, releaseMs: v })}
        />
        <RotaryKnob
          label="メイクアップ"
          value={comp.makeupDb}
          min={-6}
          max={18}
          defaultValue={3}
          step={0.5}
          bipolar
          color="#34d399"
          format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}dB`}
          onChange={(v) => onChange({ enabled: true, makeupDb: v })}
        />
        <RotaryKnob
          label="ディエッサー"
          value={Math.round(comp.deEsserAmount * 100)}
          min={0}
          max={100}
          defaultValue={35}
          step={1}
          color="#fb7185"
          format={(v) => `${Math.round(v)}%`}
          onChange={(v) => onChange({ enabled: true, deEsserAmount: v / 100 })}
        />
      </div>
    </div>
  );
};
