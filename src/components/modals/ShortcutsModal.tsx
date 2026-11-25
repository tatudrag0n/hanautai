import React from "react";
import { X } from "lucide-react";

interface ShortcutsModalProps {
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ onClose }) => {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>HanautAI Mix Studio — クイック操作ガイド</h3>
          <button type="button" className="t-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div className="guide-grid">
            <div className="guide-section">
              <h4>1. 直感ピッチ補正 (Pitch Studio)</h4>
              <ul>
                <li><strong>ノート移動:</strong> ノートブロックを上下ドラッグで音程を修正</li>
                <li><strong>セント微調整:</strong> <code>Shift</code> を押しながらドラッグで滑らかに調整</li>
                <li><strong>スケール吸着:</strong> ノートをダブルクリックでキー音階に即スナップ</li>
                <li><strong>しゃくり分割:</strong> 「分割」ツールでノートの途中をクリックして切り分け</li>
                <li><strong>Before/After聴き比べ:</strong> 左上の「ON/OFF」ボタンで原音と瞬時比較</li>
                <li><strong>自動ハモリ:</strong> 「+ ハモリ生成」で3度/5度上のハモリトラックを即作成</li>
              </ul>
            </div>

            <div className="guide-section">
              <h4>2. Visual FX Rack & ミキサー</h4>
              <ul>
                <li><strong>Visual EQ:</strong> リアルタイムFFTスペクトラムを見ながらポイントを直接ドラッグ</li>
                <li><strong>信号順入替:</strong> エフェクト上部の <code>← / →</code> で接続順を自由に変更</li>
                <li><strong>空間XYパッド:</strong> 1つのパッドでリバーブ深さ(縦) × ディレイ量(横)を調整</li>
                <li><strong>チャンネルノブ:</strong> 上下ドラッグで調整 / <code>Shift</code>で微調整 / ダブルクリックで初期値</li>
                <li><strong>音声取り込み:</strong> タイムラインへ WAV / MP3 / OGG ファイルをドラッグ＆ドロップ</li>
              </ul>
            </div>
          </div>

          <div className="shortcuts-list">
            <h4>キーボードショートカット</h4>
            <div className="shortcut-pills">
              <span><code>Space</code> 再生 / 一時停止</span>
              <span><code>R</code> マイク録音開始 / 停止</span>
              <span><code>M</code> 選択トラック ミュート</span>
              <span><code>S</code> 選択トラック ソロ</span>
              <span><code>Cmd/Ctrl + Z</code> 元に戻す (Undo)</span>
              <span><code>Cmd/Ctrl + Shift + Z</code> やり直す (Redo)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
