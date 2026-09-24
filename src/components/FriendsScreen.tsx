import React, { useState } from 'react';
import { Friend, CustomGame, FriendRequest } from '../types';
import { UserPlus, UserX, Play, Users, Search, Lock, Check, Clock, AlertTriangle, X } from 'lucide-react';
import { sounds } from '../services/soundEffects';

interface FriendsScreenProps {
  friends: Friend[];
  games: CustomGame[];
  requests?: FriendRequest[];
  onOpenAddFriend: () => void;
  onRemoveFriend: (id: string) => void;
  onPlayGame: (game: CustomGame) => void;
  onAcceptRequest?: (request: FriendRequest) => void;
  onDeclineRequest?: (requestId: string) => void;
  isGuest?: boolean;
  onPromptSignIn?: () => void;
}

export const FriendsScreen: React.FC<FriendsScreenProps> = ({
  friends,
  games,
  requests = [],
  onOpenAddFriend,
  onRemoveFriend,
  onPlayGame,
  onAcceptRequest,
  onDeclineRequest,
  isGuest,
  onPromptSignIn,
}) => {
  const [filter, setFilter] = useState<'all' | 'online' | 'playing' | 'requests'>('all');
  const [search, setSearch] = useState('');
  const [friendToUnfriend, setFriendToUnfriend] = useState<Friend | null>(null);

  const incomingRequests = requests.filter((r) => r.status === 'pending');

  const filtered = friends.filter((f) => {
    const matchesSearch = f.username.toLowerCase().includes(search.toLowerCase());
    if (filter === 'online') return matchesSearch && (f.status === 'online' || f.status === 'playing');
    if (filter === 'playing') return matchesSearch && f.status === 'playing';
    return matchesSearch;
  });

  const handleAddClick = () => {
    if (isGuest) {
      sounds.playBack();
      if (onPromptSignIn) onPromptSignIn();
      return;
    }
    sounds.playSelect();
    onOpenAddFriend();
  };

  return (
    <div className="relative z-10 w-full px-6 sm:px-8 py-4 select-none max-w-5xl mx-auto">
      {/* Guest Lock Notice */}
      {isGuest && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-950/30 border border-amber-600/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Guest Mode Active</h3>
              <p className="text-xs text-amber-300/80">
                Guests cannot add friends. Create or log into an Atlas account to add and manage your friends list!
              </p>
            </div>
          </div>
          {onPromptSignIn && (
            <button
              onClick={onPromptSignIn}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-xs font-black uppercase tracking-wider rounded-xl transition-colors cursor-pointer shrink-0"
            >
              Sign Up / Log In
            </button>
          )}
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-wider flex items-center gap-3">
            <Users className="w-7 h-7 text-cyan-400" />
            <span>Friends Network</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Browse registered players, send requests, and join unblocked gaming sessions.
          </p>
        </div>

        {isGuest ? (
          <button
            onClick={handleAddClick}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-bold uppercase tracking-wider rounded-xl border border-amber-500/30 transition-all cursor-pointer w-fit"
            title="Sign in required to add friends"
          >
            <Lock className="w-4 h-4" />
            <span>Browse Friends (Sign-in required)</span>
          </button>
        ) : (
          <button
            onClick={handleAddClick}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#00A2FF] hover:bg-blue-600 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-lg transition-all active:scale-95 w-fit cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Open Friend Browser</span>
          </button>
        )}
      </div>

      {/* Incoming Requests Banner */}
      {incomingRequests.length > 0 && !isGuest && (
        <div className="mb-6 p-4 rounded-xl bg-cyan-950/40 border border-cyan-700/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xs">
              {incomingRequests.length}
            </div>
            <div>
              <div className="text-xs font-bold text-white">
                You have {incomingRequests.length} pending friend request{incomingRequests.length > 1 ? 's' : ''}!
              </div>
              <div className="text-[11px] text-cyan-300/80">
                Review and accept them to add players to your friend list.
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              sounds.playSelect();
              setFilter('requests');
            }}
            className="px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold rounded-lg transition-colors cursor-pointer"
          >
            View Requests
          </button>
        </div>
      )}

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between mb-6">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search friends by username..."
            className="w-full bg-[#151c28] text-white text-xs pl-9 pr-3 py-2.5 rounded-xl border border-slate-700/70 focus:outline-none focus:border-[#00A2FF]"
          />
        </div>

        <div className="flex items-center gap-2 bg-[#141a26] p-1 rounded-xl border border-slate-800">
          {[
            { key: 'all', label: `All Friends (${friends.length})` },
            { key: 'online', label: `Online (${friends.filter((f) => f.status !== 'offline').length})` },
            { key: 'playing', label: `In Game (${friends.filter((f) => f.status === 'playing').length})` },
            { key: 'requests', label: `Requests (${incomingRequests.length})` },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                sounds.playSelect();
                setFilter(tab.key as any);
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                filter === tab.key
                  ? 'bg-[#00A2FF] text-white'
                  : 'text-slate-400 hover:text-white hover:bg-[#1e2638]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content: Pending Requests Tab OR Friends List */}
      {filter === 'requests' ? (
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
            Pending Incoming Requests
          </h2>
          {incomingRequests.length === 0 ? (
            <div className="text-center py-12 bg-[#131924]/60 rounded-xl border border-slate-800 text-xs text-slate-400">
              No pending friend requests.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {incomingRequests.map((req) => (
                <div
                  key={req.id}
                  className="p-3.5 bg-[#151c28] rounded-xl border border-slate-700 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-black border border-slate-700 shrink-0">
                      <img src={req.fromPic} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-white">{req.fromUser}</h3>
                      <span className="text-[10px] text-cyan-400">Wants to be your friend</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        sounds.playSelect();
                        if (onAcceptRequest) onAcceptRequest(req);
                      }}
                      className="px-3 py-1.5 bg-[#00B06F] hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" /> Accept
                    </button>
                    <button
                      onClick={() => {
                        sounds.playBack();
                        if (onDeclineRequest) onDeclineRequest(req.id);
                      }}
                      className="px-2.5 py-1.5 bg-[#252c3e] hover:bg-red-950 hover:text-red-400 text-slate-300 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      <UserX className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-[#131924]/60 rounded-2xl border border-slate-800">
          <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-300 font-bold mb-1">No friends in this view</p>
          <p className="text-slate-400 text-xs mb-4">
            {friends.length === 0
              ? 'Your friends list is currently empty. Open the Friend Browser to find and request players on Atlas!'
              : 'No friends match the selected filter.'}
          </p>
          {!isGuest && (
            <button
              onClick={handleAddClick}
              className="px-5 py-2 bg-[#00A2FF] hover:bg-blue-600 text-white text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-2 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" /> Open Friend Browser
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {filtered.map((friend) => (
            <div
              key={friend.id}
              className="p-4 bg-[#151c28] rounded-xl border border-slate-800/80 shadow-md flex items-center justify-between group hover:border-slate-700 transition-all"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-inner relative overflow-hidden bg-black border border-slate-700"
                >
                  {friend.avatarPic ? (
                    <img src={friend.avatarPic} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ backgroundColor: friend.avatarBg }}
                    >
                      {friend.username.charAt(0).toUpperCase()}
                    </div>
                  )}

                  {/* Status dot indicator */}
                  <div
                    className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#151c28] ${
                      friend.status === 'playing'
                        ? 'bg-cyan-400 ring-1 ring-cyan-300'
                        : friend.status === 'online'
                        ? 'bg-emerald-400 ring-1 ring-emerald-300'
                        : 'bg-slate-500'
                    }`}
                  />
                </div>

                <div>
                  <h3 className="text-sm font-bold text-white truncate max-w-[130px]">
                    {friend.username}
                  </h3>
                  <div className="text-xs text-slate-400">
                    {friend.status === 'playing' ? (
                      <span className="text-cyan-400 font-semibold truncate block max-w-[130px]">
                        Playing {friend.currentGame}
                      </span>
                    ) : friend.status === 'online' ? (
                      <span className="text-emerald-400 font-medium">Online</span>
                    ) : (
                      <span>Offline</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5">
                {friend.status === 'playing' && (
                  <button
                    onClick={() => {
                      sounds.playLaunch();
                      const targetGame = games.find(
                        (g) => g.title.toLowerCase() === friend.currentGame?.toLowerCase()
                      );
                      if (targetGame) {
                        onPlayGame(targetGame);
                      } else {
                        onPlayGame({
                          id: `join-${friend.id}`,
                          title: friend.currentGame || 'Custom Game',
                          url: 'https://play2048.co/',
                          thumbnail:
                            'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80',
                          genre: 'Arcade',
                          description: `Playing with ${friend.username}`,
                          addedAt: new Date().toISOString(),
                          playedCount: 1,
                          favorite: false,
                        });
                      }
                    }}
                    className="p-2 rounded-lg bg-[#00B06F] hover:bg-[#00c87e] text-white shadow transition-all cursor-pointer"
                    title={`Join ${friend.username} in ${friend.currentGame}`}
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                  </button>
                )}

                <button
                  onClick={() => {
                    sounds.playSelect();
                    setFriendToUnfriend(friend);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-[#1f2636] hover:bg-red-950 hover:text-red-400 text-slate-400 transition-colors cursor-pointer flex items-center gap-1 text-xs font-semibold"
                  title={`Unfriend ${friend.username}`}
                >
                  <UserX className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Unfriend</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Unfriend Confirmation Modal */}
      {friendToUnfriend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
          <div className="w-full max-w-sm bg-[#161c28] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-red-400 font-black text-sm uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span>Unfriend Player</span>
              </div>
              <button
                onClick={() => {
                  sounds.playBack();
                  setFriendToUnfriend(null);
                }}
                className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-5">
              Are you sure you want to unfriend <strong className="text-white font-bold">{friendToUnfriend.username}</strong>?
              This will remove each other from both players' friends lists. You can send a new friend request anytime.
            </p>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  sounds.playBack();
                  setFriendToUnfriend(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                onClick={() => {
                  sounds.playExplosion();
                  onRemoveFriend(friendToUnfriend.id);
                  setFriendToUnfriend(null);
                }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <UserX className="w-3.5 h-3.5" />
                <span>Yes, Unfriend</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
