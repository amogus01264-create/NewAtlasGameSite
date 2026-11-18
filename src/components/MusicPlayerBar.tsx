import React, { useEffect, useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Heart,
  ListMusic,
  ExternalLink,
  Loader2,
  Music2,
  X,
} from 'lucide-react';
import { MusicTrack, RepeatMode } from '../types';
import { MUSIC_SOURCE_STYLES, formatDuration } from '../services/musicService';

interface MusicPlayerBarProps {
  track: MusicTrack;
  isPlaying: boolean;
  isBuffering: boolean;
  currentTimeSec: number;
  durationSec: number;
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
  isMuted: boolean;
  isLiked: boolean;
  queueCount: number;
  errorMessage: string | null;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (timeSec: number) => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onChangeVolume: (vol: number) => void;
  onToggleMute: () => void;
  onToggleLike: (track: MusicTrack) => void;
  onOpenQueue: () => void;
  onDismissError: () => void;
}

export const MusicPlayerBar: React.FC<MusicPlayerBarProps> = ({
  track,
  isPlaying,
  isBuffering,
  currentTimeSec,
  durationSec,
  shuffle,
  repeat,
  volume,
  isMuted,
  isLiked,
  queueCount,
  errorMessage,
  onTogglePlay,
  onPrev,
  onNext,
  onSeek,
  onToggleShuffle,
  onCycleRepeat,
  onChangeVolume,
  onToggleMute,
  onToggleLike,
  onOpenQueue,
  onDismissError,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const [draggingTime, setDraggingTime] = useState<number | null>(null);

  useEffect(() => {
    setImgFailed(false);
    setDraggingTime(null);
  }, [track.id, track.artwork]);

  const effectiveDuration = Math.max(durationSec || track.durationSec || 0, 1);
  const displayTime = draggingTime !== null ? draggingTime : Math.min(currentTimeSec, effectiveDuration);
  const progressPct = Math.min(100, Math.max(0, (displayTime / effectiveDuration) * 100));

  const sourceStyle = MUSIC_SOURCE_STYLES[track.source] || MUSIC_SOURCE_STYLES.direct;

  return (
    <div className="fixed bottom-0 inset-x-0 z-30 select-none">
      {/* Inline playback fallback / restriction notice if needed */}
      {errorMessage && (
        <div className="bg-[#151c2b]/95 border-t border-amber-500/40 px-4 sm:px-6 py-1.5 flex items-center justify-between gap-3 text-xs text-amber-200 backdrop-blur-md">
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate">{errorMessage}</span>
            <a
              href={track.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1 font-bold underline underline-offset-2 whitespace-nowrap shrink-0 ${sourceStyle.accentClass}`}
            >
              <span>Open on {track.sourceName}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <button
            type="button"
            onClick={onDismissError}
            className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer shrink-0"
            title="Dismiss notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Persistent Player Bar */}
      <div className="h-20 px-4 sm:px-6 bg-[#0b101b]/95 backdrop-blur-xl border-t border-slate-800/90 shadow-[0_-10px_30px_rgba(0,0,0,0.65)] grid grid-cols-12 items-center gap-3">
        {/* Left: Track Artwork, Title, Artist & Clickable Source Site Link */}
        <div className="col-span-5 sm:col-span-4 flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-lg overflow-hidden bg-[#141c2c] border border-slate-700/80 flex items-center justify-center shrink-0">
            {track.artwork && !imgFailed ? (
              <img
                src={track.artwork}
                alt={track.title}
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <Music2 className="w-5 h-5 text-cyan-400" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-bold text-white truncate">{track.title}</span>
              <button
                type="button"
                onClick={() => onToggleLike(track)}
                className={`p-1 rounded transition-colors cursor-pointer shrink-0 ${
                  isLiked ? 'text-rose-400 hover:text-rose-300' : 'text-slate-400 hover:text-white'
                }`}
                title={isLiked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
              >
                <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-rose-400' : ''}`} />
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400 min-w-0">
              <span className="truncate">{track.artist}</span>
              <span className="text-slate-600 shrink-0">·</span>
              <a
                href={track.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={`Open "${track.title}" on ${track.sourceName}`}
                className={`inline-flex items-center gap-1 font-semibold hover:underline underline-offset-2 whitespace-nowrap shrink-0 transition-colors ${sourceStyle.accentClass}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sourceStyle.dotClass}`} />
                <span>{track.sourceName}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>

        {/* Center: Transport Controls + Progress Bar */}
        <div className="col-span-7 sm:col-span-5 flex flex-col items-center justify-center gap-1.5">
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={onToggleShuffle}
              className={`p-1 rounded transition-colors cursor-pointer ${
                shuffle ? 'text-[#00A2FF]' : 'text-slate-400 hover:text-white'
              }`}
              title={shuffle ? 'Shuffle On' : 'Shuffle Off'}
            >
              <Shuffle className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={onPrev}
              className="p-1 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Previous Track"
            >
              <SkipBack className="w-4 h-4 fill-current" />
            </button>

            <button
              type="button"
              onClick={onTogglePlay}
              className="w-9 h-9 rounded-full bg-white hover:bg-slate-200 text-[#070a10] flex items-center justify-center shadow-lg transition-transform active:scale-95 cursor-pointer shrink-0"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isBuffering ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={onNext}
              className="p-1 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Next Track"
            >
              <SkipForward className="w-4 h-4 fill-current" />
            </button>

            <button
              type="button"
              onClick={onCycleRepeat}
              className={`p-1 rounded transition-colors cursor-pointer ${
                repeat !== 'off' ? 'text-[#00A2FF]' : 'text-slate-400 hover:text-white'
              }`}
              title={
                repeat === 'one'
                  ? 'Repeat One'
                  : repeat === 'all'
                    ? 'Repeat Queue'
                    : 'Repeat Off'
              }
            >
              {repeat === 'one' ? <Repeat1 className="w-3.5 h-3.5" /> : <Repeat className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="w-full max-w-md flex items-center gap-2">
            <span className="text-[11px] font-mono tabular-nums text-slate-400 w-9 text-right shrink-0">
              {formatDuration(displayTime)}
            </span>

            <div className="relative flex-1 h-4 flex items-center group">
              <div className="w-full h-1 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-[#00A2FF] group-hover:bg-cyan-300 transition-colors"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={effectiveDuration}
                step={1}
                value={Math.floor(displayTime)}
                onChange={(e) => setDraggingTime(Number(e.target.value))}
                onMouseUp={() => {
                  if (draggingTime !== null) {
                    onSeek(draggingTime);
                    setDraggingTime(null);
                  }
                }}
                onTouchEnd={() => {
                  if (draggingTime !== null) {
                    onSeek(draggingTime);
                    setDraggingTime(null);
                  }
                }}
                onKeyUp={() => {
                  if (draggingTime !== null) {
                    onSeek(draggingTime);
                    setDraggingTime(null);
                  }
                }}
                aria-label="Seek track position"
                className="absolute inset-0 w-full opacity-0 cursor-pointer"
              />
            </div>

            <span className="text-[11px] font-mono tabular-nums text-slate-400 w-9 shrink-0">
              {formatDuration(effectiveDuration)}
            </span>
          </div>
        </div>

        {/* Right: Queue Button & Volume Control */}
        <div className="hidden sm:flex sm:col-span-3 items-center justify-end gap-3">
          <button
            type="button"
            onClick={onOpenQueue}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#141c2c] hover:bg-[#1c273d] border border-slate-700/70 text-xs font-semibold text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Open Music Queue"
          >
            <ListMusic className="w-3.5 h-3.5 text-[#00A2FF]" />
            <span>Queue</span>
            <span className="font-mono tabular-nums text-slate-400">({queueCount})</span>
          </button>

          <div className="flex items-center gap-1.5 w-28">
            <button
              type="button"
              onClick={onToggleMute}
              className="p-1 text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
              title={isMuted ? 'Unmute Music' : 'Mute Music'}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-red-400" />
              ) : (
                <Volume2 className="w-4 h-4 text-slate-300" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={isMuted ? 0 : volume}
              onChange={(e) => onChangeVolume(Number(e.target.value))}
              aria-label="Music volume"
              className="w-full accent-[#00A2FF] cursor-pointer h-1"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
