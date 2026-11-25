import React, { useEffect, useRef } from "react";
import { Sliders } from "lucide-react";
import { audioEngine, gainToDb } from "../../audio/audioEngine";
import type { MasterSettings } from "../../types/studio";
import { ChannelFader } from "../common/ChannelFader";
import { LevelMeter } from "../common/LevelMeter";
import { RotaryKnob } from "../common/RotaryKnob";

interface MasterStripProps {
  master: MasterSettings;
  onUpdateMaster: (patch: Partial<MasterSettings>) => void;
  onOpenMasterRack: () => void;
}

export const MasterStrip: React.FC<MasterStripProps> = ({
  master,
  onUpdateMaster,
  onOpenMasterRack,
}) => {
  const specCanvasRef = useRef<HTMLCanvasElement>(null);
  const peakTextRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let rafId = 0;
    const render = () => {
      const meters = audioEngine.sampleMeter("master");
      if (peakTextRef.current) {
        const peakDb = gainToDb(Math.max(meters.peakL, meters.peakR));
        peakTextRef.current.textContent =
          peakDb <= -59 ? "-∞" : `${peakDb.toFixed(1)} dBFS`;
      }

      const canvas = specCanvasRef.current;
      if (canvas) {
        const w = canvas.clientWidth || 140;
        const h = canvas.clientHeight || 48;
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
          canvas.width = w * dpr;
          canvas.height = h * dpr;
        }
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);
          ctx.fillStyle = "#080b12";
          ctx.fillRect(0, 0, w, h);

          const spec = audioEngine.getSpectrumData("master");
          if (spec && audioEngine.getIsPlaying()) {
            const bars = 28;
            const barW = w / bars;
            for (let b = 0; b < bars; b++) {
              const frac = b / (bars - 1);
              const bin = Math.min(
                spec.length - 1,
                Math.max(1, Math.round(Math.pow(frac, 2.2) * (spec.length * 0.65))),
              );
              const norm = Math.max(0, Math.min(1, (spec[bin] + 95) / 85));
              const bh = norm * (h - 4);
              ctx.fillStyle = norm > 0.85 ? "#fb7185" : "#facc15";
              ctx.fillRect(b * barW + 1, h - bh, Math.max(1.5, barW - 2), bh);
            }
          } else {
            ctx.fillStyle = "#334155";
            ctx.fillRect(0, h - 2, w, 1);
          }
          ctx.restore();
        }
      }
      rafId = requestAnimationFrame(render);
    };
    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className="master-strip">
      <div className="strip-color-bar" style={{ background: "#facc15" }} />
      <div className="master-head">
        <span>MASTER BUS</span>
        <span ref={peakTextRef} className="master-peak-tag">
          -∞
        </span>
      </div>

      <canvas ref={specCanvasRef} className="master-mini-spec" />

      <div className="master-controls-row">
        <button
          type="button"
          className={`msr-btn mono ${master.mono ? "active" : ""}`}
          onClick={() => onUpdateMaster({ mono: !master.mono })}
          title="モノラル互換性チェック"
        >
          MONO
        </button>
        <RotaryKnob
          label="WIDTH"
          value={Math.round(master.width * 100)}
          min={0}
          max={160}
          defaultValue={105}
          step={2}
          size={36}
          color="#34d399"
          format={(v) => `${Math.round(v)}%`}
          onChange={(v) => onUpdateMaster({ width: v / 100 })}
        />
      </div>

      <div className="master-badges">
        <span className={`mbadge ${master.glueEnabled ? "on" : ""}`}>GLUE</span>
        <span className={`mbadge ${master.limiterEnabled ? "on" : ""}`}>
          LIMIT {master.limiterCeilingDb.toFixed(1)}
        </span>
      </div>

      <div className="strip-fader-area">
        <ChannelFader
          valueDb={master.volumeDb}
          color="#facc15"
          minHeight={108}
          onChange={(db) => onUpdateMaster({ volumeDb: db })}
        />
        <LevelMeter meterId="master" width={20} minHeight={108} />
      </div>

      <div className="strip-db-readout master">
        {master.volumeDb <= -59.5
          ? "-∞ dB"
          : `${master.volumeDb > 0 ? "+" : ""}${master.volumeDb.toFixed(1)} dB`}
      </div>

      <button
        type="button"
        className="strip-open-fx-btn"
        onClick={onOpenMasterRack}
      >
        <Sliders size={10} /> マスタリング
      </button>
    </div>
  );
};
