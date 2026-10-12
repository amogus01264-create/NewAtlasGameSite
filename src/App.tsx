import { useState, useEffect, useCallback, useMemo } from 'react';
import { CustomGame, Friend, FriendRequest, NavTab, NetworkUser, UserProfile, TabCloakConfig, LiveStream } from './types';
import { sounds } from './services/soundEffects';
import { HeaderNav } from './components/HeaderNav';
import { HomeScreen } from './components/HomeScreen';
import { GamesScreen } from './components/GamesScreen';
import { StreamsScreen } from './components/StreamsScreen';
import { FriendsScreen } from './components/FriendsScreen';
import { AddGameModal } from './components/AddGameModal';
import { FriendBrowserModal } from './components/FriendBrowserModal';
import { GameRunnerModal } from './components/GameRunnerModal';
import { SettingsModal } from './components/SettingsModal';
import { TabCloakModal } from './components/TabCloakModal';
import { StartStreamModal } from './components/StartStreamModal';
import { LiveStreamPlayerModal } from './components/LiveStreamPlayerModal';
import { StealthView } from './components/StealthView';
import { SignInModal } from './components/SignInModal';
import { MISSING_TEXTURE_DATA_URL } from './utils/assets';
import { getSavedTabCloak, applyTabCloak } from './services/tabCloak';
import { testConnection } from './services/firebase';
import { subscribeToActiveStreams, endLiveStream } from './services/streamingService';
import {
  getSavedSession,
  saveSession,
  getFriendsForUser,
  saveFriendsForUser,
  getRequestsForUser,
  saveRequestsForUser,
  subscribeToFriends,
  subscribeToRequests,
  sendFriendRequestCloud,
  acceptFriendRequestCloud,
  declineFriendRequestCloud,
  unfriendUsersAsync,
  unfriendUsers,
} from './services/userService';

export const PRESET_GAMES: CustomGame[] = [
  {
    id: 'game-geo',
    title: 'Geometry Dash',
    url: 'https://truffled.lol/games/geo/index.html',
    thumbnail: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80',
    genre: 'Action',
    description: 'Jump, fly, and flip your way through rhythm-based obstacles and neon caverns.',
    addedAt: '2026-09-24T00:00:00.000Z',
    playedCount: 1,
    favorite: true,
    launchMode: 'direct',
    isPreset: true,
  },
  {
    id: 'game-portal2',
    title: 'Portal 2',
    url: 'https://truffled.lol/games/portal2/portal2/index.html',
    thumbnail: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600&auto=format&fit=crop&q=80',
    genre: 'Puzzle',
    description: 'Break the laws of spatial physics with your handheld portal device in Aperture Science.',
    addedAt: '2026-10-11T00:00:00.000Z',
    playedCount: 0,
    favorite: true,
    launchMode: 'direct',
    isPreset: true,
  },
  {
    id: 'game-boir',
    title: 'The Binding of Isaac: Rebirth',
    url: 'https://truffled.lol/games/boir/index.html',
    thumbnail: 'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?w=600&auto=format&fit=crop&q=80',
    genre: 'Roguelike',
    description: 'A randomly generated action RPG shooter with heavy roguelike dungeon elements.',
    addedAt: '2026-10-11T00:00:00.000Z',
    playedCount: 0,
    favorite: true,
    launchMode: 'direct',
    isPreset: true,
  },
];

export const isGamePreset = (game: CustomGame): boolean => {
  if (game.isPreset) return true;
  return PRESET_GAMES.some(
    (p) => p.id === game.id || p.url?.trim().toLowerCase() === game.url?.trim().toLowerCase()
  );
};

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavTab>('HOME');
  const [activeGame, setActiveGame] = useState<CustomGame | null>(null);
  const [addGameOpen, setAddGameOpen] = useState(false);
  const [friendBrowserOpen, setFriendBrowserOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tabCloakOpen, setTabCloakOpen] = useState(false);
  const [startStreamOpen, setStartStreamOpen] = useState(false);
  const [streamGameTarget, setStreamGameTarget] = useState<CustomGame | null>(null);
  const [watchingStream, setWatchingStream] = useState<LiveStream | null>(null);
  const [myActiveStream, setMyActiveStream] = useState<LiveStream | null>(null);
  const [activeStreams, setActiveStreams] = useState<LiveStream[]>([]);
  const [stealthActive, setStealthActive] = useState(false);
  const [isMuted, setIsMuted] = useState(sounds.isMuted());
  const [cloakConfig, setCloakConfig] = useState<TabCloakConfig>(getSavedTabCloak);

  // Apply saved tab disguise on startup and on change
  useEffect(() => {
    applyTabCloak(cloakConfig);
  }, [cloakConfig]);

  // Initial Firestore connection validation
  useEffect(() => {
    testConnection().catch(console.warn);
  }, []);

  // User Profile & Authentication State (Checks saved session first)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    try {
      const savedSession = getSavedSession();
      if (savedSession) {
        if (!savedSession.gamerpic) savedSession.gamerpic = MISSING_TEXTURE_DATA_URL;
        return savedSession;
      }
      return null;
    } catch {
      return null;
    }
  });

  // User's games: preserves preset games (Geometry Dash) and user-added custom games
  const [games, setGames] = useState<CustomGame[]>(() => {
    try {
      const saved = localStorage.getItem('atlas_custom_games');
      if (saved) {
        const parsed: CustomGame[] = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Filter out old starter games
          const filtered = parsed.filter(
            (g) => g.id !== 'starter-1' && g.id !== 'starter-2' && g.id !== 'starter-3'
          );
          // Normalize preset games with isPreset: true and current title
          const normalized = filtered.map((g) => {
            const matched = PRESET_GAMES.find(
              (p) => p.id === g.id || p.url?.toLowerCase() === g.url?.toLowerCase()
            );
            if (matched) {
              return {
                ...matched,
                playedCount: g.playedCount ?? matched.playedCount,
                favorite: g.favorite ?? matched.favorite,
                lastPlayed: g.lastPlayed,
              };
            }
            if (g.id === 'game-geo' || g.title === 'Geometry Dash WASM') {
              return { ...g, title: 'Geometry Dash', isPreset: true };
            }
            return g;
          });
          // Ensure all PRESET_GAMES are present
          for (const preset of PRESET_GAMES) {
            const exists = normalized.some(
              (g) => g.id === preset.id || g.url?.toLowerCase() === preset.url.toLowerCase()
            );
            if (!exists) {
              normalized.push(preset);
            }
          }
          localStorage.setItem('atlas_custom_games', JSON.stringify(normalized));
          return normalized;
        }
      }
      localStorage.setItem('atlas_custom_games', JSON.stringify(PRESET_GAMES));
      return PRESET_GAMES;
    } catch {
      return PRESET_GAMES;
    }
  });

  // Account-scoped friends list: Solves "when changing accounts, your friends carry over"
  const [friends, setFriends] = useState<Friend[]>(() => {
    if (!userProfile || userProfile.isGuest) return [];
    return getFriendsForUser(userProfile.gamertag);
  });

  // Account-scoped friend requests
  const [requests, setRequests] = useState<FriendRequest[]>(() => {
    if (!userProfile || userProfile.isGuest) return [];
    return getRequestsForUser(userProfile.gamertag);
  });

  // When active user account changes, subscribe to realtime friends and requests from Cloud Firestore
  useEffect(() => {
    if (userProfile && !userProfile.isGuest) {
      // 1. Initial cached load for immediate UI display
      setFriends(getFriendsForUser(userProfile.gamertag));
      setRequests(getRequestsForUser(userProfile.gamertag));

      // 2. Realtime sync with Cloud Firestore
      const unsubFriends = subscribeToFriends(userProfile.gamertag, (liveFriends) => {
        setFriends(liveFriends);
      });
      const unsubRequests = subscribeToRequests(userProfile.gamertag, (liveRequests) => {
        setRequests(liveRequests);
      });

      return () => {
        unsubFriends();
        unsubRequests();
      };
    } else {
      setFriends([]);
      setRequests([]);
    }
  }, [userProfile?.gamertag, userProfile?.isGuest]);

  // Realtime subscription to live game broadcasts on Atlas
  useEffect(() => {
    const unsubStreams = subscribeToActiveStreams(userProfile, friends, (streams) => {
      setActiveStreams(streams);
      if (myActiveStream) {
        const stillLive = streams.find((s) => s.id === myActiveStream.id && s.status === 'live');
        if (!stillLive) {
          setMyActiveStream(null);
        }
      }
    });
    return unsubStreams;
  }, [userProfile?.gamertag, friends, myActiveStream?.id]);

  // Games persistence
  useEffect(() => {
    localStorage.setItem('atlas_custom_games', JSON.stringify(games));
  }, [games]);

  // Auth Actions
  const handleSignIn = (profile: UserProfile) => {
    setUserProfile(profile);
  };

  const handleLogOut = () => {
    setUserProfile(null);
    saveSession(null);
    sounds.playBack();
  };

  // Actions: Games
  const handleAddGame = (newGameData: Omit<CustomGame, 'id' | 'addedAt' | 'playedCount' | 'favorite'>) => {
    const newGame: CustomGame = {
      ...newGameData,
      id: `game-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      addedAt: new Date().toISOString(),
      playedCount: 0,
      favorite: false,
    };
    setGames((prev) => [newGame, ...prev]);
  };

  const handleDeleteGame = (id: string) => {
    setGames((prev) => {
      const target = prev.find((g) => g.id === id);
      if (target && isGamePreset(target)) {
        return prev;
      }
      const updated = prev.filter((g) => g.id !== id);
      localStorage.setItem('atlas_custom_games', JSON.stringify(updated));
      return updated;
    });
  };

  const handlePlayGame = (game: CustomGame) => {
    sounds.playLaunch();
    setActiveGame(game);
    setGames((prev) =>
      prev.map((g) =>
        g.id === game.id
          ? { ...g, playedCount: (g.playedCount || 0) + 1, lastPlayed: new Date().toISOString() }
          : g
      )
    );
  };

  // Actions: Friend Requests & Approval Flow (Cloud Synced)
  const handleSendRequest = (targetUser: NetworkUser) => {
    if (!userProfile || userProfile.isGuest) return;

    const newReq: FriendRequest = {
      id: `req-${Date.now()}`,
      fromUser: userProfile.gamertag,
      toUser: targetUser.username,
      fromPic: userProfile.gamerpic || MISSING_TEXTURE_DATA_URL,
      toPic: targetUser.avatarPic,
      timestamp: new Date().toISOString(),
      status: 'pending',
    };

    // Add to sender's outgoing requests state and persist locally
    setRequests((prev) => [...prev, newReq]);

    // Send to Cloud Firestore so the recipient on their phone or PC gets notified in real time!
    sendFriendRequestCloud(newReq).catch(console.error);
  };

  const handleAcceptRequest = (req: FriendRequest) => {
    if (!userProfile || userProfile.isGuest) return;

    // Add to current user's friends list
    const newFriend: Friend = {
      id: `friend-${Date.now()}`,
      username: req.fromUser,
      status: 'online',
      avatarBg: '#00A2FF',
      avatarPic: req.fromPic || MISSING_TEXTURE_DATA_URL,
      addedAt: new Date().toISOString(),
    };

    setFriends((prev) => {
      if (prev.some((f) => f.username.toLowerCase() === req.fromUser.toLowerCase())) {
        return prev;
      }
      return [...prev, newFriend];
    });

    // Remove pending request locally
    setRequests((prev) => prev.filter((r) => r.id !== req.id));

    // Commit friendship to Cloud Firestore for both players!
    acceptFriendRequestCloud(req, userProfile).catch(console.error);
  };

  const handleDeclineRequest = (requestId: string) => {
    if (!userProfile) return;
    setRequests((prev) => prev.filter((r) => r.id !== requestId));
    declineFriendRequestCloud(requestId).catch(console.error);
  };

  const handleRemoveFriend = (friendId: string) => {
    const friendToRemove = friends.find((f) => f.id === friendId);
    if (!friendToRemove) return;

    // Remove from current user state
    setFriends((prev) => prev.filter((f) => f.id !== friendId));

    // Remove bidirectionally from both accounts in persistent Cloud Firestore & local storage
    if (userProfile && !userProfile.isGuest) {
      unfriendUsersAsync(userProfile.gamertag, friendToRemove.username).catch(console.error);
    }
  };

  // Actions: Audio
  const handleToggleMute = () => {
    const next = sounds.toggleMute();
    setIsMuted(next);
  };

  // Actions: Clear ONLY custom games (never games preset by developer/user like Geometry Dash)
  const handleClearCustomGames = () => {
    setGames((prev) => {
      // Keep only preset games
      const preservedPresets: CustomGame[] = prev
        .filter((g) => isGamePreset(g))
        .map((g) => ({ ...g, isPreset: true }));
      // Ensure all PRESET_GAMES are in the list
      for (const preset of PRESET_GAMES) {
        if (!preservedPresets.some((p) => p.id === preset.id || p.url?.toLowerCase() === preset.url.toLowerCase())) {
          preservedPresets.unshift(preset);
        }
      }
      localStorage.setItem('atlas_custom_games', JSON.stringify(preservedPresets));
      return preservedPresets;
    });
  };

  // Actions: Reset Data (clears friends and custom games, preserving preset games)
  const handleResetData = () => {
    setGames(PRESET_GAMES);
    setFriends([]);
    if (userProfile && !userProfile.isGuest) {
      saveFriendsForUser(userProfile.gamertag, []);
      saveRequestsForUser(userProfile.gamertag, []);
    }
    localStorage.setItem('atlas_custom_games', JSON.stringify(PRESET_GAMES));
  };

  // Tabs navigation
  const tabList: NavTab[] = useMemo(() => ['HOME', 'GAMES', 'STREAMS', 'FRIENDS'], []);
  const cycleTab = useCallback(
    (direction: 'left' | 'right') => {
      sounds.playBumper();
      setCurrentTab((curr) => {
        const idx = tabList.indexOf(curr);
        if (direction === 'left') {
          return tabList[(idx - 1 + tabList.length) % tabList.length];
        } else {
          return tabList[(idx + 1) % tabList.length];
        }
      });
    },
    [tabList]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.key === 'p' || e.key === 'P' || e.key === '`') {
        e.preventDefault();
        setStealthActive((s) => !s);
      } else if (e.key === 'Escape') {
        if (addGameOpen) setAddGameOpen(false);
        else if (friendBrowserOpen) setFriendBrowserOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
        else if (tabCloakOpen) setTabCloakOpen(false);
        else if (startStreamOpen) setStartStreamOpen(false);
        else if (watchingStream) setWatchingStream(null);
        else if (activeGame) setActiveGame(null);
        else if (stealthActive) setStealthActive(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [addGameOpen, friendBrowserOpen, settingsOpen, tabCloakOpen, startStreamOpen, watchingStream, activeGame, stealthActive]);

  // If user is not signed in and has no saved session, show the SignInModal
  if (!userProfile) {
    return <SignInModal onSignIn={handleSignIn} />;
  }

  return (
    <div className="relative min-h-screen flex flex-col bg-[#070a10] text-white overflow-x-hidden font-sans">
      {/* Ambient Blue Glow Background */}
      <div className="atlas-neon-grid" />

      {/* Panic / Stealth Camouflage Screen */}
      {stealthActive && <StealthView onExit={() => setStealthActive(false)} />}

      {/* Active Broadcaster Sticky Banner (If current user is streaming) */}
      {myActiveStream && myActiveStream.status === 'live' && (
        <div className="relative z-30 w-full bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white px-6 py-2.5 shadow-2xl flex items-center justify-between animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-white animate-ping shrink-0" />
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider">
                You Are LIVE:
              </span>
              <span className="text-xs font-bold truncate max-w-xs sm:max-w-md">
                "{myActiveStream.title}"
              </span>
              <span className="text-[10px] font-extrabold bg-black/40 px-2 py-0.5 rounded-full uppercase hidden sm:inline">
                {myActiveStream.visibility === 'friends' ? '👥 Friends Only' : '🌐 Public'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setWatchingStream(myActiveStream)}
              className="px-3 py-1 bg-white hover:bg-slate-100 text-black text-xs font-black uppercase tracking-wider rounded-lg transition-colors cursor-pointer shadow"
            >
              Stream Room & Chat
            </button>
            <button
              onClick={async () => {
                if (confirm('End your live broadcast?')) {
                  sounds.playExplosion();
                  await endLiveStream(myActiveStream.id);
                  setMyActiveStream(null);
                }
              }}
              className="px-3 py-1 bg-black/50 hover:bg-black/70 text-white text-xs font-bold rounded-lg border border-white/30 transition-colors cursor-pointer"
            >
              End Stream
            </button>
          </div>
        </div>
      )}

      {/* Header Nav with Atlas Branding */}
      <HeaderNav
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        userProfile={userProfile}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        onTriggerStealth={() => setStealthActive(true)}
        onOpenAddGame={() => setAddGameOpen(true)}
        onOpenAddFriend={() => {
          if (userProfile.isGuest) {
            handleLogOut();
          } else {
            setFriendBrowserOpen(true);
          }
        }}
        onOpenTabCloak={() => setTabCloakOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenStartStream={() => {
          setStreamGameTarget(activeGame || null);
          setStartStreamOpen(true);
        }}
        activeStreamsCount={activeStreams.length}
        cloakConfig={cloakConfig}
        onLogOut={handleLogOut}
        onPromptSignIn={handleLogOut}
      />

      {/* Main Dynamic View */}
      <main className="relative z-10 flex-1 w-full pb-14">
        {currentTab === 'HOME' && (
          <HomeScreen
            games={games}
            friends={friends}
            userProfile={userProfile}
            streams={activeStreams}
            onPlayGame={handlePlayGame}
            onWatchStream={setWatchingStream}
            onOpenAddGame={() => setAddGameOpen(true)}
            onOpenAddFriend={() => {
              if (userProfile.isGuest) {
                handleLogOut();
              } else {
                setFriendBrowserOpen(true);
              }
            }}
            onOpenSettings={() => setSettingsOpen(true)}
            onViewAllGames={() => setCurrentTab('GAMES')}
            onViewAllFriends={() => setCurrentTab('FRIENDS')}
            onViewAllStreams={() => setCurrentTab('STREAMS')}
            onPromptSignIn={handleLogOut}
          />
        )}

        {currentTab === 'GAMES' && (
          <GamesScreen
            games={games}
            onPlayGame={handlePlayGame}
            onOpenAddGame={() => setAddGameOpen(true)}
            onDeleteGame={handleDeleteGame}
            onClearCustomGames={handleClearCustomGames}
          />
        )}

        {currentTab === 'STREAMS' && (
          <StreamsScreen
            streams={activeStreams}
            userProfile={userProfile}
            onWatchStream={setWatchingStream}
            onOpenStartStream={() => {
              setStreamGameTarget(null);
              setStartStreamOpen(true);
            }}
            onPromptSignIn={handleLogOut}
          />
        )}

        {currentTab === 'FRIENDS' && (
          <FriendsScreen
            friends={friends}
            games={games}
            requests={requests}
            streams={activeStreams}
            onOpenAddFriend={() => {
              if (userProfile.isGuest) {
                handleLogOut();
              } else {
                setFriendBrowserOpen(true);
              }
            }}
            onRemoveFriend={handleRemoveFriend}
            onPlayGame={handlePlayGame}
            onWatchStream={setWatchingStream}
            onAcceptRequest={handleAcceptRequest}
            onDeclineRequest={handleDeclineRequest}
            isGuest={userProfile.isGuest}
            onPromptSignIn={handleLogOut}
          />
        )}
      </main>

      {/* Add Custom Game Modal */}
      {addGameOpen && (
        <AddGameModal
          onAddGame={handleAddGame}
          onClose={() => setAddGameOpen(false)}
        />
      )}

      {/* Friend Browser Modal (Player search, verification, and friend requests) */}
      {friendBrowserOpen && !userProfile.isGuest && (
        <FriendBrowserModal
          userProfile={userProfile}
          friends={friends}
          requests={requests}
          onSendRequest={handleSendRequest}
          onAcceptRequest={handleAcceptRequest}
          onDeclineRequest={handleDeclineRequest}
          onRemoveFriend={handleRemoveFriend}
          onClose={() => setFriendBrowserOpen(false)}
        />
      )}

      {/* Settings Modal */}
      {settingsOpen && (
        <SettingsModal
          userProfile={userProfile}
          onUpdateProfile={(updated) => {
            setUserProfile(updated);
            if (updated.rememberMe) saveSession(updated);
          }}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          cloakConfig={cloakConfig}
          onUpdateCloak={setCloakConfig}
          onOpenFullCloak={() => {
            setSettingsOpen(false);
            setTabCloakOpen(true);
          }}
          onClearCustomGames={handleClearCustomGames}
          onResetData={handleResetData}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* Tab Cloaker Disguise Modal */}
      {tabCloakOpen && (
        <TabCloakModal
          currentConfig={cloakConfig}
          onConfigChange={setCloakConfig}
          onClose={() => setTabCloakOpen(false)}
        />
      )}

      {/* Sandboxed Game Player Overlay */}
      {activeGame && (
        <GameRunnerModal
          game={activeGame}
          onClose={() => setActiveGame(null)}
          onTriggerStealth={() => setStealthActive(true)}
          onStartStream={(game) => {
            setStreamGameTarget(game);
            setStartStreamOpen(true);
          }}
        />
      )}

      {/* Start Stream Modal (Broadcast live to friends or online) */}
      {startStreamOpen && (
        <StartStreamModal
          userProfile={userProfile}
          currentGame={streamGameTarget || activeGame || null}
          availableGames={games}
          onStreamStarted={(newStream) => {
            setMyActiveStream(newStream);
            setWatchingStream(newStream);
          }}
          onClose={() => {
            setStartStreamOpen(false);
            setStreamGameTarget(null);
          }}
        />
      )}

      {/* Live Stream Player & Chat Modal (Twitch/YouTube style theater) */}
      {watchingStream && (
        <LiveStreamPlayerModal
          stream={watchingStream}
          currentUser={userProfile}
          onClose={() => setWatchingStream(null)}
          onStreamEnded={(endedId) => {
            if (myActiveStream?.id === endedId) {
              setMyActiveStream(null);
            }
          }}
        />
      )}
    </div>
  );
}
