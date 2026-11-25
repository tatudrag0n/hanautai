import React from "react";
import { ArrowLeft, ArrowRight, Power, RotateCcw, Sparkles } from "lucide-react";
import { CHANNEL_FX_PRESETS, defaultTrackFx } from "../../audio/presets";
import type { ActiveFxFocus } from "../../store/useStudioStore";
import type {
  FxModuleId,
  MasterSettings,
  SpaceBusSettings,
  Track,
  TrackFxSettings,
} from "../../types/studio";
import { RotaryKnob } from "../common/RotaryKnob";
import { CompressorEditor } from "./CompressorEditor";
import { ModulationEditor } from "./ModulationEditor";
import { SaturationEditor } from "./SaturationEditor";
import { SpaceXyEditor } from "./SpaceXyEditor";
import { VisualEqEditor } from "./VisualEqEditor";

interface EffectsRackViewProps {
  track: Track;
  spaceBus: SpaceBusSettings;
  master: MasterSettings;
  activeModule: ActiveFxFocus;
  onSelectModule: (m: ActiveFxFocus) => void;
  onUpdateTrackFx: (updater: (fx: TrackFxSettings) => TrackFxSettings, rec?: boolean) => void;
  onUpdateTrackSends: (rev: number, dly: number) => void;
  onUpdateSpaceBus: (patch: Partial<SpaceBusSettings>) => void;
  onUpdateMaster: (patch: Partial<MasterSettings>) => void;
  onApplyPreset: (presetId: string) => void;
}

const MODULE_META: Record<
  ActiveFxFocus,
  { title: string; color: string; hint: string }
> = {
  eq: {
    title: "4-Band Visual EQ",
    color: "#38bdf8",
    hint: "スペクトラム上の丸ポイントをドラッグして周波数と音量を直感操作（ホイールでMIDのQ幅調整）",
  },
  comp: {
    title: "Dynamics Compressor & De-Esser",
    color: "#f59e0b",
    hint: "声の大小を均一に整えて聴きやすくします。迷ったら「ワンノブ簡単コンプ」をどうぞ",
  },
  sat: {
    title: "Analog Saturation & Exciter",
    color: "#fb7185",
    hint: "真空管やテープのような倍音・艶・太さを加えて存在感を出します",
  },
  mod: {
    title: "Stereo Doubler & Modulation",
    color: "#c084fc",
    hint: "声や楽器を左右に立体的に広げ、厚みやコーラス感を作ります",
  },
  space: {
    title: "Space XY Pad (Reverb & Delay)",
    color: "#2dd4bf",
    hint: "XYパッドの縦軸でリバーブの深さ、横軸でディレイの広がりを同時に調整できます",
  },
  master: {
    title: "Master Bus Mastering",
    color: "#facc15",
    hint: "曲全体の最終的な音色・まとまり・ステレオ幅・音割れ防止リミッターを整えます",
  },
};

export const EffectsRackView: React.FC<EffectsRackViewProps> = ({
  track,
  spaceBus,
  master,
  activeModule,
  onSelectModule,
  onUpdateTrackFx,
  onUpdateTrackSends,
  onUpdateSpaceBus,
  onUpdateMaster,
  onApplyPreset,
}) => {
  const fx = track.fx;

  const isEnabled = (id: FxModuleId) => fx[id].enabled;

  const toggleModule = (id: FxModuleId, e?: React.MouseEvent) => {
    e?.stopPropagation();
    onUpdateTrackFx(
      (cur) => ({
        ...cur,
        [id]: { ...cur[id], enabled: !cur[id].enabled },
      }),
      true,
    );
  };

  const resetActiveModule = () => {
    if (
      activeModule === "eq" ||
      activeModule === "comp" ||
      activeModule === "sat" ||
      activeModule === "mod"
    ) {
      const defaults = defaultTrackFx(track.role);
      onUpdateTrackFx(
        (cur) => ({
          ...cur,
          [activeModule]: defaults[activeModule],
        }),
        true,
      );
    }
  };

  const moveModule = (idx: number, dir: -1 | 1, e: React.MouseEvent) => {
    e.stopPropagation();
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= fx.order.length) return;
    onUpdateTrackFx((cur) => {
      const next = [...cur.order];
      const [item] = next.splice(idx, 1);
      next.splice(targetIdx, 0, item);
      return { ...cur, order: next };
    }, true);
  };

  const activeMeta = MODULE_META[activeModule];
  const isInsertMod =
    activeModule === "eq" ||
    activeModule === "comp" ||
    activeModule === "sat" ||
    activeModule === "mod";
  const activeInsertOn = isInsertMod ? fx[activeModule].enabled : true;

  return (
    <div className="effects-rack-view">
      {/* Signal Flow Chain & Presets */}
      <div className="fx-chain-header">
        <div className="fx-signal-chain">
          <span className="chain-badge">接続順</span>
          {fx.order.map((id, idx) => {
            const meta = MODULE_META[id];
            const on = isEnabled(id);
            const selected = activeModule === id;
            return (
              <React.Fragment key={id}>
                <div
                  className={`chain-node ${selected ? "selected" : ""} ${on ? "on" : "off"}`}
                  style={{ borderColor: selected ? meta.color : undefined }}
                  onClick={() => onSelectModule(id)}
                >
                  <button
                    type="button"
                    className={`power-dot ${on ? "on" : ""}`}
                    style={{ color: on ? meta.color : undefined }}
                    onClick={(e) => toggleModule(id, e)}
                    title="ON / OFF 切り替え"
                  >
                    <Power size={11} />
                  </button>
                  <span className="chain-node-title">{meta.title.split(" ")[0]}</span>
                  <div className="chain-reorder">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={(e) => moveModule(idx, -1, e)}
                      title="接続順を前へ"
                    >
                      <ArrowLeft size={10} />
                    </button>
                    <button
                      type="button"
                      disabled={idx === fx.order.length - 1}
                      onClick={(e) => moveModule(idx, 1, e)}
                      title="接続順を後へ"
                    >
                      <ArrowRight size={10} />
                    </button>
                  </div>
                </div>
                {idx < fx.order.length - 1 && <span className="chain-arrow">→</span>}
              </React.Fragment>
            );
          })}

          <span className="chain-arrow">→</span>
          <div
            className={`chain-node on ${activeModule === "space" ? "selected" : ""}`}
            style={{ borderColor: activeModule === "space" ? "#2dd4bf" : undefined }}
            onClick={() => onSelectModule("space")}
          >
            <span className="chain-node-title">空間 (Rev/Dly)</span>
          </div>

          <span className="chain-arrow">→</span>
          <div
            className={`chain-node on ${activeModule === "master" ? "selected" : ""}`}
            style={{ borderColor: activeModule === "master" ? "#facc15" : undefined }}
            onClick={() => onSelectModule("master")}
          >
            <span className="chain-node-title">Master</span>
          </div>
        </div>

        {/* One-Click Channel FX Presets */}
        <div className="fx-presets-bar">
          <Sparkles size={13} className="muted-icon" />
          <span className="presets-label">プリセット:</span>
          {CHANNEL_FX_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="preset-pill"
              title={p.desc}
              onClick={() => onApplyPreset(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Module Info + Prominent Power / Reset Bar */}
      <div className="fx-stage-subhead">
        <div className="stage-title-wrap">
          <span
            className="stage-dot"
            style={{ background: activeMeta.color }}
          />
          <strong>{activeMeta.title}</strong>
          <span className="stage-hint">{activeMeta.hint}</span>
        </div>
        {isInsertMod && (
          <div className="stage-actions">
            <button
              type="button"
              className={`stage-power-btn ${activeInsertOn ? "on" : "off"}`}
              style={{
                borderColor: activeInsertOn ? activeMeta.color : undefined,
                color: activeInsertOn ? activeMeta.color : undefined,
              }}
              onClick={() => toggleModule(activeModule)}
            >
              <Power size={12} />
              <span>{activeInsertOn ? "ON (有効)" : "BYPASS (無効)"}</span>
            </button>
            <button
              type="button"
              className="mini-btn"
              onClick={resetActiveModule}
              title="このエフェクトを初期値に戻す"
            >
              <RotateCcw size={11} /> 初期値
            </button>
          </div>
        )}
      </div>

      {/* Active Module Visual Editor */}
      <div className="fx-module-stage">
        {activeModule === "eq" && (
          <VisualEqEditor
            trackId={track.id}
            eq={fx.eq}
            onChange={(patch) =>
              onUpdateTrackFx((cur) => ({ ...cur, eq: { ...cur.eq, ...patch } }))
            }
          />
        )}
        {activeModule === "comp" && (
          <CompressorEditor
            trackId={track.id}
            comp={fx.comp}
            onChange={(patch) =>
              onUpdateTrackFx((cur) => ({ ...cur, comp: { ...cur.comp, ...patch } }))
            }
          />
        )}
        {activeModule === "sat" && (
          <SaturationEditor
            sat={fx.sat}
            onChange={(patch) =>
              onUpdateTrackFx((cur) => ({ ...cur, sat: { ...cur.sat, ...patch } }))
            }
          />
        )}
        {activeModule === "mod" && (
          <ModulationEditor
            mod={fx.mod}
            onChange={(patch) =>
              onUpdateTrackFx((cur) => ({ ...cur, mod: { ...cur.mod, ...patch } }))
            }
          />
        )}
        {activeModule === "space" && (
          <SpaceXyEditor
            trackName={track.name}
            sendReverb={track.sendReverb}
            sendDelay={track.sendDelay}
            spaceBus={spaceBus}
            onChangeTrackSends={onUpdateTrackSends}
            onChangeSpaceBus={onUpdateSpaceBus}
          />
        )}
        {activeModule === "master" && (
          <div className="master-rack-wrap">
            <div className="master-presets-row">
              <span className="presets-label">マスタリングプリセット:</span>
              <button
                type="button"
                className="preset-pill"
                onClick={() =>
                  onUpdateMaster({
                    eqLowDb: 0.6,
                    eqMidDb: 0.2,
                    eqHighDb: 1.2,
                    glueEnabled: true,
                    glueThreshold: -12,
                    glueRatio: 2.5,
                    width: 1.08,
                    limiterEnabled: true,
                    limiterCeilingDb: -0.3,
                  })
                }
              >
                配信向けポップ
              </button>
              <button
                type="button"
                className="preset-pill"
                onClick={() =>
                  onUpdateMaster({
                    eqLowDb: 1.4,
                    eqMidDb: -0.4,
                    eqHighDb: 0.3,
                    glueEnabled: true,
                    glueThreshold: -14,
                    glueRatio: 2.0,
                    width: 1.0,
                    limiterEnabled: true,
                    limiterCeilingDb: -0.5,
                  })
                }
              >
                温かみアナログ
              </button>
              <button
                type="button"
                className="preset-pill"
                onClick={() =>
                  onUpdateMaster({
                    eqLowDb: 0.8,
                    eqMidDb: 0.5,
                    eqHighDb: 1.5,
                    glueEnabled: true,
                    glueThreshold: -16,
                    glueRatio: 3.2,
                    width: 1.15,
                    limiterEnabled: true,
                    limiterCeilingDb: -0.2,
                  })
                }
              >
                音圧強めロック
              </button>
              <button
                type="button"
                className="preset-pill"
                onClick={() =>
                  onUpdateMaster({
                    eqLowDb: 0,
                    eqMidDb: 0,
                    eqHighDb: 0,
                    glueEnabled: false,
                    width: 1.0,
                    limiterEnabled: true,
                    limiterCeilingDb: -0.3,
                  })
                }
              >
                フラット
              </button>
            </div>

            <div className="master-rack-editor">
              <div className="master-rack-card">
                <h4>マスター 3-Band EQ</h4>
                <div className="bus-knobs">
                  <RotaryKnob
                    label="LOW"
                    value={master.eqLowDb}
                    min={-6}
                    max={6}
                    defaultValue={0.5}
                    step={0.2}
                    bipolar
                    color="#fbbf24"
                    format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}dB`}
                    onChange={(v) => onUpdateMaster({ eqLowDb: v })}
                  />
                  <RotaryKnob
                    label="MID"
                    value={master.eqMidDb}
                    min={-6}
                    max={6}
                    defaultValue={0}
                    step={0.2}
                    bipolar
                    color="#38bdf8"
                    format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}dB`}
                    onChange={(v) => onUpdateMaster({ eqMidDb: v })}
                  />
                  <RotaryKnob
                    label="AIR"
                    value={master.eqHighDb}
                    min={-6}
                    max={6}
                    defaultValue={0.8}
                    step={0.2}
                    bipolar
                    color="#c084fc"
                    format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}dB`}
                    onChange={(v) => onUpdateMaster({ eqHighDb: v })}
                  />
                </div>
              </div>

              <div className="master-rack-card">
                <div className="card-head">
                  <h4>バス・グルーコンプ</h4>
                  <button
                    type="button"
                    className={`mini-btn ${master.glueEnabled ? "active" : ""}`}
                    onClick={() =>
                      onUpdateMaster({ glueEnabled: !master.glueEnabled })
                    }
                  >
                    {master.glueEnabled ? "ON" : "OFF"}
                  </button>
                </div>
                <div className="bus-knobs">
                  <RotaryKnob
                    label="スレッショルド"
                    value={master.glueThreshold}
                    min={-30}
                    max={0}
                    defaultValue={-12}
                    step={0.5}
                    color="#f59e0b"
                    format={(v) => `${v.toFixed(1)}dB`}
                    onChange={(v) =>
                      onUpdateMaster({ glueEnabled: true, glueThreshold: v })
                    }
                  />
                  <RotaryKnob
                    label="レシオ"
                    value={master.glueRatio}
                    min={1.5}
                    max={6}
                    defaultValue={2.2}
                    step={0.1}
                    color="#f59e0b"
                    format={(v) => `${v.toFixed(1)}:1`}
                    onChange={(v) =>
                      onUpdateMaster({ glueEnabled: true, glueRatio: v })
                    }
                  />
                </div>
              </div>

              <div className="master-rack-card">
                <div className="card-head">
                  <h4>ステレオ＆音圧リミッター</h4>
                  <button
                    type="button"
                    className={`mini-btn ${master.limiterEnabled ? "active" : ""}`}
                    onClick={() =>
                      onUpdateMaster({ limiterEnabled: !master.limiterEnabled })
                    }
                  >
                    LIMITER {master.limiterEnabled ? "ON" : "OFF"}
                  </button>
                </div>
                <div className="bus-knobs">
                  <RotaryKnob
                    label="ステレオ幅"
                    value={Math.round(master.width * 100)}
                    min={0}
                    max={160}
                    defaultValue={105}
                    step={2}
                    color="#34d399"
                    format={(v) => `${Math.round(v)}%`}
                    onChange={(v) => onUpdateMaster({ width: v / 100 })}
                  />
                  <RotaryKnob
                    label="上限Ceiling"
                    value={master.limiterCeilingDb}
                    min={-3}
                    max={0}
                    defaultValue={-0.3}
                    step={0.1}
                    color="#ef4444"
                    format={(v) => `${v.toFixed(1)}dB`}
                    onChange={(v) =>
                      onUpdateMaster({ limiterEnabled: true, limiterCeilingDb: v })
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
