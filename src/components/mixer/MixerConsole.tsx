import React from "react";
import { Plus } from "lucide-react";
import type { ActiveFxFocus } from "../../store/useStudioStore";
import type { MasterSettings, Track, TrackRole } from "../../types/studio";
import { ChannelStrip } from "./ChannelStrip";
import { MasterStrip } from "./MasterStrip";

interface MixerConsoleProps {
  tracks: Track[];
  master: MasterSettings;
  selectedTrackId: string;
  onSelectTrack: (id: string) => void;
  onUpdateTrack: (trackId: string, updater: (t: Track) => Track, rec?: boolean) => void;
  onDeleteTrack: (id: string) => void;
  onAddTrack: (role: TrackRole) => void;
  onOpenPitch: (trackId: string) => void;
  onOpenFxModule: (trackId: string, mod: ActiveFxFocus) => void;
  onUpdateMaster: (patch: Partial<MasterSettings>) => void;
}

export const MixerConsole: React.FC<MixerConsoleProps> = ({
  tracks,
  master,
  selectedTrackId,
  onSelectTrack,
  onUpdateTrack,
  onDeleteTrack,
  onAddTrack,
  onOpenPitch,
  onOpenFxModule,
  onUpdateMaster,
}) => {
  return (
    <div className="mixer-console">
      <div className="mixer-strips-scroll">
        {tracks.map((track) => (
          <ChannelStrip
            key={track.id}
            track={track}
            selected={track.id === selectedTrackId}
            canDelete={tracks.length > 1}
            onSelect={() => onSelectTrack(track.id)}
            onUpdateTrack={(updater, rec) => onUpdateTrack(track.id, updater, rec)}
            onDelete={() => onDeleteTrack(track.id)}
            onOpenPitch={() => onOpenPitch(track.id)}
            onOpenFxModule={(mod) => onOpenFxModule(track.id, mod)}
          />
        ))}

        <div className="add-track-strip">
          <button
            type="button"
            className="add-track-tile"
            onClick={() => onAddTrack("vocal")}
          >
            <Plus size={18} />
            <span>ボーカル追加</span>
          </button>
          <button
            type="button"
            className="add-track-tile sub"
            onClick={() => onAddTrack("instrument")}
          >
            <Plus size={14} />
            <span>オケ / 楽器</span>
          </button>
        </div>
      </div>

      <MasterStrip
        master={master}
        onUpdateMaster={onUpdateMaster}
        onOpenMasterRack={() => onOpenFxModule(selectedTrackId, "master")}
      />
    </div>
  );
};
