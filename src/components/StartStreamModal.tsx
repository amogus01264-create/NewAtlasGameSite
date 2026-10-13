import React, { useState } from 'react';
import { UserProfile, CustomGame, LiveStream } from '../types';
import { startScreenCapture, createLiveStream } from '../services/streamingService';
import { sounds } from '../services/soundEffects';
import {
  X,
  Radio,
  Users,
  Globe,
  Tv,
  Check,
  AlertCircle,
  Loader2,
  Sparkles,
  Gamepad2,
} from 'lucide-react';

interface StartStreamModalProps {
  userProfile: UserProfile;
  currentGame?: CustomGame | null;
  availableGames: CustomGame[];
  activeStream?: LiveStream | null;
  onEndExistingStream?: () => Promise<void> | void;
  onStreamStarted: (stream: LiveStream) => void;
  onClose: () => void;
}

export const StartStreamModal: React.FC<StartStreamModalProps> = ({
  userProfile,
  currentGame,
  availableGames,
  activeStream,
  onEndExistingStream,
  onStreamStarted,
  onClose,
}) => {
  const [streamTitle, setStreamTitle] = useState(
    currentGame
      ? `Streaming ${currentGame.title} on Atlas`
      : `${userProfile.gamertag}'s Live Game Broadcast`
  );
  const [selectedGameTitle, setSelectedGameTitle] = useState(
    currentGame?.title || availableGames[0]?.title || 'Geometry Dash'
  );
  const [visibility, setVisibility] = useState<'public' | 'friends'>('friends');
  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleStartBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isStarting) return;
    setErrorMessage(null);

    if (!streamTitle.trim()) {
      setErrorMessage('Please enter a title for your stream.');
      sounds.playBack();
      return;
    }

    setIsStarting(true);
    sounds.playSelect();

    try {
      // 1. Prompt browser screen & audio capture
      await startScreenCapture();

      // 2. Register live stream in Cloud Firestore
      const newStream = await createLiveStream(
        userProfile,
        selectedGameTitle,
        streamTitle.trim(),
        visibility
      );

      sounds.playLaunch();
      onStreamStarted(newStream);
      onClose();
    } catch (err: any) {
      console.error('Failed to start stream:', err);
      if (err.name === 'NotAllowedError') {
        setErrorMessage('Screen capture permission was cancelled. Please allow screen sharing to stream.');
      } else {
        setErrorMessage(err.message || 'Unable to capture game screen. Please try again.');
      }
      sounds.playBack();
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md select-none">
      <div className="relative w-full max-w-lg bg-[#141824] border border-[#2b3144] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#1a2030] border-b border-[#2b3144]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500">
              <Radio className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                <span>Start Live Game Stream</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/40 uppercase">
                  Broadcast
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Stream your gameplay live to friends or the entire Atlas community.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              sounds.playBack();
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-[#252c40] hover:bg-[#303a54] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleStartBroadcast} className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Stream Title */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              Stream Broadcast Title
            </label>
            <input
              type="text"
              required
              maxLength={70}
              value={streamTitle}
              onChange={(e) => setStreamTitle(e.target.value)}
              placeholder="e.g. Playing Geometry Dash with friends!"
              className="w-full bg-[#10141f] text-white text-xs px-3.5 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-red-500 font-semibold"
            />
          </div>

          {/* Game Selection */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Gamepad2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Game Being Streamed</span>
            </label>
            <select
              value={selectedGameTitle}
              onChange={(e) => setSelectedGameTitle(e.target.value)}
              className="w-full bg-[#10141f] text-white text-xs px-3.5 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-400 font-semibold"
            >
              {availableGames.map((g) => (
                <option key={g.id} value={g.title}>
                  {g.title}
                </option>
              ))}
              <option value="Other Game / Freeplay">Other Game / Freeplay</option>
            </select>
          </div>

          {/* Audience Visibility (Friends vs Public) */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
              Who Can Watch Your Stream?
            </label>
            <div className="grid grid-cols-2 gap-3">
              {/* Friends Only Option */}
              <button
                type="button"
                onClick={() => {
                  sounds.playSelect();
                  setVisibility('friends');
                }}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1.5 ${
                  visibility === 'friends'
                    ? 'bg-cyan-950/40 border-cyan-500 shadow-[0_0_12px_rgba(0,162,255,0.25)] ring-1 ring-cyan-500/50'
                    : 'bg-[#151a28] hover:bg-[#1c2336] border-slate-800 text-slate-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold text-white">Only Friends</span>
                  </div>
                  {visibility === 'friends' && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Private stream: Only players in your Atlas friends list can discover and watch.
                </p>
              </button>

              {/* Fully Online (Public) Option */}
              <button
                type="button"
                onClick={() => {
                  sounds.playSelect();
                  setVisibility('public');
                }}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1.5 ${
                  visibility === 'public'
                    ? 'bg-red-950/40 border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.25)] ring-1 ring-red-500/50'
                    : 'bg-[#151a28] hover:bg-[#1c2336] border-slate-800 text-slate-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-red-400" />
                    <span className="text-xs font-bold text-white">Fully Online</span>
                  </div>
                  {visibility === 'public' && <Check className="w-3.5 h-3.5 text-red-400" />}
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Public stream: Appears on the global Atlas Streams feed for anyone to tune in.
                </p>
              </button>
            </div>
          </div>

          {/* Info Banner */}
          <div className="p-3 bg-[#111624] rounded-xl border border-slate-800 flex items-start gap-2.5 text-slate-400 text-xs leading-relaxed">
            <Tv className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              When you click <strong>Start Streaming</strong>, select your game tab or screen window in the browser popup. Make sure to check <em>Share audio</em> to broadcast sound!
            </div>
          </div>

          {/* 1 Stream Limit Notice if already streaming */}
          {activeStream && activeStream.status === 'live' && (
            <div className="p-3.5 bg-red-950/70 border border-red-700/80 rounded-xl space-y-2 text-xs text-red-200">
              <div className="flex items-center gap-2 font-bold text-white">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>You can only have 1 stream open at a time</span>
              </div>
              <p className="text-[11px] text-red-300/90 leading-tight">
                You already have an active broadcast: <strong className="text-white">"{activeStream.title}"</strong>. Atlas limits players to 1 stream at a time. Please end your current broadcast before starting another.
              </p>
              {onEndExistingStream && (
                <button
                  type="button"
                  onClick={async () => {
                    await onEndExistingStream();
                  }}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-colors cursor-pointer text-xs flex items-center gap-1.5"
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>End Active Stream & Continue</span>
                </button>
              )}
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl flex items-center gap-2 text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Submit Action */}
          <button
            type="submit"
            disabled={isStarting || Boolean(activeStream && activeStream.status === 'live')}
            className="w-full py-3 bg-red-600 hover:bg-red-500 disabled:bg-[#341b22] disabled:text-slate-500 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-lg transition-all cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isStarting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Requesting Screen Share...</span>
              </>
            ) : activeStream && activeStream.status === 'live' ? (
              <>
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span>Cannot Go Live (Only 1 Stream Allowed At A Time)</span>
              </>
            ) : (
              <>
                <Radio className="w-4 h-4" />
                <span>Go Live Now ({visibility === 'friends' ? 'Friends Only' : 'Public'})</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
