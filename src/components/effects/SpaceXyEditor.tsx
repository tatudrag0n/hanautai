import React, { useRef } from "react";
import type { DelaySync, ReverbType, SpaceBusSettings } from "../../types/studio";
import { RotaryKnob } from "../common/RotaryKnob";

interface SpaceXyEditorProps {
  trackName: string;
  sendReverb: number;
  sendDelay: number;
  spaceBus: SpaceBusSettings;
  onChangeTrackSends: (rev: number, dly: number) => void;
  onChangeSpaceBus: (patch: Partial<SpaceBusSettings>) => void;
}

const REVERB_TYPES: Array<{ id: ReverbType; label: string }> = [
  { id: "plate", label: "Plate (艶ボーカル)" },
  { id: "hall", label: "Hall (大ホール)" },
  { id: "room", label: "Room (自然部屋鳴り)" },
  { id: "booth", label: "Booth (タイト)" },
  { id: "cathedral", label: "Cathedral (幻想的)" },
];

const DELAY_SYNCS: DelaySync[] = ["1/4", "1/8", "1/8D", "1/16", "free"];

export const SpaceXyEditor: React.FC<SpaceXyEditorProps> = ({
  trackName,
  sendReverb,
  sendDelay,
  spaceBus,
  onChangeTrackSends,
  onChangeSpaceBus,
}) => {
  const padRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const updateFromPointer = (clientX: number, clientY: number) => {
    const pad = padRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
    onChangeTrackSends(Math.round(y * 100) / 100, Math.round(x * 100) / 100);
  };

  return (
    <div className="space-editor-layout">
      {/* Left: Intuitive 2D XY Pad for This Track */}
      <div className="xy-pad-column">
        <div className="xy-header">
          <span>「{trackName}」空間バランス XYパッド</span>
          <small>
            Rev {Math.round(sendReverb * 100)}% / Dly {Math.round(sendDelay * 100)}%
          </small>
        </div>
        <div className="xy-quick-presets">
          <button
            type="button"
            className="mini-btn"
            onClick={() => {
              onChangeTrackSends(0.28, 0.16);
              onChangeSpaceBus({ reverbType: "plate", reverbDecay: 1.65, delaySync: "1/8", delayPingPong: true });
            }}
          >
            歌ってみた定番
          </button>
          <button
            type="button"
            className="mini-btn"
            onClick={() => {
              onChangeTrackSends(0.48, 0.25);
              onChangeSpaceBus({ reverbType: "hall", reverbDecay: 2.8, delaySync: "1/4", delayPingPong: true });
            }}
          >
            広めバラード
          </button>
          <button
            type="button"
            className="mini-btn"
            onClick={() => {
              onChangeTrackSends(0.16, 0.04);
              onChangeSpaceBus({ reverbType: "room", reverbDecay: 0.9 });
            }}
          >
            自然Room
          </button>
          <button
            type="button"
            className="mini-btn"
            onClick={() => onChangeTrackSends(0, 0)}
          >
            ドライ
          </button>
        </div>
        <div
          ref={padRef}
          className="xy-pad"
          onPointerDown={(e) => {
            draggingRef.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            updateFromPointer(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (draggingRef.current) updateFromPointer(e.clientX, e.clientY);
          }}
          onPointerUp={(e) => {
            draggingRef.current = false;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          title="上下でリバーブ深さ、左右でディレイ量を直感操作"
        >
          <div className="xy-axis-x" />
          <div className="xy-axis-y" />
          <span className="xy-tag top">REVERB MAX</span>
          <span className="xy-tag bottom">DRY</span>
          <span className="xy-tag right">DELAY MAX</span>
          <div
            className="xy-puck"
            style={{
              left: `${sendDelay * 100}%`,
              top: `${(1 - sendReverb) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Right: Studio Send A (Reverb) & Send B (Delay) Bus Parameters */}
      <div className="space-bus-controls">
        <div className="bus-group">
          <div className="bus-group-head">
            <span>Send A — スタジオリバーブ</span>
            <select
              value={spaceBus.reverbType}
              onChange={(e) =>
                onChangeSpaceBus({ reverbType: e.target.value as ReverbType })
              }
            >
              {REVERB_TYPES.map((rt) => (
                <option key={rt.id} value={rt.id}>
                  {rt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="bus-knobs">
            <RotaryKnob
              label="残響時間"
              value={spaceBus.reverbDecay}
              min={0.4}
              max={5.0}
              defaultValue={1.75}
              step={0.05}
              color="#38bdf8"
              format={(v) => `${v.toFixed(2)}s`}
              onChange={(v) => onChangeSpaceBus({ reverbDecay: v })}
            />
            <RotaryKnob
              label="Pre-Delay"
              value={spaceBus.reverbPreDelayMs}
              min={0}
              max={80}
              defaultValue={18}
              step={1}
              color="#38bdf8"
              format={(v) => `${Math.round(v)}ms`}
              onChange={(v) => onChangeSpaceBus({ reverbPreDelayMs: v })}
            />
            <RotaryKnob
              label="高域減衰"
              value={spaceBus.reverbDamping}
              min={1500}
              max={14000}
              defaultValue={6800}
              step={100}
              color="#38bdf8"
              format={(v) => `${(v / 1000).toFixed(1)}k`}
              onChange={(v) => onChangeSpaceBus({ reverbDamping: v })}
            />
          </div>
        </div>

        <div className="bus-group">
          <div className="bus-group-head">
            <span>Send B — テンポ同期ディレイ</span>
            <div className="sync-row">
              {DELAY_SYNCS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`mini-btn ${spaceBus.delaySync === s ? "active" : ""}`}
                  onClick={() => onChangeSpaceBus({ delaySync: s })}
                >
                  {s === "free" ? "ms" : s}
                </button>
              ))}
              <button
                type="button"
                className={`mini-btn ${spaceBus.delayPingPong ? "active" : ""}`}
                onClick={() =>
                  onChangeSpaceBus({ delayPingPong: !spaceBus.delayPingPong })
                }
              >
                Ping-Pong
              </button>
            </div>
          </div>
          <div className="bus-knobs">
            <RotaryKnob
              label="ディレイ長"
              value={spaceBus.delayTimeMs}
              min={40}
              max={900}
              defaultValue={250}
              step={5}
              color="#2dd4bf"
              format={(v) => `${Math.round(v)}ms`}
              onChange={(v) =>
                onChangeSpaceBus({ delaySync: "free", delayTimeMs: v })
              }
            />
            <RotaryKnob
              label="フィードバック"
              value={Math.round(spaceBus.delayFeedback * 100)}
              min={0}
              max={82}
              defaultValue={34}
              step={1}
              color="#2dd4bf"
              format={(v) => `${Math.round(v)}%`}
              onChange={(v) => onChangeSpaceBus({ delayFeedback: v / 100 })}
            />
            <RotaryKnob
              label="ローパス馴染み"
              value={spaceBus.delayHighCut}
              min={1200}
              max={12000}
              defaultValue={4200}
              step={100}
              color="#2dd4bf"
              format={(v) => `${(v / 1000).toFixed(1)}k`}
              onChange={(v) => onChangeSpaceBus({ delayHighCut: v })}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
