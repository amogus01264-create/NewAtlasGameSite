import React, { useState, useRef } from 'react';
import { UserProfile } from '../types';
import { X, Volume2, VolumeX, RotateCcw, User, ShieldCheck, Upload, Settings, Trash2 } from 'lucide-react';
import { sounds } from '../services/soundEffects';

interface SettingsModalProps {
  userProfile: UserProfile;
  onUpdateProfile: (profile: UserProfile) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onClearCustomGames: () => void;
  onResetData: () => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  userProfile,
  onUpdateProfile,
  isMuted,
  onToggleMute,
  onClearCustomGames,
  onResetData,
  onClose,
}) => {
  const [gamertag, setGamertag] = useState(userProfile.gamertag);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSaveGamertag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gamertag.trim()) return;
    onUpdateProfile({ ...userProfile, gamertag: gamertag.trim() });
    sounds.playSelect();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 6 * 1024 * 1024) {
        alert('Please choose an image under 6MB');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          onUpdateProfile({ ...userProfile, gamerpic: reader.result });
          sounds.playSelect();
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md select-none">
      <div className="relative w-full max-w-lg bg-[#141824] border border-[#2b3144] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#1a2030] border-b border-[#2b3144]">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-black text-white uppercase tracking-wider">
              Atlas Settings
            </h2>
          </div>
          <button
            onClick={() => {
              sounds.playBack();
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-[#252c40] hover:bg-[#303a54]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[80vh]">
          {/* Profile Picture Upload & Gamertag */}
          <div className="p-4 bg-[#1b2234] rounded-xl border border-slate-700/60 space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                Custom Profile Picture
              </label>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-800 border-2 border-slate-600 shrink-0">
                  <img
                    src={userProfile.gamerpic}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 py-1.5 px-3 bg-[#252d40] hover:bg-[#313c54] text-slate-200 text-xs font-bold rounded-lg border border-slate-600 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Upload New Custom Image</span>
                  </button>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Upload any image from your computer to update your gamerpic.
                  </p>
                </div>
              </div>
            </div>

            {/* Gamertag Form */}
            <form onSubmit={handleSaveGamertag} className="pt-2 border-t border-slate-700/60">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                Atlas Gamertag
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <User className="w-4 h-4 text-slate-400 absolute left-3" />
                  <input
                    type="text"
                    value={gamertag}
                    onChange={(e) => setGamertag(e.target.value)}
                    maxLength={18}
                    className="w-full bg-[#141a28] text-white text-sm font-bold pl-9 pr-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-[#00A2FF]"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#00A2FF] hover:bg-blue-600 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  Save
                </button>
              </div>
            </form>
          </div>

          {/* Sound Preferences */}
          <div className="flex items-center justify-between p-4 bg-[#1b2234] rounded-xl border border-slate-700/60">
            <div>
              <div className="text-sm font-bold text-slate-200">
                System Audio & Chimes
              </div>
              <div className="text-xs text-slate-400">
                Audio ticks, button clicks, and game launch sounds.
              </div>
            </div>

            <button
              onClick={onToggleMute}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                !isMuted
                  ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/50'
                  : 'bg-red-950/40 text-red-400 border-red-700/50'
              }`}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              <span>{isMuted ? 'Muted' : 'Sound On'}</span>
            </button>
          </div>

          {/* Clear Custom Games Only */}
          <div className="p-4 bg-[#1b2234] rounded-xl border border-slate-700/60 flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-white">Clear Custom Games</div>
              <div className="text-xs text-slate-400">
                Removes only games you added. Preserves preset games like Geometry Dash.
              </div>
            </div>

            <button
              onClick={() => {
                sounds.playExplosion();
                onClearCustomGames();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-950/50 hover:bg-amber-900 border border-amber-700/60 text-amber-300 text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0"
              title="Clear all custom added games"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Custom</span>
            </button>
          </div>

          {/* Reset All Stored Data */}
          <div className="p-4 bg-[#1b2234] rounded-xl border border-slate-700/60 flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-white">Reset Stored Data</div>
              <div className="text-xs text-slate-400">
                Clears custom games and friends from your browser while preserving preset games.
              </div>
            </div>

            <button
              onClick={() => {
                sounds.playExplosion();
                onResetData();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/50 hover:bg-red-900 border border-red-700/60 text-red-300 text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>

          {/* Footer note */}
          <div className="flex items-center justify-center gap-2 text-xs text-slate-500 pt-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Atlas Gaming Network · Sandboxed Storage</span>
          </div>
        </div>
      </div>
    </div>
  );
};
