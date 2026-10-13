import React, { useState, useRef } from 'react';
import { UserProfile, TabCloakConfig, TabCloakPreset } from '../types';
import { X, Volume2, VolumeX, RotateCcw, User, ShieldCheck, Upload, Settings, Trash2, Shield, ExternalLink, Check } from 'lucide-react';
import { sounds } from '../services/soundEffects';
import { CLOAK_PRESETS, applyTabCloak, saveTabCloak } from '../services/tabCloak';

interface SettingsModalProps {
  userProfile: UserProfile;
  onUpdateProfile: (profile: UserProfile) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  cloakConfig: TabCloakConfig;
  onUpdateCloak: (config: TabCloakConfig) => void;
  onOpenFullCloak: () => void;
  onClearCustomGames: () => void;
  onResetData: () => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  userProfile,
  onUpdateProfile,
  isMuted,
  onToggleMute,
  cloakConfig,
  onUpdateCloak,
  onOpenFullCloak,
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

  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setUploadError(null);
    if (file) {
      if (file.size > 6 * 1024 * 1024) {
        setUploadError('Please select an image smaller than 6MB.');
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
                  {uploadError && (
                    <p className="text-[11px] text-red-400 font-semibold mt-1">
                      {uploadError}
                    </p>
                  )}
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

          {/* Tab Cloaker Disguise */}
          <div className="p-4 bg-[#1b2234] rounded-xl border border-slate-700/60 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-cyan-400" />
                  <span>Tab Cloaker & Disguise</span>
                  {cloakConfig.preset !== 'none' && (
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-1.5 py-0.5 rounded font-bold uppercase">
                      Active
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Change the browser tab name and icon to look like school or productivity apps.
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  sounds.playSelect();
                  onOpenFullCloak();
                }}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 cursor-pointer shrink-0"
              >
                <span>Customize</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick Preset Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {[
                { id: 'none' as const, label: 'Default', icon: '/favicon.ico' },
                { id: 'classroom' as const, label: 'Classroom', icon: 'https://ssl.gstatic.com/classroom/favicon.png' },
                { id: 'drive' as const, label: 'Google Drive', icon: 'https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_32dp.png' },
                { id: 'docs' as const, label: 'Google Docs', icon: 'https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico' },
              ].map((item) => {
                const isActive = cloakConfig.preset === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      sounds.playSelect();
                      const next: TabCloakConfig = { preset: item.id };
                      applyTabCloak(next);
                      saveTabCloak(next);
                      onUpdateCloak(next);
                    }}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-cyan-950/50 border-cyan-500 text-white shadow-sm ring-1 ring-cyan-500/40'
                        : 'bg-[#151a28] hover:bg-[#1e2538] border-slate-700/80 text-slate-300'
                    }`}
                  >
                    <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                      <img src={item.icon} alt="" className="w-3.5 h-3.5 object-contain" />
                    </div>
                    <span className="truncate">{item.label}</span>
                    {isActive && <Check className="w-3 h-3 text-cyan-400 ml-auto shrink-0" />}
                  </button>
                );
              })}
            </div>
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
