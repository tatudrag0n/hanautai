import React, { useState } from "react";
import { Mic, Sliders, Trash2, Waves } from "lucide-react";
import type { ActiveFxFocus } from "../../store/useStudioStore";
import type { FxModuleId, Track } from "../../types/studio";
import { ChannelFader } from "../common/ChannelFader";
import { LevelMeter } from "../common/LevelMeter";
import { RotaryKnob } from "../common/RotaryKnob";

interface ChannelStripProps {
  track: Track;
  selected: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onUpdateTrack: (updater: (t: Track) => Track, rec?: boolean) => void;
  onDelete: () => void;
  onOpenPitch: () => void;
  onOpenFxModule: (mod: ActiveFxFocus) => void;
}

const FX_SHORT: Record<FxModuleId, { label: string; color: string }> = {
  eq: { label: "EQ", color: "#38bdf8" },
  comp: { label: "CMP", color: "#f59e0b" },
  sat: { label: "SAT", color: "#fb7185" },
  mod: { label: "MOD", color: "#c084fc" },
};

export const ChannelStrip: React.FC<ChannelStripProps> = ({
  track,
  selected,
  canDelete,
  onSelect,
  onUpdateTrack,
  onDelete,
  onOpenPitch,
  onOpenFxModule,
}) => {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(track.name);

  const commitName = () => {
    setEditingName(false);
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== track.name) {
      onUpdateTrack((t) => ({ ...t, name: trimmed }), true);
    }
  };

  return (
    <div
      className={`channel-strip ${selected ? "selected" : ""} ${track.mute ? "muted" : ""}`}
      onClick={onSelect}
    >
      <div className="strip-color-bar" style={{ background: track.color }} />

      {/* Header */}
      <div className="strip-head">
        {editingName ? (
          <input
            className="strip-name-input"
            value={draftName}
            autoFocus
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") setEditingName(false);
            }}
          />
        ) : (
          <span
            className="strip-name"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setDraftName(track.name);
              setEditingName(true);
            }}
            title="ダブルクリックでトラック名を変更"
          >
            {track.name}
          </span>
        )}
        {canDelete && (
          <button
            type="button"
            className="strip-del-btn"
            title="トラック削除"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`トラック「${track.name}」を削除しますか？`)) {
                onDelete();
              }
            }}
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>

      {/* Pitch Quick Pill */}
      <button
        type="button"
        className={`strip-pitch-pill ${track.pitch.enabled && !track.pitch.bypass ? "on" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
          onOpenPitch();
        }}
        title="クリックでピッチ補正画面を開く"
      >
        <Waves size={11} />
        <span>
          {track.pitch.enabled && !track.pitch.bypass ? "PITCH ON" : "PITCH"}
        </span>
      </button>

      {/* Insert FX Pills (click to edit, right-click/Alt+click to toggle) */}
      <div className="strip-fx-pills" onClick={(e) => e.stopPropagation()}>
        {track.fx.order.map((id) => {
          const meta = FX_SHORT[id];
          const on = track.fx[id].enabled;
          return (
            <button
              key={id}
              type="button"
              className={`fx-mini-pill ${on ? "on" : ""}`}
              style={{
                borderColor: on ? meta.color : undefined,
                color: on ? meta.color : undefined,
              }}
              onClick={(e) => {
                if (e.altKey) {
                  onUpdateTrack(
                    (t) => ({
                      ...t,
                      fx: {
                        ...t.fx,
                        [id]: { ...t.fx[id], enabled: !t.fx[id].enabled },
                      },
                    }),
                    true,
                  );
                } else {
                  onSelect();
                  onOpenFxModule(id);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                onUpdateTrack(
                  (t) => ({
                    ...t,
                    fx: {
                      ...t.fx,
                      [id]: { ...t.fx[id], enabled: !t.fx[id].enabled },
                    },
                  }),
                  true,
                );
              }}
              title={`${meta.label} クリック:編集 / 右クリック:ON・OFF`}
            >
              {meta.label}
            </button>
          );
        })}
      </div>

      {/* Sends A/B */}
      <div className="strip-sends-row" onClick={(e) => e.stopPropagation()}>
        <RotaryKnob
          label="REV"
          value={Math.round(track.sendReverb * 100)}
          min={0}
          max={100}
          defaultValue={20}
          step={1}
          size={32}
          color="#38bdf8"
          format={(v) => `${Math.round(v)}`}
          onChange={(v) => onUpdateTrack((t) => ({ ...t, sendReverb: v / 100 }))}
        />
        <RotaryKnob
          label="DLY"
          value={Math.round(track.sendDelay * 100)}
          min={0}
          max={100}
          defaultValue={10}
          step={1}
          size={32}
          color="#2dd4bf"
          format={(v) => `${Math.round(v)}`}
          onChange={(v) => onUpdateTrack((t) => ({ ...t, sendDelay: v / 100 }))}
        />
      </div>

      {/* Trim + Phase + Pan Compact Row */}
      <div className="strip-trim-row" onClick={(e) => e.stopPropagation()}>
        <div className="trim-phase-mini">
          <RotaryKnob
            label="GAIN"
            value={track.trimDb}
            min={-18}
            max={18}
            defaultValue={0}
            step={0.5}
            size={30}
            bipolar
            color="#94a3b8"
            format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}`}
            onChange={(v) => onUpdateTrack((t) => ({ ...t, trimDb: v }))}
          />
          <button
            type="button"
            className={`phase-btn ${track.phaseInvert ? "active" : ""}`}
            title="位相反転 (Ø)"
            onClick={() =>
              onUpdateTrack((t) => ({ ...t, phaseInvert: !t.phaseInvert }), true)
            }
          >
            Ø
          </button>
        </div>

        <RotaryKnob
          label="PAN"
          value={Math.round(track.pan * 50)}
          min={-50}
          max={50}
          defaultValue={0}
          step={1}
          size={34}
          bipolar
          color={track.color}
          format={(v) =>
            v === 0 ? "C" : v < 0 ? `L${Math.abs(Math.round(v))}` : `R${Math.round(v)}`
          }
          onChange={(v) => onUpdateTrack((t) => ({ ...t, pan: v / 50 }))}
        />
      </div>

      {/* M / S / R */}
      <div className="strip-msr-row" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={`msr-btn mute ${track.mute ? "active" : ""}`}
          onClick={() => onUpdateTrack((t) => ({ ...t, mute: !t.mute }), true)}
          title="ミュート (M)"
        >
          M
        </button>
        <button
          type="button"
          className={`msr-btn solo ${track.solo ? "active" : ""}`}
          onClick={() => onUpdateTrack((t) => ({ ...t, solo: !t.solo }), true)}
          title="ソロ (S)"
        >
          S
        </button>
        <button
          type="button"
          className={`msr-btn arm ${track.armed ? "active" : ""}`}
          onClick={() => onUpdateTrack((t) => ({ ...t, armed: !t.armed }), false)}
          title="録音対象トラックに設定"
        >
          <Mic size={10} />
        </button>
      </div>

      {/* Responsive Fader + Level Meter */}
      <div className="strip-fader-area" onClick={(e) => e.stopPropagation()}>
        <ChannelFader
          valueDb={track.volumeDb}
          color={track.color}
          minHeight={96}
          onChange={(db) => onUpdateTrack((t) => ({ ...t, volumeDb: db }))}
        />
        <LevelMeter meterId={track.id} width={14} minHeight={96} />
      </div>

      <div className="strip-db-readout">
        {track.volumeDb <= -59.5
          ? "-∞ dB"
          : `${track.volumeDb > 0 ? "+" : ""}${track.volumeDb.toFixed(1)} dB`}
      </div>

      <button
        type="button"
        className="strip-open-fx-btn"
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
          onOpenFxModule("eq");
        }}
      >
        <Sliders size={10} /> FX編集
      </button>
    </div>
  );
};
