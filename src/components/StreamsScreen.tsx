import React, { useState } from 'react';
import { LiveStream, UserProfile, CustomGame } from '../types';
import { sounds } from '../services/soundEffects';
import {
  Radio,
  Users,
  Globe,
  Play,
  Eye,
  Tv,
  Gamepad2,
  Sparkles,
  Flame,
  Plus,
} from 'lucide-react';

interface StreamsScreenProps {
  streams: LiveStream[];
  userProfile: UserProfile;
  onWatchStream: (stream: LiveStream) => void;
  onOpenStartStream: () => void;
  onPromptSignIn?: () => void;
}

export const StreamsScreen: React.FC<StreamsScreenProps> = ({
  streams,
  userProfile,
  onWatchStream,
  onOpenStartStream,
  onPromptSignIn,
}) => {
  const [filter, setFilter] = useState<'all' | 'friends' | 'public'>('all');

  const filteredStreams = streams.filter((s) => {
    if (filter === 'friends') return s.visibility === 'friends';
    if (filter === 'public') return s.visibility === 'public';
    return true;
  });

  const handleStartStreamClick = () => {
    if (userProfile.isGuest) {
      sounds.playBack();
      if (onPromptSignIn) {
        onPromptSignIn();
      } else {
        alert('Guests must sign in to start a live game stream.');
      }
      return;
    }
    sounds.playSelect();
    onOpenStartStream();
  };

  return (
    <div className="relative z-10 w-full px-6 sm:px-8 py-3 select-none space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-gradient-to-r from-red-950/40 via-[#161a29] to-[#121624] border border-red-500/20 rounded-2xl shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-500 shrink-0">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white uppercase tracking-wider flex items-center gap-2">
              <span>Atlas Live Streams</span>
              <span className="text-[10px] bg-red-600 text-white font-extrabold px-2 py-0.5 rounded-full uppercase">
                {streams.length} Live
              </span>
            </h1>
            <p className="text-xs text-slate-300 mt-1 max-w-xl leading-relaxed">
              Broadcast your game screen live with audio to your friends or the entire Atlas network — just like YouTube and Twitch!
            </p>
          </div>
        </div>

        <button
          onClick={handleStartStreamClick}
          className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0 self-start sm:self-auto"
        >
          <Radio className="w-4 h-4 animate-pulse" />
          <span>Start Streaming</span>
        </button>
      </div>

      {/* Filter Tabs (All, Friends Only, Public) */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              sounds.playSelect();
              setFilter('all');
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              filter === 'all'
                ? 'bg-red-600 text-white'
                : 'bg-[#151a28] text-slate-400 hover:text-white'
            }`}
          >
            All Streams ({streams.length})
          </button>
          <button
            onClick={() => {
              sounds.playSelect();
              setFilter('friends');
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
              filter === 'friends'
                ? 'bg-cyan-600 text-white'
                : 'bg-[#151a28] text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Friends Only</span>
          </button>
          <button
            onClick={() => {
              sounds.playSelect();
              setFilter('public');
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
              filter === 'public'
                ? 'bg-emerald-600 text-white'
                : 'bg-[#151a28] text-slate-400 hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Public</span>
          </button>
        </div>
      </div>

      {/* Grid of Active Live Streams */}
      {filteredStreams.length === 0 ? (
        <div className="py-16 px-6 text-center bg-[#10141f] border border-slate-800/80 rounded-2xl flex flex-col items-center justify-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[#192033] border border-slate-700 flex items-center justify-center text-slate-400">
            <Tv className="w-8 h-8 text-red-500/80" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white mb-1">
              No live game streams active right now
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              Be the first to go live! Stream your favorite games directly to your friends or the community.
            </p>
          </div>
          <button
            onClick={handleStartStreamClick}
            className="mt-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-lg transition-all cursor-pointer flex items-center gap-2"
          >
            <Radio className="w-4 h-4" />
            <span>Go Live Now</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredStreams.map((item) => (
            <div
              key={item.id}
              onClick={() => {
                sounds.playLaunch();
                onWatchStream(item);
              }}
              className="group bg-[#131724] hover:bg-[#181e2e] border border-slate-800 hover:border-red-500/60 rounded-2xl overflow-hidden shadow-lg transition-all cursor-pointer flex flex-col"
            >
              {/* Thumbnail / Live Frame Container */}
              <div className="relative aspect-video w-full bg-slate-900 overflow-hidden flex items-center justify-center">
                {item.previewFrame ? (
                  <img
                    src={item.previewFrame}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-red-950/60 to-slate-950 flex flex-col items-center justify-center gap-2">
                    <Radio className="w-8 h-8 text-red-500 animate-pulse" />
                    <span className="text-xs text-slate-400 font-bold">Live Broadcast</span>
                  </div>
                )}

                {/* Badges on Thumbnail */}
                <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                  <span className="px-2 py-0.5 bg-red-600 text-white text-[10px] font-black rounded uppercase flex items-center gap-1 shadow-md">
                    <Radio className="w-2.5 h-2.5" /> LIVE
                  </span>
                  <span className="px-2 py-0.5 bg-black/75 backdrop-blur-sm text-slate-200 text-[10px] font-bold rounded flex items-center gap-1 shadow-md">
                    <Eye className="w-2.5 h-2.5 text-red-400" /> {item.viewerCount || 1}
                  </span>
                </div>

                <div className="absolute top-2.5 right-2.5">
                  {item.visibility === 'friends' ? (
                    <span className="px-2 py-0.5 bg-cyan-950/90 border border-cyan-800 text-cyan-300 text-[9px] font-bold rounded uppercase flex items-center gap-1 shadow-md">
                      <Users className="w-2.5 h-2.5" /> Friends
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-emerald-950/90 border border-emerald-800 text-emerald-300 text-[9px] font-bold rounded uppercase flex items-center gap-1 shadow-md">
                      <Globe className="w-2.5 h-2.5" /> Public
                    </span>
                  )}
                </div>

                {/* Hover Play Overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-red-600 text-white flex items-center justify-center shadow-2xl transform group-hover:scale-110 transition-transform">
                    <Play className="w-6 h-6 fill-current ml-0.5" />
                  </div>
                </div>
              </div>

              {/* Card Meta Content */}
              <div className="p-4 flex items-start gap-3">
                <div className="relative w-9 h-9 rounded-xl overflow-hidden bg-slate-800 border-2 border-red-500/60 shrink-0 mt-0.5">
                  <img
                    src={item.streamerPic}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-black text-white truncate group-hover:text-red-400 transition-colors">
                    {item.title}
                  </h4>
                  <div className="text-[11px] text-slate-400 font-semibold truncate mt-0.5">
                    {item.streamer}
                  </div>
                  <div className="text-[10px] text-cyan-400 font-bold truncate mt-1 flex items-center gap-1">
                    <Gamepad2 className="w-3 h-3" /> {item.gameTitle}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
