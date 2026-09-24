import React, { useState } from 'react';
import { CustomGame, Friend, UserProfile } from '../types';
import { Plus, UserPlus, Play, Lock, AlertCircle, X, Settings } from 'lucide-react';
import { sounds } from '../services/soundEffects';

interface HomeScreenProps {
  games: CustomGame[];
  friends: Friend[];
  userProfile: UserProfile;
  onPlayGame: (game: CustomGame) => void;
  onOpenAddGame: () => void;
  onOpenAddFriend: () => void;
  onOpenSettings: () => void;
  onViewAllGames: () => void;
  onViewAllFriends: () => void;
  onPromptSignIn?: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  games,
  friends,
  userProfile,
  onPlayGame,
  onOpenAddGame,
  onOpenAddFriend,
  onOpenSettings,
  onViewAllGames,
  onViewAllFriends,
  onPromptSignIn,
}) => {
  const [guestNoticeOpen, setGuestNoticeOpen] = useState(false);

  // Sort games: recently played first, then rest
  const recentGames = [...games].sort((a, b) => (b.playedCount || 0) - (a.playedCount || 0));
  const mainRecent = recentGames[0];
  const subRecent1 = recentGames[1];
  const subRecent2 = recentGames[2];

  // Featured grid: up to 6 games
  const featuredGames = games.slice(0, 6);

  // Active / online friends
  const activeFriends = friends.filter((f) => f.status === 'online' || f.status === 'playing');

  const handleAddFriendClick = () => {
    if (userProfile.isGuest) {
      sounds.playBack();
      setGuestNoticeOpen(true);
      return;
    }
    sounds.playSelect();
    onOpenAddFriend();
  };

  return (
    <div className="relative z-10 w-full px-6 sm:px-8 py-3 select-none">
      {/* Guest Notice Modal */}
      {guestNoticeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#181c28] border border-amber-500/40 rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mx-auto mb-3 text-amber-400">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-white uppercase tracking-wider mb-2">
              Sign In Required
            </h3>
            <p className="text-xs text-slate-300 mb-5 leading-relaxed">
              Guests cannot add friends. Create or log into an Atlas account to add and connect with friends!
            </p>
            <div className="flex flex-col gap-2">
              {onPromptSignIn && (
                <button
                  onClick={() => {
                    setGuestNoticeOpen(false);
                    onPromptSignIn();
                  }}
                  className="w-full py-2.5 bg-[#00A2FF] hover:bg-blue-600 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Sign Up or Log In
                </button>
              )}
              <button
                onClick={() => setGuestNoticeOpen(false)}
                className="w-full py-2 bg-[#22293a] hover:bg-[#2c364c] text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Continue as Guest
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3 Main Columns Layout (1:1 with Screenshot) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ================= COLUMN 1: USER PROFILE & FRIEND ACTIVITY ================= */}
        <div className="lg:col-span-3 flex flex-col space-y-6">
          {/* User Gamertag Section */}
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center justify-between">
              <span>{userProfile.gamertag}</span>
              {userProfile.isGuest && (
                <span className="text-[10px] text-amber-400 bg-amber-950/60 border border-amber-800/40 px-2 py-0.5 rounded font-bold uppercase">
                  Guest
                </span>
              )}
            </h2>

            {/* Profile Avatar Card */}
            <div
              onClick={() => {
                onOpenSettings();
              }}
              className="w-full aspect-[4/3] rounded-sm overflow-hidden bg-[#243444] border border-[#34485e] shadow-xl relative flex items-center justify-center group cursor-pointer"
              title="Click to edit profile or upload photo in Settings"
            >
              <img
                src={userProfile.gamerpic}
                alt={userProfile.gamertag}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-90" />
              <div className="absolute bottom-2 left-2 text-[11px] font-bold text-white uppercase tracking-wider drop-shadow flex items-center justify-between w-[calc(100%-16px)]">
                <span>{userProfile.gamertag}</span>
                <span className="text-[10px] text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  Edit Photo
                </span>
              </div>
            </div>
          </div>

          {/* Friend Activity Section */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                FRIEND ACTIVITY
              </h3>
              {userProfile.isGuest ? (
                <button
                  onClick={handleAddFriendClick}
                  className="text-xs text-slate-500 hover:text-amber-400 flex items-center gap-1 font-semibold cursor-pointer"
                  title="Sign in required to add friends"
                >
                  <Lock className="w-3 h-3 text-amber-400" />
                  <span>Add</span>
                </button>
              ) : (
                <button
                  onClick={handleAddFriendClick}
                  className="text-xs text-cyan-400 hover:text-white flex items-center gap-1 font-semibold cursor-pointer"
                  title="Add a friend"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              )}
            </div>

            {/* Friends list or "Your friends are not online" (matches screenshot text) */}
            <div className="min-h-[140px] flex flex-col justify-center">
              {activeFriends.length === 0 ? (
                <div className="text-center py-6 px-3 bg-[#131924]/60 rounded border border-slate-800/80">
                  <p className="text-sm text-slate-400 font-medium">
                    Your friends are not online
                  </p>
                  {userProfile.isGuest ? (
                    <div className="mt-3 text-[11px] px-3 py-1.5 bg-amber-950/30 text-amber-400 font-semibold rounded border border-amber-800/40 inline-flex items-center gap-1.5">
                      <Lock className="w-3 h-3" /> Guests cannot add friends
                    </div>
                  ) : (
                    <button
                      onClick={handleAddFriendClick}
                      className="mt-3 text-xs px-3 py-1.5 bg-[#1e2738] hover:bg-[#28354c] text-cyan-300 font-bold rounded border border-slate-700 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Add Friend
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {activeFriends.slice(0, 3).map((friend) => (
                    <div
                      key={friend.id}
                      onClick={() => {
                        sounds.playSelect();
                        if (friend.currentGame) {
                          const target = games.find(
                            (g) => g.title.toLowerCase() === friend.currentGame?.toLowerCase()
                          );
                          if (target) onPlayGame(target);
                        }
                      }}
                      className="p-2.5 bg-[#151c28] hover:bg-[#1f283a] rounded border border-slate-800 transition-all flex items-center justify-between cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-inner"
                          style={{ backgroundColor: friend.avatarBg }}
                        >
                          {friend.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white truncate max-w-[110px]">
                            {friend.username}
                          </div>
                          <div className="text-[10px] text-cyan-400 font-medium">
                            {friend.status === 'playing'
                              ? `Playing ${friend.currentGame || 'Game'}`
                              : 'Online'}
                          </div>
                        </div>
                      </div>

                      {friend.status === 'playing' && (
                        <span className="text-[10px] px-2 py-0.5 bg-emerald-950 border border-emerald-700/60 text-emerald-300 font-bold rounded">
                          Join
                        </span>
                      )}
                    </div>
                  ))}

                  {friends.length > 3 && (
                    <button
                      onClick={onViewAllFriends}
                      className="text-xs text-slate-400 hover:text-white pt-1 cursor-pointer"
                    >
                      View all {friends.length} friends ›
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ================= COLUMN 2: RECENTLY PLAYED ================= */}
        <div className="lg:col-span-3 flex flex-col space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
            RECENTLY PLAYED
          </h2>

          {/* Large Main Card */}
          {mainRecent ? (
            <div
              onClick={() => {
                sounds.playLaunch();
                onPlayGame(mainRecent);
              }}
              className="atlas-tile group relative w-full aspect-square rounded-sm overflow-hidden bg-[#161c28] border border-slate-700/70 cursor-pointer shadow-lg"
            >
              <img
                src={mainRecent.thumbnail}
                alt={mainRecent.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-90" />
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                <span className="text-sm font-black text-white uppercase tracking-wider drop-shadow truncate">
                  {mainRecent.title}
                </span>
                <div className="w-7 h-7 rounded bg-[#00B06F] flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity">
                  <Play className="w-3.5 h-3.5 fill-white text-white ml-0.5" />
                </div>
              </div>
            </div>
          ) : (
            <div
              onClick={onOpenAddGame}
              className="atlas-tile flex flex-col items-center justify-center w-full aspect-square rounded-sm bg-[#151c28]/70 border-2 border-dashed border-slate-700 hover:border-[#00A2FF] cursor-pointer p-4 text-center transition-colors"
            >
              <Plus className="w-10 h-10 text-[#00A2FF] mb-2" />
              <span className="text-sm font-bold text-white uppercase">Add Your First Game</span>
              <span className="text-xs text-slate-400 mt-1">Paste any unblocked URL</span>
            </div>
          )}

          {/* Two Smaller Square Cards below it */}
          <div className="grid grid-cols-2 gap-3">
            {/* Sub Recent 1 */}
            {subRecent1 ? (
              <div
                onClick={() => {
                  sounds.playLaunch();
                  onPlayGame(subRecent1);
                }}
                className="atlas-tile group relative aspect-square rounded-sm overflow-hidden bg-[#161c28] border border-slate-700/70 cursor-pointer shadow-md"
              >
                <img
                  src={subRecent1.thumbnail}
                  alt={subRecent1.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-90" />
                <div className="absolute bottom-1.5 left-2 right-2">
                  <span className="text-xs font-bold text-white truncate block drop-shadow">
                    {subRecent1.title}
                  </span>
                </div>
              </div>
            ) : (
              <div
                onClick={onOpenAddGame}
                className="atlas-tile flex flex-col items-center justify-center aspect-square rounded-sm bg-[#151c28]/50 border border-slate-800 hover:border-[#00A2FF] cursor-pointer text-slate-400 hover:text-white"
              >
                <Plus className="w-5 h-5 mb-1 text-cyan-400" />
                <span className="text-[11px] font-bold">Add Game</span>
              </div>
            )}

            {/* Sub Recent 2 */}
            {subRecent2 ? (
              <div
                onClick={() => {
                  sounds.playLaunch();
                  onPlayGame(subRecent2);
                }}
                className="atlas-tile group relative aspect-square rounded-sm overflow-hidden bg-[#161c28] border border-slate-700/70 cursor-pointer shadow-md"
              >
                <img
                  src={subRecent2.thumbnail}
                  alt={subRecent2.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-90" />
                <div className="absolute bottom-1.5 left-2 right-2">
                  <span className="text-xs font-bold text-white truncate block drop-shadow">
                    {subRecent2.title}
                  </span>
                </div>
              </div>
            ) : (
              <div
                onClick={onOpenAddGame}
                className="atlas-tile flex flex-col items-center justify-center aspect-square rounded-sm bg-[#151c28]/50 border border-slate-800 hover:border-[#00A2FF] cursor-pointer text-slate-400 hover:text-white"
              >
                <Plus className="w-5 h-5 mb-1 text-cyan-400" />
                <span className="text-[11px] font-bold">Add Game</span>
              </div>
            )}
          </div>

          {/* Centered '...' More Button */}
          <div className="flex justify-center pt-1">
            <button
              onClick={() => {
                sounds.playSelect();
                onViewAllGames();
              }}
              className="px-5 py-1 bg-[#374556]/80 hover:bg-[#475970] rounded-sm text-white font-black tracking-widest text-xs transition-colors shadow cursor-pointer"
              title="View all games"
            >
              ···
            </button>
          </div>
        </div>

        {/* ================= COLUMN 3: FEATURED / CUSTOM GAMES (3x2 Grid) ================= */}
        <div className="lg:col-span-6 flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              FEATURED
            </h2>
            <button
              onClick={onOpenAddGame}
              className="text-xs text-[#00A2FF] hover:text-white font-bold flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Custom Game</span>
            </button>
          </div>

          {/* 3x2 Grid */}
          <div className="grid grid-cols-3 gap-3">
            {/* Slot 1 to 6 */}
            {Array.from({ length: 6 }).map((_, index) => {
              const game = featuredGames[index];

              if (game) {
                return (
                  <div
                    key={game.id}
                    onClick={() => {
                      sounds.playLaunch();
                      onPlayGame(game);
                    }}
                    className="atlas-tile group relative aspect-square rounded-sm overflow-hidden bg-[#161c28] border border-slate-700/70 cursor-pointer shadow-lg"
                  >
                    <img
                      src={game.thumbnail}
                      alt={game.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent opacity-80 group-hover:opacity-95 transition-opacity" />
                    <div className="absolute bottom-2 left-2 right-2">
                      <span className="text-xs font-black text-white uppercase truncate block drop-shadow">
                        {game.title}
                      </span>
                    </div>

                    {/* Quick Play Icon on Hover */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <div className="w-8 h-8 rounded-full bg-[#00B06F] flex items-center justify-center shadow-lg">
                        <Play className="w-4 h-4 fill-white text-white ml-0.5" />
                      </div>
                    </div>
                  </div>
                );
              }

              // Empty slot: Add Game Card
              return (
                <div
                  key={`empty-${index}`}
                  onClick={onOpenAddGame}
                  className="atlas-tile flex flex-col items-center justify-center aspect-square rounded-sm bg-[#161d2a]/50 border border-slate-800 hover:border-[#00A2FF] cursor-pointer text-slate-400 hover:text-white transition-all p-2 text-center"
                >
                  <Plus className="w-6 h-6 text-[#00A2FF] mb-1" />
                  <span className="text-xs font-bold uppercase">Add Game</span>
                </div>
              );
            })}
          </div>

          {/* Bottom Right '...' Button */}
          <div className="flex justify-end pt-1">
            <button
              onClick={() => {
                sounds.playSelect();
                onViewAllGames();
              }}
              className="px-5 py-1 bg-[#374556]/80 hover:bg-[#475970] rounded-sm text-white font-black tracking-widest text-xs transition-colors shadow cursor-pointer"
              title="Browse all games"
            >
              ···
            </button>
          </div>
        </div>
      </div>

      {/* ================= BOTTOM RIGHT: SETTINGS ================= */}
      <div className="fixed bottom-4 right-6 z-20">
        <button
          onClick={() => {
            sounds.playSelect();
            onOpenSettings();
          }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#141824]/90 hover:bg-[#1e2436] border border-slate-700/60 shadow-lg text-slate-300 hover:text-white transition-all cursor-pointer group focus:outline-none"
        >
          <Settings className="w-4 h-4 text-cyan-400 group-hover:rotate-45 transition-transform" />
          <span className="text-xs font-bold tracking-wide">
            Settings
          </span>
        </button>
      </div>
    </div>
  );
};
