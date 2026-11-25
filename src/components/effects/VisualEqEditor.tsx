import React, { useEffect, useRef, useState } from "react";
import { audioEngine } from "../../audio/audioEngine";
import { computeEqCurveDb } from "../../dsp/biquadResponse";
import type { EqSettings } from "../../types/studio";
import { RotaryKnob } from "../common/RotaryKnob";

interface VisualEqEditorProps {
  trackId: string;
  eq: EqSettings;
  onChange: (patch: Partial<EqSettings>) => void;
}

const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const DB_RANGE = 18; // -18..+18 dB

function freqToNorm(f: number): number {
  const clamped = Math.max(MIN_FREQ, Math.min(MAX_FREQ, f));
  return Math.log10(clamped / MIN_FREQ) / Math.log10(MAX_FREQ / MIN_FREQ);
}

function normToFreq(n: number): number {
  const clamped = Math.max(0, Math.min(1, n));
  return MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, clamped);
}

type BandId = "hpf" | "low" | "mid" | "high";

export const VisualEqEditor: React.FC<VisualEqEditorProps> = ({
  trackId,
  eq,
  onChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeBand, setActiveBand] = useState<BandId | null>(null);
  const dragBandRef = useRef<BandId | null>(null);

  const getBandHandles = (w: number, h: number) => {
    const dbToY = (db: number) => h * 0.5 - (db / DB_RANGE) * (h * 0.44);
    const freqToX = (f: number) => freqToNorm(f) * w;
    return [
      {
        id: "hpf" as BandId,
        label: "HPF",
        x: freqToX(eq.hpfFreq),
        y: eq.hpfEnabled ? dbToY(0) : h - 18,
        color: "#fb7185",
      },
      {
        id: "low" as BandId,
        label: "LOW",
        x: freqToX(eq.lowFreq),
        y: dbToY(eq.lowGain),
        color: "#fbbf24",
      },
      {
        id: "mid" as BandId,
        label: "MID",
        x: freqToX(eq.midFreq),
        y: dbToY(eq.midGain),
        color: "#38bdf8",
      },
      {
        id: "high" as BandId,
        label: "AIR",
        x: freqToX(eq.highFreq),
        y: dbToY(eq.highGain),
        color: "#c084fc",
      },
    ];
  };

  useEffect(() => {
    let rafId = 0;

    const render = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const w = canvas.clientWidth || 580;
        const h = canvas.clientHeight || 220;
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
          canvas.width = w * dpr;
          canvas.height = h * dpr;
        }
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);

          // Background
          ctx.fillStyle = "#0a0d14";
          ctx.fillRect(0, 0, w, h);

          const dbToY = (db: number) => h * 0.5 - (db / DB_RANGE) * (h * 0.44);

          // Frequency grid
          const gridFreqs = [30, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 16000];
          ctx.strokeStyle = "rgba(148, 163, 184, 0.1)";
          ctx.lineWidth = 1;
          ctx.fillStyle = "#475569";
          ctx.font = "600 9px ui-monospace, monospace";
          for (const gf of gridFreqs) {
            const gx = freqToNorm(gf) * w;
            ctx.beginPath();
            ctx.moveTo(gx, 0);
            ctx.lineTo(gx, h);
            ctx.stroke();
            const lbl = gf >= 1000 ? `${gf / 1000}k` : `${gf}`;
            ctx.fillText(lbl, gx + 3, h - 5);
          }

          // dB horizontal lines
          for (const db of [-12, -6, 0, 6, 12]) {
            const gy = dbToY(db);
            ctx.strokeStyle =
              db === 0 ? "rgba(148, 163, 184, 0.28)" : "rgba(148, 163, 184, 0.08)";
            ctx.beginPath();
            ctx.moveTo(0, gy);
            ctx.lineTo(w, gy);
            ctx.stroke();
            if (db !== 0) {
              ctx.fillText(`${db > 0 ? "+" : ""}${db}`, 4, gy - 3);
            }
          }

          // Live FFT Spectrum Analyzer
          const spec = audioEngine.getSpectrumData(trackId);
          const sr = audioEngine.getSampleRate();
          if (spec && audioEngine.getIsPlaying()) {
            const binHz = sr / (spec.length * 2);
            ctx.beginPath();
            ctx.moveTo(0, h);
            for (let px = 0; px <= w; px += 2) {
              const f = normToFreq(px / w);
              const bin = Math.min(spec.length - 1, Math.max(1, Math.round(f / binHz)));
              const dbVal = Math.max(-100, Math.min(-5, spec[bin]));
              const normMag = (dbVal + 100) / 95;
              const sy = h - normMag * h * 0.92;
              ctx.lineTo(px, sy);
            }
            ctx.lineTo(w, h);
            ctx.closePath();
            const specGrad = ctx.createLinearGradient(0, 0, 0, h);
            specGrad.addColorStop(0, "rgba(56, 189, 248, 0.28)");
            specGrad.addColorStop(1, "rgba(56, 189, 248, 0.02)");
            ctx.fillStyle = specGrad;
            ctx.fill();
          }

          // Analytical EQ Frequency Response Curve
          const sampleFreqs: number[] = [];
          const xs: number[] = [];
          for (let px = 0; px <= w; px += 3) {
            xs.push(px);
            sampleFreqs.push(normToFreq(px / w));
          }
          const curveDb = computeEqCurveDb(eq, sampleFreqs, sr);

          ctx.beginPath();
          ctx.moveTo(xs[0], dbToY(0));
          for (let i = 0; i < xs.length; i++) {
            ctx.lineTo(xs[i], dbToY(curveDb[i]));
          }
          ctx.lineTo(xs[xs.length - 1], dbToY(0));
          ctx.closePath();
          ctx.fillStyle = eq.enabled
            ? "rgba(56, 189, 248, 0.14)"
            : "rgba(148, 163, 184, 0.06)";
          ctx.fill();

          ctx.beginPath();
          for (let i = 0; i < xs.length; i++) {
            const cy = dbToY(curveDb[i]);
            if (i === 0) ctx.moveTo(xs[i], cy);
            else ctx.lineTo(xs[i], cy);
          }
          ctx.strokeStyle = eq.enabled ? "#38bdf8" : "#64748b";
          ctx.lineWidth = 2.4;
          ctx.stroke();

          // Draggable Band Handles
          const handles = getBandHandles(w, h);
          for (const hd of handles) {
            const isSel = activeBand === hd.id;
            ctx.fillStyle = eq.enabled ? hd.color : "#475569";
            ctx.strokeStyle = isSel ? "#ffffff" : "#0a0d14";
            ctx.lineWidth = isSel ? 2.5 : 1.5;
            ctx.beginPath();
            ctx.arc(hd.x, hd.y, isSel ? 8 : 6.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "#e2e8f0";
            ctx.font = "700 9px system-ui, sans-serif";
            ctx.fillText(hd.label, hd.x - 10, hd.y - 10);
          }

          // Floating Readout Badge for Active/Dragging Band
          if (activeBand) {
            const fmtFreq = (f: number) =>
              f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${Math.round(f)} Hz`;
            let badgeText = "";
            if (activeBand === "hpf") {
              badgeText = `HPF ${eq.hpfEnabled ? fmtFreq(eq.hpfFreq) : "OFF"}`;
            } else if (activeBand === "low") {
              badgeText = `LOW ${fmtFreq(eq.lowFreq)} | ${eq.lowGain > 0 ? "+" : ""}${eq.lowGain.toFixed(1)} dB`;
            } else if (activeBand === "mid") {
              badgeText = `MID ${fmtFreq(eq.midFreq)} | ${eq.midGain > 0 ? "+" : ""}${eq.midGain.toFixed(1)} dB | Q ${eq.midQ.toFixed(1)}`;
            } else if (activeBand === "high") {
              badgeText = `AIR ${fmtFreq(eq.highFreq)} | ${eq.highGain > 0 ? "+" : ""}${eq.highGain.toFixed(1)} dB`;
            }
            if (badgeText) {
              ctx.fillStyle = "rgba(15, 19, 28, 0.9)";
              ctx.strokeStyle = "#38bdf8";
              ctx.lineWidth = 1;
              const tw = ctx.measureText(badgeText).width + 16;
              ctx.beginPath();
              ctx.roundRect(10, 10, tw, 22, 5);
              ctx.fill();
              ctx.stroke();
              ctx.fillStyle = "#e0f2fe";
              ctx.font = "700 10.5px ui-monospace, monospace";
              ctx.fillText(badgeText, 18, 25);
            }
          }

          ctx.restore();
        }
      }
      rafId = requestAnimationFrame(render);
    };
    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [activeBand, eq, trackId]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const handles = getBandHandles(rect.width, rect.height);

    let closest: BandId = "mid";
    let minDist = Infinity;
    for (const hd of handles) {
      const d = Math.hypot(hd.x - x, hd.y - y);
      if (d < minDist) {
        minDist = d;
        closest = hd.id;
      }
    }
    dragBandRef.current = closest;
    setActiveBand(closest);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (!eq.enabled) onChange({ enabled: true });
    if (closest === "hpf" && !eq.hpfEnabled) onChange({ hpfEnabled: true });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const band = dragBandRef.current;
    const canvas = canvasRef.current;
    if (!band || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    const freq = Math.round(normToFreq(x / rect.width));
    const db = Math.max(
      -15,
      Math.min(15, Math.round(((rect.height * 0.5 - y) / (rect.height * 0.44)) * DB_RANGE * 2) / 2),
    );

    if (band === "hpf") {
      onChange({ hpfEnabled: true, hpfFreq: Math.max(20, Math.min(400, freq)) });
    } else if (band === "low") {
      onChange({ lowFreq: Math.max(40, Math.min(500, freq)), lowGain: db });
    } else if (band === "mid") {
      onChange({ midFreq: Math.max(200, Math.min(6000, freq)), midGain: db });
    } else if (band === "high") {
      onChange({ highFreq: Math.max(2000, Math.min(16000, freq)), highGain: db });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragBandRef.current) return;
    dragBandRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const nextQ = Math.max(0.3, Math.min(10, eq.midQ + (e.deltaY < 0 ? 0.25 : -0.25)));
    onChange({ midQ: Math.round(nextQ * 10) / 10 });
  };

  return (
    <div className="fx-editor-grid">
      <div className="eq-canvas-wrap">
        <div className="eq-overlay-presets">
          <button
            type="button"
            className={`mini-btn ${eq.hpfEnabled ? "active" : ""}`}
            onClick={() => onChange({ hpfEnabled: !eq.hpfEnabled })}
          >
            ローカット {eq.hpfEnabled ? `${eq.hpfFreq}Hz` : "OFF"}
          </button>
          <button
            type="button"
            className="mini-btn"
            onClick={() =>
              onChange({
                enabled: true,
                hpfEnabled: true,
                hpfFreq: 95,
                lowGain: -2,
                midFreq: 2800,
                midGain: 3.5,
                midQ: 1.2,
                highFreq: 9500,
                highGain: 3.5,
              })
            }
          >
            ボーカル抜け
          </button>
          <button
            type="button"
            className="mini-btn"
            onClick={() =>
              onChange({
                enabled: true,
                hpfEnabled: true,
                hpfFreq: 80,
                lowGain: 2.5,
                midFreq: 600,
                midGain: -1.5,
                midQ: 1.0,
                highFreq: 7500,
                highGain: 1.0,
              })
            }
          >
            温かみ
          </button>
          <button
            type="button"
            className="mini-btn"
            onClick={() =>
              onChange({ lowGain: 0, midGain: 0, highGain: 0, hpfEnabled: false })
            }
          >
            フラット
          </button>
        </div>
        <canvas
          ref={canvasRef}
          className="eq-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
          title="各バンドの丸ポイントを直接ドラッグしてEQカーブを操作 (ホイールでMIDのQ幅調整)"
        />
      </div>

      <div className="fx-knobs-bar">
        <RotaryKnob
          label="ローカット"
          value={eq.hpfFreq}
          min={20}
          max={400}
          defaultValue={95}
          step={1}
          color="#fb7185"
          format={(v) => `${Math.round(v)}Hz`}
          onChange={(v) => onChange({ hpfEnabled: true, hpfFreq: v })}
        />
        <RotaryKnob
          label="LOW ゲイン"
          value={eq.lowGain}
          min={-15}
          max={15}
          defaultValue={0}
          step={0.5}
          bipolar
          color="#fbbf24"
          format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}dB`}
          onChange={(v) => onChange({ enabled: true, lowGain: v })}
        />
        <RotaryKnob
          label="MID 周波数"
          value={eq.midFreq}
          min={200}
          max={6000}
          defaultValue={2500}
          step={10}
          color="#38bdf8"
          format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}Hz`)}
          onChange={(v) => onChange({ enabled: true, midFreq: v })}
        />
        <RotaryKnob
          label="MID ゲイン"
          value={eq.midGain}
          min={-15}
          max={15}
          defaultValue={0}
          step={0.5}
          bipolar
          color="#38bdf8"
          format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}dB`}
          onChange={(v) => onChange({ enabled: true, midGain: v })}
        />
        <RotaryKnob
          label="MID Q幅"
          value={eq.midQ}
          min={0.3}
          max={10}
          defaultValue={1.2}
          step={0.1}
          color="#38bdf8"
          format={(v) => `Q ${v.toFixed(1)}`}
          onChange={(v) => onChange({ enabled: true, midQ: v })}
        />
        <RotaryKnob
          label="AIR / HIGH"
          value={eq.highGain}
          min={-15}
          max={15}
          defaultValue={0}
          step={0.5}
          bipolar
          color="#c084fc"
          format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}dB`}
          onChange={(v) => onChange({ enabled: true, highGain: v })}
        />
      </div>
    </div>
  );
};
