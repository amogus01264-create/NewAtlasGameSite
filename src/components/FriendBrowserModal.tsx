import React, { useState } from 'react';
import { Friend, FriendRequest, NetworkUser, UserProfile } from '../types';
import { getAllNetworkUsers, findNetworkUser } from '../services/userService';
import { X, Search, UserPlus, Clock, Check, UserX, AlertCircle, ShieldAlert } from 'lucide-react';
import { sounds } from '../services/soundEffects';

interface FriendBrowserModalProps {
  userProfile: UserProfile;
  friends: Friend[];
  requests: FriendRequest[];
  onSendRequest: (targetUser: NetworkUser) => void;
  onAcceptRequest: (request: FriendRequest) => void;
  onDeclineRequest: (requestId: string) => void;
  onRemoveFriend?: (friendId: string) => void;
  onClose: () => void;
}

export const FriendBrowserModal: React.FC<FriendBrowserModalProps> = ({
  userProfile,
  friends,
  requests,
  onSendRequest,
  onAcceptRequest,
  onDeclineRequest,
  onRemoveFriend,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'browse' | 'direct' | 'requests'>('browse');
  const [searchQuery, setSearchQuery] = useState('');
  const [directUsername, setDirectUsername] = useState('');
  const [directError, setDirectError] = useState<string | null>(null);

  // All network users excluding self
  const allUsers = getAllNetworkUsers(userProfile.gamertag);

  // Filtered browse list
  const filteredUsers = allUsers.filter((u) =>
    u.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Incoming and outgoing requests
  const incomingRequests = requests.filter(
    (r) => r.toUser.toLowerCase() === userProfile.gamertag.toLowerCase() && r.status === 'pending'
  );
  const outgoingRequests = requests.filter(
    (r) => r.fromUser.toLowerCase() === userProfile.gamertag.toLowerCase() && r.status === 'pending'
  );

  const isFriend = (username: string) =>
    friends.some((f) => f.username.toLowerCase() === username.toLowerCase());

  const hasPendingOutgoing = (username: string) =>
    outgoingRequests.some((r) => r.toUser.toLowerCase() === username.toLowerCase());

  const handleDirectAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setDirectError(null);
    const targetName = directUsername.trim();

    if (!targetName) return;

    if (targetName.toLowerCase() === userProfile.gamertag.toLowerCase()) {
      setDirectError("You cannot send a friend request to yourself.");
      sounds.playBack();
      return;
    }

    if (isFriend(targetName)) {
      setDirectError(`You are already friends with ${targetName}.`);
      sounds.playBack();
      return;
    }

    if (hasPendingOutgoing(targetName)) {
      setDirectError(`A friend request to ${targetName} is already pending.`);
      sounds.playBack();
      return;
    }

    // Verify user actually exists!
    const targetUser = findNetworkUser(targetName);
    if (!targetUser) {
      setDirectError(`User "${targetName}" does not exist on the Atlas network.`);
      sounds.playBack();
      return;
    }

    sounds.playSelect();
    onSendRequest(targetUser);
    setDirectUsername('');
    setActiveTab('requests');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md select-none">
      <div className="relative w-full max-w-xl bg-[#141824] border border-[#2b3144] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#1a2030] border-b border-[#2b3144]">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-black text-white uppercase tracking-wider">
              Friend Browser
            </h2>
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

        {/* Tab Switcher */}
        <div className="flex items-center px-6 pt-3 border-b border-slate-800 gap-2 bg-[#121622]">
          <button
            onClick={() => {
              sounds.playSelect();
              setActiveTab('browse');
            }}
            className={`pb-2.5 px-3 text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'browse'
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Browse Players ({allUsers.length})
          </button>

          <button
            onClick={() => {
              sounds.playSelect();
              setActiveTab('direct');
            }}
            className={`pb-2.5 px-3 text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'direct'
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Add by Username
          </button>

          <button
            onClick={() => {
              sounds.playSelect();
              setActiveTab('requests');
            }}
            className={`pb-2.5 px-3 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'requests'
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>Requests</span>
            {incomingRequests.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-cyan-500 text-black text-[10px] font-black flex items-center justify-center">
                {incomingRequests.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab 1: Browse Players */}
        {activeTab === 'browse' && (
          <div className="p-5 flex-1 flex flex-col overflow-hidden space-y-4">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search registered Atlas players..."
                className="w-full bg-[#121622] text-white text-xs pl-9 pr-3 py-2.5 rounded-xl border border-slate-700/70 focus:outline-none focus:border-[#00A2FF]"
              />
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 max-h-[50vh]">
              {allUsers.length === 0 ? (
                <div className="text-center py-10 px-4 bg-[#121622] rounded-xl border border-slate-800 text-xs text-slate-400">
                  <p className="font-bold text-slate-300 mb-1">No other registered accounts found</p>
                  <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                    All bot and fake players have been removed. Create another account on this device or have friends register their usernames on Atlas to browse and add them!
                  </p>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs">
                  No registered players match "{searchQuery}".
                </div>
              ) : (
                filteredUsers.map((user) => {
                  const alreadyFriend = isFriend(user.username);
                  const isPending = hasPendingOutgoing(user.username);

                  return (
                    <div
                      key={user.username}
                      className="p-3 bg-[#182030] rounded-xl border border-slate-700/60 flex items-center justify-between hover:border-slate-600 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-black border border-slate-700 relative shrink-0">
                          <img
                            src={user.avatarPic}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                          <div
                            className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border border-black ${
                              user.status === 'playing'
                                ? 'bg-cyan-400'
                                : user.status === 'online'
                                ? 'bg-emerald-400'
                                : 'bg-slate-500'
                            }`}
                          />
                        </div>

                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-white">
                              {user.username}
                            </span>
                            {user.isRegisteredUser && (
                              <span className="text-[9px] px-1.5 py-0.2 bg-cyan-950/80 border border-cyan-800 text-cyan-400 rounded font-semibold">
                                Player
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate max-w-[220px]">
                            {user.status === 'playing' ? (
                              <span className="text-cyan-400">Playing {user.currentGame}</span>
                            ) : user.status === 'online' ? (
                              <span className="text-emerald-400">Online</span>
                            ) : (
                              <span>Offline</span>
                            )}
                            {user.bio && ` · ${user.bio}`}
                          </div>
                        </div>
                      </div>

                      {/* Action */}
                      <div>
                        {alreadyFriend ? (
                          <div className="flex items-center gap-1.5">
                            <span className="px-2.5 py-1 bg-emerald-950/60 text-emerald-400 text-xs font-bold rounded-lg border border-emerald-800/40 inline-flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" /> Friends
                            </span>
                            {onRemoveFriend && (
                              <button
                                onClick={() => {
                                  const existingFriend = friends.find(
                                    (f) => f.username.toLowerCase() === user.username.toLowerCase()
                                  );
                                  if (existingFriend) {
                                    sounds.playExplosion();
                                    onRemoveFriend(existingFriend.id);
                                  }
                                }}
                                className="px-2.5 py-1 bg-[#22293a] hover:bg-red-950 hover:text-red-400 text-slate-400 text-xs font-bold rounded-lg border border-slate-700 hover:border-red-800/60 transition-colors cursor-pointer inline-flex items-center gap-1"
                                title={`Unfriend ${user.username}`}
                              >
                                <UserX className="w-3.5 h-3.5" />
                                <span>Unfriend</span>
                              </button>
                            )}
                          </div>
                        ) : isPending ? (
                          <span className="px-3 py-1.5 bg-slate-800 text-slate-400 text-xs font-bold rounded-lg inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-amber-400" /> Pending...
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              sounds.playSelect();
                              onSendRequest(user);
                            }}
                            className="px-3.5 py-1.5 bg-[#00A2FF] hover:bg-blue-600 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 active:scale-95"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span>Add</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Direct Search & Validate */}
        {activeTab === 'direct' && (
          <div className="p-6 space-y-4">
            <p className="text-xs text-slate-300">
              Enter an exact username on the Atlas network to send a friend request. They must exist on the network to be added.
            </p>

            <form onSubmit={handleDirectAdd} className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Atlas Username
                </label>
                <input
                  type="text"
                  required
                  value={directUsername}
                  onChange={(e) => {
                    setDirectUsername(e.target.value);
                    setDirectError(null);
                  }}
                  placeholder="e.g. ShadowPulse, CyberValkyrie..."
                  className="w-full bg-[#121622] text-white text-xs px-3.5 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-[#00A2FF]"
                />
              </div>

              {directError && (
                <div className="p-3 bg-red-950/40 border border-red-800/50 rounded-xl flex items-center gap-2 text-red-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{directError}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2.5 bg-[#00A2FF] hover:bg-blue-600 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                <span>Send Friend Request</span>
              </button>
            </form>
          </div>
        )}

        {/* Tab 3: Pending Requests (Incoming & Outgoing) */}
        {activeTab === 'requests' && (
          <div className="p-5 flex-1 overflow-y-auto space-y-5 max-h-[50vh]">
            {/* Incoming Requests */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                Incoming Friend Requests ({incomingRequests.length})
              </h3>
              {incomingRequests.length === 0 ? (
                <div className="p-4 bg-[#121622] rounded-xl text-center text-xs text-slate-500 border border-slate-800">
                  No incoming requests at this moment.
                </div>
              ) : (
                <div className="space-y-2">
                  {incomingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="p-3 bg-[#182030] rounded-xl border border-slate-700/80 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full overflow-hidden bg-black border border-slate-700 shrink-0">
                          <img src={req.fromPic} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white">{req.fromUser}</div>
                          <div className="text-[10px] text-slate-400">
                            Sent a friend request
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            sounds.playSelect();
                            onAcceptRequest(req);
                          }}
                          className="px-3 py-1.5 bg-[#00B06F] hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" /> Accept
                        </button>
                        <button
                          onClick={() => {
                            sounds.playBack();
                            onDeclineRequest(req.id);
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

            {/* Outgoing Requests */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                Outgoing Pending Requests ({outgoingRequests.length})
              </h3>
              {outgoingRequests.length === 0 ? (
                <div className="p-4 bg-[#121622] rounded-xl text-center text-xs text-slate-500 border border-slate-800">
                  No pending sent requests.
                </div>
              ) : (
                <div className="space-y-2">
                  {outgoingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="p-3 bg-[#182030] rounded-xl border border-slate-800 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5">
                        <Clock className="w-4 h-4 text-amber-400" />
                        <div>
                          <div className="text-xs font-bold text-white">{req.toUser}</div>
                          <div className="text-[10px] text-slate-400">
                            Awaiting response...
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-amber-400 font-semibold">
                          Pending Approval
                        </span>
                        <button
                          onClick={() => {
                            sounds.playBack();
                            onDeclineRequest(req.id);
                          }}
                          className="px-2 py-1 bg-[#252c3e] hover:bg-red-950 hover:text-red-400 text-slate-400 text-xs font-bold rounded-lg border border-slate-700 hover:border-red-800/60 transition-colors cursor-pointer"
                          title="Cancel sent request"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
