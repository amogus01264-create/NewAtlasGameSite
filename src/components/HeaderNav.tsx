import React from 'react';
import { NavTab, UserProfile } from '../types';
import { AtlasLogo } from './AtlasLogo';
import { Volume2, VolumeX, EyeOff, Plus, UserPlus, LogOut, Lock } from 'lucide-react';
import { sounds } from '../services/soundEffects';

interface HeaderNavProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  userProfile: UserProfile;
  isMuted: boolean;
  onToggleMute: () => void;
  onTriggerStealth: () => void;
  onOpenAddGame: () => void;
  onOpenAddFriend: () => void;
  onLogOut: () => void;
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
  onLogOut,
  onPromptSignIn,
}) => {
  const tabs: { key: NavTab; label: string }[] = [
    { key: 'HOME', label: 'HOME' },
    { key: 'GAMES', label: 'GAMES' },
    { key: 'FRIENDS', label: 'FRIENDS' },
  ];

  const handleAddFriendClick = () => {
    if (userProfile.isGuest) {
      sounds.playBack();
      if (onPromptSignIn) {
        onPromptSignIn();
      } else {
        alert('Guests cannot add friends. Please sign in or create an account.');
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

          {/* Panic / Stealth Button */}
          <button
            onClick={onTriggerStealth}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-red-950/40 hover:bg-red-900/60 border border-red-800/40 text-red-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            title="School Panic Key (P or ~)"
          >
            <EyeOff className="w-3.5 h-3.5 text-red-400" />
            <span className="hidden sm:inline">Panic (P)</span>
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

          {/* Gamertag Label & Avatar Pic */}
          <div className="flex items-center gap-2 pl-2 pr-3 py-1 bg-[#141a24] rounded-lg border border-slate-800 text-xs font-bold text-slate-200">
            <div className="w-5 h-5 rounded-full overflow-hidden bg-black border border-cyan-400/50 flex items-center justify-center">
              <img
                src={userProfile.gamerpic}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
            <span className="max-w-[100px] truncate">{userProfile.gamertag}</span>
            {userProfile.isGuest && (
              <span className="text-[9px] bg-amber-950/80 border border-amber-800/40 text-amber-400 px-1 py-0.2 rounded font-bold uppercase">
                Guest
              </span>
            )}
          </div>

          {/* Log Out / Switch Account */}
          <button
            onClick={() => {
              sounds.playBack();
              onLogOut();
            }}
            className="p-1.5 bg-[#1a1c22] hover:bg-red-950/50 hover:text-red-300 text-slate-400 border border-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Switch Account / Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
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
              className={`relative py-1 transition-colors uppercase cursor-pointer ${
                isActive
                  ? 'text-white border-b-[3px] border-[#00A2FF]'
                  : 'text-[#1e88e5]/80 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
