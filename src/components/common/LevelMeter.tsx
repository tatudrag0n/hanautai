import React, { useEffect, useRef } from "react";
import { audioEngine, gainToDb } from "../../audio/audioEngine";

interface LevelMeterProps {
  meterId: string;
  width?: number;
  minHeight?: number;
}

function dbToMeterFrac(db: number): number {
  const clamped = Math.max(-60, Math.min(3, db));
  return (clamped + 60) / 63;
}

export const LevelMeter: React.FC<LevelMeterProps> = ({
  meterId,
  width = 16,
  minHeight = 96,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let rafId = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        const height = Math.max(60, canvas.clientHeight || minHeight);
        if (ctx) {
          const levels = audioEngine.sampleMeter(meterId);
          const dpr = window.devicePixelRatio || 1;
          const targetW = width * dpr;
          const targetH = height * dpr;
          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
          }
          ctx.save();
          ctx.scale(dpr, dpr);

          ctx.fillStyle = "#0b0e14";
          ctx.fillRect(0, 0, width, height);

          const clipH = 6;
          const meterTop = clipH + 2;
          const meterH = height - meterTop;
          const barW = Math.max(3, (width - 3) / 2);

          // Clip LED
          ctx.fillStyle = levels.clipped ? "#ef4444" : "#1f2533";
          ctx.fillRect(0, 0, width, clipH);

          const drawBar = (x: number, peak: number, rms: number) => {
            const peakDb = gainToDb(peak);
            const rmsDb = gainToDb(rms);
            const peakFrac = dbToMeterFrac(peakDb);
            const rmsFrac = dbToMeterFrac(rmsDb);

            const grad = ctx.createLinearGradient(0, height, 0, meterTop);
            grad.addColorStop(0, "#10b981");
            grad.addColorStop(0.72, "#22c55e");
            grad.addColorStop(0.88, "#eab308");
            grad.addColorStop(1, "#ef4444");

            const rmsH = rmsFrac * meterH;
            ctx.fillStyle = grad;
            ctx.globalAlpha = 0.85;
            ctx.fillRect(x, height - rmsH, barW, rmsH);

            if (peakFrac > 0.02) {
              const py = height - peakFrac * meterH;
              ctx.globalAlpha = 1;
              ctx.fillStyle = peakDb >= -1 ? "#ef4444" : "#f8fafc";
              ctx.fillRect(x, py, barW, 2);
            }
            ctx.globalAlpha = 1;
          };

          drawBar(1, levels.peakL, levels.rmsL);
          drawBar(width - barW - 1, levels.peakR, levels.rmsR);

          ctx.fillStyle = "rgba(11,14,20,0.45)";
          for (let y = meterTop + 6; y < height; y += 6) {
            ctx.fillRect(0, y, width, 1);
          }

          ctx.restore();
        }
      }
      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [meterId, minHeight, width]);

  return (
    <canvas
      ref={canvasRef}
      className="level-meter"
      style={{ width, minHeight, height: "100%" }}
      onClick={() => audioEngine.clearClip(meterId)}
      title="クリックでCLIP表示リセット"
    />
  );
};
