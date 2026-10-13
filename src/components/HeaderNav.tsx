import React, { useState, useRef, useEffect } from 'react';
import { NavTab, UserProfile, TabCloakConfig } from '../types';
import { AtlasLogo } from './AtlasLogo';
import {
  Volume2,
  VolumeX,
  EyeOff,
  Plus,
  UserPlus,
  LogOut,
  Lock,
  Shield,
  Settings,
  Radio,
  Trash2,
  ChevronDown,
  User,
  AlertTriangle,
} from 'lucide-react';
import { sounds } from '../services/soundEffects';
import { CLOAK_PRESETS } from '../services/tabCloak';

interface HeaderNavProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  userProfile: UserProfile;
  isMuted: boolean;
  onToggleMute: () => void;
  onTriggerStealth: () => void;
  onOpenAddGame: () => void;
  onOpenAddFriend: () => void;
  onOpenTabCloak: () => void;
  onOpenSettings: () => void;
  onOpenStartStream?: () => void;
  activeStreamsCount?: number;
  cloakConfig: TabCloakConfig;
  onLogOut: () => void;
  onDeleteAccount?: () => void;
  onPromptSignIn?: () => void;
}

export const HeaderNav: React.FC<HeaderNavProps> = ({
  currentTab,
  onTabChange,
  userProfile,
  isMuted,
  onToggleMute,
  onTriggerStealth,
  onOpenAddGame,
  onOpenAddFriend,
  onOpenTabCloak,
  onOpenSettings,
  onOpenStartStream,
  activeStreamsCount = 0,
  cloakConfig,
  onLogOut,
  onDeleteAccount,
  onPromptSignIn,
}) => {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    if (accountMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [accountMenuOpen]);
  const tabs: { key: NavTab; label: string; badge?: number }[] = [
    { key: 'HOME', label: 'HOME' },
    { key: 'GAMES', label: 'GAMES' },
    { key: 'STREAMS', label: 'STREAMS', badge: activeStreamsCount },
    { key: 'FRIENDS', label: 'FRIENDS' },
  ];

  const activePreset = CLOAK_PRESETS.find((p) => p.id === cloakConfig.preset);
  const isCloaked = cloakConfig.preset !== 'none';

  const handleAddFriendClick = () => {
    if (userProfile.isGuest) {
      sounds.playBack();
      if (onPromptSignIn) {
        onPromptSignIn();
      }
      return;
    }
    sounds.playSelect();
    onOpenAddFriend();
  };

  return (
    <header className="relative z-20 w-full px-8 pt-5 pb-3 flex flex-col gap-4 select-none">
      {/* Top Bar with Logo & Fast Action Buttons */}
      <div className="flex items-center justify-between">
        {/* Left: Atlas Wordmark Logo */}
        <div
          onClick={() => {
            sounds.playSelect();
            onTabChange('HOME');
          }}
          className="cursor-pointer flex items-center gap-3"
        >
          <AtlasLogo size="md" />
        </div>

        {/* Right: Quick Actions */}
        <div className="flex items-center gap-3">
          {/* Go Live / Start Stream Button */}
          {onOpenStartStream && (
            <button
              onClick={() => {
                sounds.playSelect();
                onOpenStartStream();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/60 text-red-400 hover:text-red-300 text-xs font-bold rounded-lg transition-colors shadow-sm cursor-pointer"
              title="Go Live: Stream your game to friends or public"
            >
              <Radio className="w-3.5 h-3.5 animate-pulse text-red-500" />
              <span className="hidden sm:inline">Go Live</span>
            </button>
          )}

          {/* Add Game Button */}
          <button
            onClick={() => {
              sounds.playSelect();
              onOpenAddGame();
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#00A2FF]/20 hover:bg-[#00A2FF]/30 border border-[#00A2FF]/60 text-[#00A2FF] text-xs font-bold rounded-lg transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Game</span>
          </button>

          {/* Add Friend Button */}
          {userProfile.isGuest ? (
            <button
              onClick={handleAddFriendClick}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#182030] hover:bg-[#202b40] border border-amber-500/30 text-amber-300 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              title="Guests cannot add friends. Click to sign in."
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>Add Friend</span>
            </button>
          ) : (
            <button
              onClick={handleAddFriendClick}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#182030] hover:bg-[#202b40] border border-slate-700 text-slate-200 text-xs font-bold rounded-lg transition-colors cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5 text-cyan-400" />
              <span>Add Friend</span>
            </button>
          )}

          {/* Tab Cloaker Disguise Button */}
          <button
            onClick={() => {
              sounds.playSelect();
              onOpenTabCloak();
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
              isCloaked
                ? 'bg-emerald-950/40 hover:bg-emerald-900/60 border-emerald-500/50 text-emerald-300 ring-1 ring-emerald-500/30'
                : 'bg-[#182030] hover:bg-[#202b40] border-slate-700 text-slate-300'
            }`}
            title="Tab Cloaker: Disguise tab as Google Classroom, Drive, Docs, etc."
          >
            <Shield className={`w-3.5 h-3.5 ${isCloaked ? 'text-emerald-400' : 'text-cyan-400'}`} />
            <span className="hidden sm:inline">
              {isCloaked ? (activePreset?.badge || 'Cloaked') : 'Cloak Tab'}
            </span>
            {isCloaked && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>

          {/* Panic / Stealth Button */}
          <button
            onClick={onTriggerStealth}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-red-950/40 hover:bg-red-900/60 border border-red-800/40 text-red-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            title="School Panic Key (P or ~)"
          >
            <EyeOff className="w-3.5 h-3.5 text-red-400" />
            <span className="hidden sm:inline">Panic (P)</span>
          </button>

          {/* Settings Button */}
          <button
            onClick={() => {
              sounds.playSelect();
              onOpenSettings();
            }}
            className="p-1.5 bg-[#161c28] hover:bg-[#20283a] text-slate-300 border border-slate-700/60 rounded-lg transition-colors cursor-pointer"
            title="Atlas Settings"
          >
            <Settings className="w-4 h-4 text-cyan-400" />
          </button>

          {/* Sound Toggle */}
          <button
            onClick={onToggleMute}
            className="p-1.5 bg-[#161c28] hover:bg-[#20283a] text-slate-300 border border-slate-700/60 rounded-lg transition-colors cursor-pointer"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-red-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-cyan-400" />
            )}
          </button>

          {/* Interactive Account Profile Button & Dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => {
                sounds.playSelect();
                setAccountMenuOpen((prev) => !prev);
              }}
              className="flex items-center gap-2 pl-2 pr-2.5 py-1 bg-[#141a24] hover:bg-[#1a2232] rounded-lg border border-slate-800 hover:border-slate-700 text-xs font-bold text-slate-200 transition-colors cursor-pointer group shadow-sm"
              title="Account Menu (Log Out, Delete Account, Profile)"
            >
              <div className="w-5 h-5 rounded-full overflow-hidden bg-black border border-cyan-400/50 flex items-center justify-center shrink-0">
                <img
                  src={userProfile.gamerpic}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="max-w-[100px] truncate">{userProfile.gamertag}</span>
              {userProfile.isGuest ? (
                <span className="text-[9px] bg-amber-950/80 border border-amber-800/40 text-amber-400 px-1 py-0.2 rounded font-bold uppercase">
                  Guest
                </span>
              ) : (
                <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-white transition-colors" />
              )}
            </button>

            {/* Account Popover Menu */}
            {accountMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-[#141724] border border-[#2b3145] rounded-xl shadow-[0_15px_30px_rgba(0,0,0,0.8)] z-50 p-3 space-y-3 animate-in fade-in zoom-in-95 duration-100">
                {/* Profile Snapshot */}
                <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-800">
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-black border border-cyan-400/60 shrink-0">
                    <img src={userProfile.gamerpic} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                      <span>@{userProfile.gamertag}</span>
                      {userProfile.isGuest ? (
                        <span className="text-[8px] bg-amber-950 text-amber-400 border border-amber-700/60 px-1 rounded uppercase font-bold">
                          Guest
                        </span>
                      ) : (
                        <span className="text-[8px] bg-cyan-950 text-cyan-300 border border-cyan-700/60 px-1 rounded uppercase font-bold">
                          Online
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {userProfile.isGuest ? 'Local guest session' : 'Atlas Cloud Network Account'}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="space-y-1.5">
                  {/* Log Out */}
                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      sounds.playBack();
                      onLogOut();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-bold text-slate-200 hover:text-white bg-[#1a1f2e] hover:bg-[#232b40] rounded-lg transition-colors cursor-pointer text-left"
                  >
                    <LogOut className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>Log Out / Switch Account</span>
                  </button>

                  {/* Delete Account (For Registered Accounts) */}
                  {!userProfile.isGuest && onDeleteAccount && (
                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        sounds.playExplosion();
                        onDeleteAccount();
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-bold text-red-300 hover:text-white bg-red-950/40 hover:bg-red-900/60 border border-red-800/40 rounded-lg transition-colors cursor-pointer text-left"
                    >
                      <Trash2 className="w-4 h-4 text-red-400 shrink-0" />
                      <div>
                        <div>Delete Account from Network</div>
                        <div className="text-[9px] text-red-400/80 font-normal">Permanently erase profile & friends</div>
                      </div>
                    </button>
                  )}

                  {/* If Guest: Prompt Sign Up */}
                  {userProfile.isGuest && onPromptSignIn && (
                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        onPromptSignIn();
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-bold text-cyan-300 hover:text-white bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-800/40 rounded-lg transition-colors cursor-pointer text-left"
                    >
                      <User className="w-4 h-4 text-cyan-400 shrink-0" />
                      <div>
                        <div>Sign Up or Log In</div>
                        <div className="text-[9px] text-cyan-400/80 font-normal">Unlock friends & saved data</div>
                      </div>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Quick Log Out Button */}
          <button
            onClick={() => {
              sounds.playBack();
              onLogOut();
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#1a1c22] hover:bg-red-950/50 hover:text-red-300 text-slate-300 border border-slate-800 rounded-lg text-xs font-bold transition-colors cursor-pointer"
            title={`Log Out of @${userProfile.gamertag}`}
          >
            <LogOut className="w-3.5 h-3.5 text-slate-400 hover:text-red-300" />
            <span className="hidden md:inline">Log Out</span>
          </button>

          {/* Quick Delete Account Button for Registered Users */}
          {!userProfile.isGuest && onDeleteAccount && (
            <button
              onClick={() => {
                sounds.playExplosion();
                onDeleteAccount();
              }}
              className="p-1.5 bg-red-950/30 hover:bg-red-900/50 text-red-400 hover:text-red-200 border border-red-800/40 rounded-lg transition-colors cursor-pointer"
              title={`Permanently delete @${userProfile.gamertag} from the Atlas network`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs (HOME, GAMES, FRIENDS) */}
      <nav className="flex items-center gap-8 text-xl font-bold tracking-wider">
        {tabs.map((tab) => {
          const isActive = currentTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => {
                sounds.playBumper();
                onTabChange(tab.key);
              }}
              className={`relative py-1 transition-colors uppercase cursor-pointer flex items-center gap-2 ${
                isActive
                  ? 'text-white border-b-[3px] border-[#00A2FF]'
                  : 'text-[#1e88e5]/80 hover:text-white'
              }`}
            >
              <span>{tab.label}</span>
              {tab.key === 'STREAMS' && tab.badge !== undefined && tab.badge > 0 && (
                <span className="flex items-center gap-1 text-[10px] font-black px-1.5 py-0.2 rounded-full bg-red-600 text-white shadow-sm animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
