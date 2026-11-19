import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CustomGame,
  Friend,
  FriendRequest,
  NavTab,
  NetworkUser,
  UserProfile,
  TabCloakConfig,
  LiveStream,
  MusicTrack,
  MusicPlaylist,
  RepeatMode,
} from './types';
import { sounds } from './services/soundEffects';
import { HeaderNav } from './components/HeaderNav';
import { HomeScreen } from './components/HomeScreen';
import { GamesScreen } from './components/GamesScreen';
import { MusicScreen } from './components/MusicScreen';
import { MusicPlayerBar } from './components/MusicPlayerBar';
import { MusicPlaybackHost } from './components/MusicPlaybackHost';
import { StreamsScreen } from './components/StreamsScreen';
import { FriendsScreen } from './components/FriendsScreen';
import { AddGameModal } from './components/AddGameModal';
import { FriendBrowserModal } from './components/FriendBrowserModal';
import { GameRunnerModal } from './components/GameRunnerModal';
import { SettingsModal } from './components/SettingsModal';
import { TabCloakModal } from './components/TabCloakModal';
import { AboutBlankPromptModal } from './components/AboutBlankPromptModal';
import { ProjectSafetyModal } from './components/ProjectSafetyModal';
import { StartStreamModal } from './components/StartStreamModal';
import { LiveStreamPlayerModal } from './components/LiveStreamPlayerModal';
import { StealthView } from './components/StealthView';
import { SignInModal } from './components/SignInModal';
import { MISSING_TEXTURE_DATA_URL } from './utils/assets';
import { Radio, Trash2, AlertCircle, Tv, Loader2, X, AlertTriangle } from 'lucide-react';
import { getSavedTabCloak, applyTabCloak, shouldPromptAboutBlankOnLaunch } from './services/tabCloak';
import { atlasStorage, safeLocalStorage } from './services/storageService';
import { testConnection } from './services/firebase';
import {
  subscribeToActiveStreams,
  endLiveStream,
  updateAtlasBroadcastContext,
} from './services/streamingService';
import {
  loadLikedTracks,
  saveLikedTracks,
  loadPlaylists,
  savePlaylists,
} from './services/musicService';
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
  clearLocalAccountsCache,
  deleteAccountAsync,
  PRESENCE_HEARTBEAT_INTERVAL_MS,
  updateUserPresenceAsync,
  sendOfflinePresenceBeacon,
  updateUserProfileAsync,
  subscribeToOwnAccount,
  isDefaultOrLegacyAvatar,
  sanitizeAvatarUrl,
} from './services/userService';

export const PRESET_GAMES: CustomGame[] = [
  {
    id: 'game-boir',
    title: 'The Binding of Isaac: Repentance+',
    url: '/assets/aistudio/boir_a5687e3f.html',
    thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80',
    genre: 'Roguelike',
    description: 'Top-down roguelike dungeon crawler. Isaac flees into the unknown depths facing hordes of monsters with bizarre treasures.',
    addedAt: '2026-10-24T00:00:00.000Z',
    playedCount: 1,
    favorite: true,
    launchMode: 'direct',
    isPreset: true,
  },
  {
    id: 'game-geo',
    title: 'Geometry Dash',
    url: '/assets/aistudio/geo_6223f732.html',
    thumbnail: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80',
    genre: 'Action',
    description: 'Jump, fly, and flip your way through rhythm-based neon obstacles and geometric caverns with electronic soundtracks.',
    addedAt: '2026-10-24T00:00:00.000Z',
    playedCount: 0,
    favorite: true,
    launchMode: 'direct',
    isPreset: true,
  },
  {
    id: 'game-portal2',
    title: 'Portal 2',
    url: '/assets/aistudio/portal2_c65bf430.html',
    thumbnail: 'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?w=600&auto=format&fit=crop&q=80',
    genre: 'Puzzle',
    description: 'Aperture Science first-person puzzle platformer. Navigate mind-bending test chambers using dual quantum portal technology.',
    addedAt: '2026-10-24T00:00:00.000Z',
    playedCount: 0,
    favorite: true,
    launchMode: 'direct',
    isPreset: true,
  },
];

export const isGamePreset = (game: CustomGame): boolean => {
  return PRESET_GAMES.some((p) => p.id === game.id);
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
  const [aboutBlankPromptOpen, setAboutBlankPromptOpen] = useState(() => shouldPromptAboutBlankOnLaunch());
  const [safetyModalOpen, setSafetyModalOpen] = useState(false);
  const [streamLimitModal, setStreamLimitModal] = useState<{ open: boolean; stream: LiveStream | null }>({
    open: false,
    stream: null,
  });
  const [confirmDeleteSelfAccountModal, setConfirmDeleteSelfAccountModal] = useState(false);
  const [isDeletingSelfAccount, setIsDeletingSelfAccount] = useState(false);

  // Global Ad-Free Multi-Site Music Player State
  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(null);
  const [playNonce, setPlayNonce] = useState(0);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [isMusicBuffering, setIsMusicBuffering] = useState(false);
  const [musicQueue, setMusicQueue] = useState<MusicTrack[]>([]);
  const [musicQueueIndex, setMusicQueueIndex] = useState(-1);
  const [musicShuffle, setMusicShuffle] = useState(false);
  const [musicRepeat, setMusicRepeat] = useState<RepeatMode>('off');
  const [musicVolume, setMusicVolume] = useState(80);
  const [musicMuted, setMusicMuted] = useState(false);
  const [musicCurrentTimeSec, setMusicCurrentTimeSec] = useState(0);
  const [musicDurationSec, setMusicDurationSec] = useState(0);
  const [musicSeekSignal, setMusicSeekSignal] = useState<{ seq: number; timeSec: number } | null>(null);
  const [musicError, setMusicError] = useState<string | null>(null);
  const [musicInitialSection, setMusicInitialSection] = useState<'discover' | 'queue'>('discover');
  const [likedTracks, setLikedTracks] = useState<MusicTrack[]>([]);
  const [musicPlaylists, setMusicPlaylists] = useState<MusicPlaylist[]>([]);

  // Apply saved tab disguise on startup and on change
  useEffect(() => {
    applyTabCloak(cloakConfig);
  }, [cloakConfig]);

  // Initial Firestore connection validation & auto-prune stale oversized storage
  useEffect(() => {
    safeLocalStorage.autoPruneStorage();
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

  // User's games: loads original OG games and user-added custom games
  const [games, setGames] = useState<CustomGame[]>(() => {
    try {
      const saved = atlasStorage.getItemSync('atlas_custom_games') || safeLocalStorage.getItem('atlas_custom_games');
      if (saved) {
        const parsed: CustomGame[] = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Keep genuine user custom games (not old synthetic /games/ placeholders)
          const userCustoms = parsed.filter((g) => {
            const u = (g.url || '').toLowerCase();
            const id = (g.id || '').toLowerCase();
            if (
              u.includes('/games/') ||
              id === 'game-2048' ||
              id === 'game-hextris' ||
              id === 'game-snake' ||
              id === 'starter-1' ||
              id === 'starter-2' ||
              id === 'starter-3' ||
              PRESET_GAMES.some((p) => p.id === g.id)
            ) {
              return false;
            }
            return true;
          });
          const combined = [...PRESET_GAMES, ...userCustoms];
          atlasStorage.setItemSync('atlas_custom_games', JSON.stringify(combined));
          return combined;
        }
      }
      atlasStorage.setItemSync('atlas_custom_games', JSON.stringify(PRESET_GAMES));
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

      // 3. Keep signed-in user's own avatar synced with Cloud Firestore without clobbering local custom images
      let syncedLocalUp = false;
      const unsubOwn = subscribeToOwnAccount(userProfile.gamertag, (acc) => {
        if (!acc) return;
        const cloudPic = sanitizeAvatarUrl(acc.gamerpic);
        setUserProfile((prev) => {
          if (!prev || prev.isGuest) return prev;
          const localHasCustom = !isDefaultOrLegacyAvatar(prev.gamerpic);
          const cloudHasCustom = !isDefaultOrLegacyAvatar(cloudPic);

          if (localHasCustom && !cloudHasCustom && !syncedLocalUp) {
            syncedLocalUp = true;
            updateUserProfileAsync(prev.gamertag, { gamerpic: prev.gamerpic }).catch(() => null);
            return prev;
          }

          if (cloudHasCustom && prev.gamerpic !== cloudPic) {
            const next = { ...prev, gamerpic: cloudPic };
            if (next.rememberMe || getSavedSession()?.gamertag?.toLowerCase() === next.gamertag.toLowerCase()) {
              saveSession(next);
            }
            return next;
          }

          if (!localHasCustom && prev.gamerpic !== MISSING_TEXTURE_DATA_URL) {
            const next = { ...prev, gamerpic: MISSING_TEXTURE_DATA_URL };
            if (next.rememberMe || getSavedSession()?.gamertag?.toLowerCase() === next.gamertag.toLowerCase()) {
              saveSession(next);
            }
            return next;
          }

          return prev;
        });
      });

      return () => {
        unsubFriends();
        unsubRequests();
        unsubOwn();
      };
    } else {
      setFriends([]);
      setRequests([]);
    }
  }, [userProfile?.gamertag, userProfile?.isGuest]);

  // Real-time online/playing/offline presence heartbeat & tab-close beacon
  useEffect(() => {
    if (!userProfile || userProfile.isGuest) return;
    const gamertag = userProfile.gamertag;
    const status = activeGame ? 'playing' : 'online';
    const gameTitle = activeGame?.title;

    updateUserPresenceAsync(gamertag, status, gameTitle).catch(() => null);

    const heartbeatId = window.setInterval(() => {
      updateUserPresenceAsync(gamertag, status, gameTitle).catch(() => null);
    }, PRESENCE_HEARTBEAT_INTERVAL_MS);

    const handleUnload = () => {
      sendOfflinePresenceBeacon(gamertag);
    };
    window.addEventListener('pagehide', handleUnload);
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.clearInterval(heartbeatId);
      window.removeEventListener('pagehide', handleUnload);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [userProfile?.gamertag, userProfile?.isGuest, activeGame?.id, activeGame?.title]);

  // Realtime subscription to live game broadcasts on Atlas
  const friendKeys = friends.map((f) => f.username.toLowerCase()).sort().join(',');
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
  }, [userProfile?.gamertag, friendKeys, myActiveStream?.id]);

  // Games persistence
  useEffect(() => {
    atlasStorage.setItemSync('atlas_custom_games', JSON.stringify(games));
  }, [games]);

  // Keep website-only live broadcast compositor synced with current Atlas view
  useEffect(() => {
    updateAtlasBroadcastContext({
      gamertag: userProfile?.gamertag || 'Guest',
      currentTab,
      activeGameTitle: activeGame?.title,
      activeGameGenre: activeGame?.genre,
      currentTrackTitle: currentTrack?.title,
      currentTrackArtist: currentTrack?.artist,
      currentTrackSource: currentTrack?.sourceName,
      isMusicPlaying,
      gamesCount: games.length,
    });
  }, [
    userProfile?.gamertag,
    currentTab,
    activeGame?.title,
    activeGame?.genre,
    currentTrack?.title,
    currentTrack?.artist,
    currentTrack?.sourceName,
    isMusicPlaying,
    games.length,
  ]);

  // Load user-scoped liked tracks & playlists when profile switches
  useEffect(() => {
    setLikedTracks(loadLikedTracks(userProfile?.gamertag));
    setMusicPlaylists(loadPlaylists(userProfile?.gamertag));
  }, [userProfile?.gamertag]);

  useEffect(() => {
    saveLikedTracks(userProfile?.gamertag, likedTracks);
  }, [userProfile?.gamertag, likedTracks]);

  useEffect(() => {
    savePlaylists(userProfile?.gamertag, musicPlaylists);
  }, [userProfile?.gamertag, musicPlaylists]);

  // Auth Actions
  const handleSignIn = (profile: UserProfile) => {
    setUserProfile(profile);
  };

  const handleLogOut = () => {
    if (userProfile && !userProfile.isGuest) {
      updateUserPresenceAsync(userProfile.gamertag, 'offline').catch(() => null);
    }
    setUserProfile(null);
    saveSession(null);
    sounds.playBack();
  };

  const handleDeleteAccount = async (username: string) => {
    sounds.playExplosion();
    if (myActiveStream && myActiveStream.streamer.toLowerCase() === username.toLowerCase()) {
      await endLiveStream(myActiveStream.id).catch(() => null);
      setMyActiveStream(null);
    }
    await deleteAccountAsync(username);
    if (userProfile?.gamertag.toLowerCase() === username.toLowerCase()) {
      setUserProfile(null);
      saveSession(null);
    }
    setSettingsOpen(false);
  };

  const handleConfirmSelfDeleteAccount = async () => {
    if (!userProfile) return;
    setIsDeletingSelfAccount(true);
    sounds.playExplosion();
    try {
      if (myActiveStream) {
        await endLiveStream(myActiveStream.id).catch(() => null);
        setMyActiveStream(null);
      }
      await deleteAccountAsync(userProfile.gamertag);
      setUserProfile(null);
      saveSession(null);
      setConfirmDeleteSelfAccountModal(false);
      setSettingsOpen(false);
    } catch (err) {
      console.error('Failed to delete user account:', err);
    } finally {
      setIsDeletingSelfAccount(false);
    }
  };

  // 1-Stream Limitation Check
  const handleOpenStartStream = (targetGame?: CustomGame | null) => {
    // Check if the current user is already live
    let existingStream: LiveStream | null = null;
    if (myActiveStream && myActiveStream.status === 'live') {
      existingStream = myActiveStream;
    } else if (userProfile && !userProfile.isGuest) {
      const liveMatch = activeStreams.find(
        (s) => s.streamer.toLowerCase() === userProfile.gamertag.toLowerCase() && s.status === 'live'
      );
      if (liveMatch) {
        existingStream = liveMatch;
      }
    }

    if (existingStream) {
      sounds.playBack();
      setStreamLimitModal({ open: true, stream: existingStream });
      return;
    }

    setStreamGameTarget(targetGame || null);
    setStartStreamOpen(true);
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
      const updated = prev.filter((g) => g.id !== id);
      atlasStorage.setItemSync('atlas_custom_games', JSON.stringify(updated));
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
      atlasStorage.setItemSync('atlas_custom_games', JSON.stringify(preservedPresets));
      return preservedPresets;
    });
  };

  // Actions: Reset Data (clears friends, accounts cache, and custom games, preserving preset games)
  const handleResetData = () => {
    setGames(PRESET_GAMES);
    setFriends([]);
    setRequests([]);
    if (userProfile && !userProfile.isGuest) {
      saveFriendsForUser(userProfile.gamertag, []);
      saveRequestsForUser(userProfile.gamertag, []);
    }
    clearLocalAccountsCache();
    atlasStorage.setItemSync('atlas_custom_games', JSON.stringify(PRESET_GAMES));
  };

  // Music Player Actions
  const handlePlayMusicTrack = useCallback(
    (track: MusicTrack, contextQueue?: MusicTrack[]) => {
      setMusicError(null);
      if (contextQueue && contextQueue.length > 0) {
        const idx = contextQueue.findIndex((t) => t.id === track.id);
        setMusicQueue(contextQueue);
        setMusicQueueIndex(idx >= 0 ? idx : 0);
      } else {
        setMusicQueue((prev) => {
          const existingIdx = prev.findIndex((t) => t.id === track.id);
          if (existingIdx >= 0) {
            setMusicQueueIndex(existingIdx);
            return prev;
          }
          const next = [...prev, track];
          setMusicQueueIndex(next.length - 1);
          return next;
        });
      }
      setCurrentTrack(track);
      setIsMusicPlaying(true);
      setPlayNonce((n) => n + 1);
    },
    []
  );

  const handleToggleMusicPlay = useCallback(() => {
    if (!currentTrack) return;
    setIsMusicPlaying((p) => !p);
  }, [currentTrack]);

  const handleMusicNext = useCallback(() => {
    if (musicQueue.length === 0) return;
    if (musicShuffle && musicQueue.length > 1) {
      let nextIdx = musicQueueIndex;
      for (let attempt = 0; attempt < 5 && nextIdx === musicQueueIndex; attempt++) {
        nextIdx = Math.floor(Math.random() * musicQueue.length);
      }
      setMusicQueueIndex(nextIdx);
      setCurrentTrack(musicQueue[nextIdx]);
      setIsMusicPlaying(true);
      setPlayNonce((n) => n + 1);
      return;
    }
    const nextIdx = musicQueueIndex + 1;
    if (nextIdx < musicQueue.length) {
      setMusicQueueIndex(nextIdx);
      setCurrentTrack(musicQueue[nextIdx]);
      setIsMusicPlaying(true);
      setPlayNonce((n) => n + 1);
    } else if (musicRepeat === 'all') {
      setMusicQueueIndex(0);
      setCurrentTrack(musicQueue[0]);
      setIsMusicPlaying(true);
      setPlayNonce((n) => n + 1);
    } else {
      setIsMusicPlaying(false);
    }
  }, [musicQueue, musicQueueIndex, musicShuffle, musicRepeat]);

  const handleMusicPrev = useCallback(() => {
    if (musicCurrentTimeSec > 4) {
      setMusicSeekSignal((prev) => ({ seq: (prev?.seq || 0) + 1, timeSec: 0 }));
      return;
    }
    if (musicQueue.length === 0) return;
    const prevIdx = musicQueueIndex - 1 >= 0 ? musicQueueIndex - 1 : musicQueue.length - 1;
    setMusicQueueIndex(prevIdx);
    setCurrentTrack(musicQueue[prevIdx]);
    setIsMusicPlaying(true);
    setPlayNonce((n) => n + 1);
  }, [musicCurrentTimeSec, musicQueue, musicQueueIndex]);

  const handleMusicEnded = useCallback(() => {
    if (musicRepeat === 'one' && currentTrack) {
      setMusicSeekSignal((prev) => ({ seq: (prev?.seq || 0) + 1, timeSec: 0 }));
      setIsMusicPlaying(true);
      setPlayNonce((n) => n + 1);
      return;
    }
    handleMusicNext();
  }, [musicRepeat, currentTrack, handleMusicNext]);

  const handleAddToMusicQueue = useCallback((track: MusicTrack) => {
    setMusicQueue((prev) => [...prev, track]);
  }, []);

  const handleRemoveFromMusicQueue = useCallback(
    (removeIndex: number) => {
      setMusicQueue((prev) => prev.filter((_, idx) => idx !== removeIndex));
      setMusicQueueIndex((currIdx) => {
        if (removeIndex < currIdx) return currIdx - 1;
        if (removeIndex === currIdx) return Math.min(currIdx, Math.max(0, musicQueue.length - 2));
        return currIdx;
      });
    },
    [musicQueue.length]
  );

  const handleToggleLikeTrack = useCallback((track: MusicTrack) => {
    setLikedTracks((prev) =>
      prev.some((t) => t.id === track.id)
        ? prev.filter((t) => t.id !== track.id)
        : [track, ...prev]
    );
  }, []);

  const handleCreateMusicPlaylist = useCallback(
    (name: string, initialTracks: MusicTrack[] = []): MusicPlaylist => {
      const created: MusicPlaylist = {
        id: `pl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: name.trim(),
        tracks: initialTracks,
        createdAt: new Date().toISOString(),
      };
      setMusicPlaylists((prev) => [created, ...prev]);
      return created;
    },
    []
  );

  const handleDeleteMusicPlaylist = useCallback((playlistId: string) => {
    setMusicPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
  }, []);

  const handleAddTrackToPlaylist = useCallback((playlistId: string, track: MusicTrack) => {
    setMusicPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id !== playlistId) return pl;
        if (pl.tracks.some((t) => t.id === track.id)) return pl;
        return { ...pl, tracks: [...pl.tracks, track] };
      })
    );
  }, []);

  const handleRemoveTrackFromPlaylist = useCallback((playlistId: string, trackId: string) => {
    setMusicPlaylists((prev) =>
      prev.map((pl) =>
        pl.id === playlistId
          ? { ...pl, tracks: pl.tracks.filter((t) => t.id !== trackId) }
          : pl
      )
    );
  }, []);

  // Tabs navigation
  const tabList: NavTab[] = useMemo(() => ['HOME', 'GAMES', 'MUSIC', 'STREAMS', 'FRIENDS'], []);
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
        onOpenStartStream={() => handleOpenStartStream(activeGame || null)}
        activeStreamsCount={activeStreams.length}
        cloakConfig={cloakConfig}
        onLogOut={handleLogOut}
        onDeleteAccount={() => setConfirmDeleteSelfAccountModal(true)}
        onPromptSignIn={handleLogOut}
      />

      {/* Main Dynamic View */}
      <main className={`relative z-10 flex-1 w-full ${currentTrack ? 'pb-28' : 'pb-14'}`}>
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
            onOpenSafetyModal={() => setSafetyModalOpen(true)}
            hasActiveMusic={Boolean(currentTrack)}
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

        {currentTab === 'MUSIC' && (
          <MusicScreen
            currentTrack={currentTrack}
            isPlaying={isMusicPlaying}
            isBuffering={isMusicBuffering}
            queue={musicQueue}
            likedTracks={likedTracks}
            playlists={musicPlaylists}
            onPlayTrack={handlePlayMusicTrack}
            onTogglePlayPause={handleToggleMusicPlay}
            onAddToQueue={handleAddToMusicQueue}
            onRemoveFromQueue={handleRemoveFromMusicQueue}
            onToggleLike={handleToggleLikeTrack}
            onCreatePlaylist={handleCreateMusicPlaylist}
            onDeletePlaylist={handleDeleteMusicPlaylist}
            onAddTrackToPlaylist={handleAddTrackToPlaylist}
            onRemoveTrackFromPlaylist={handleRemoveTrackFromPlaylist}
            initialSection={musicInitialSection}
          />
        )}

        {currentTab === 'STREAMS' && (
          <StreamsScreen
            streams={activeStreams}
            userProfile={userProfile}
            onWatchStream={setWatchingStream}
            onOpenStartStream={() => handleOpenStartStream(null)}
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
          onUpdateProfile={async (updated) => {
            if (!updated.isGuest && updated.gamerpic !== userProfile.gamerpic) {
              const res = await updateUserProfileAsync(userProfile.gamertag, { gamerpic: updated.gamerpic });
              if (!res.success) {
                throw new Error(res.error || 'Failed to save custom profile picture.');
              }
              const synced: UserProfile = {
                ...updated,
                gamerpic: res.gamerpic || updated.gamerpic,
              };
              setUserProfile(synced);
              if (synced.rememberMe || getSavedSession()?.gamertag?.toLowerCase() === synced.gamertag.toLowerCase()) {
                saveSession(synced);
              }
              return;
            }
            setUserProfile(updated);
            if (updated.rememberMe || getSavedSession()?.gamertag?.toLowerCase() === updated.gamertag.toLowerCase()) {
              saveSession(updated);
            }
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
          onDeleteAccount={handleDeleteAccount}
          onOpenSafetyModal={() => setSafetyModalOpen(true)}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* Teacher & School IT Safety Verification Modal */}
      {safetyModalOpen && (
        <ProjectSafetyModal
          onClose={() => setSafetyModalOpen(false)}
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

      {/* Startup Prompt: Launch in about:blank */}
      {aboutBlankPromptOpen && (
        <AboutBlankPromptModal
          onClose={() => setAboutBlankPromptOpen(false)}
        />
      )}

      {/* Sandboxed Game Player Overlay */}
      {activeGame && (
        <GameRunnerModal
          game={activeGame}
          onClose={() => setActiveGame(null)}
          onTriggerStealth={() => setStealthActive(true)}
          onStartStream={(game) => handleOpenStartStream(game)}
        />
      )}

      {/* Start Stream Modal (Broadcast live to friends or online) */}
      {startStreamOpen && (
        <StartStreamModal
          userProfile={userProfile}
          currentGame={streamGameTarget || activeGame || null}
          availableGames={games}
          activeStream={myActiveStream}
          onEndExistingStream={async () => {
            if (myActiveStream) {
              await endLiveStream(myActiveStream.id);
              setMyActiveStream(null);
            }
          }}
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

      {/* 1-Stream Limit Warning Modal: User is already streaming and clicked Go Live again */}
      {streamLimitModal.open && streamLimitModal.stream && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md select-none animate-in fade-in duration-150">
          <div className="relative w-full max-w-md bg-[#141824] border border-red-500/70 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.9)] p-6 text-white space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-red-600/20 border border-red-500/50 flex items-center justify-center text-red-500 shrink-0">
                  <Radio className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-wider">
                    Only 1 Stream Open At A Time
                  </h3>
                  <p className="text-xs text-red-300/80">
                    You are already live broadcasting
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStreamLimitModal({ open: false, stream: null })}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 bg-red-950/40 border border-red-700/60 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-300">Current Broadcast:</span>
                <span className="text-[10px] bg-red-600 text-white font-black px-1.5 py-0.5 rounded uppercase flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                  LIVE
                </span>
              </div>
              <div className="text-sm font-bold text-white truncate">
                "{streamLimitModal.stream.title}"
              </div>
              <div className="text-[11px] text-slate-400">
                Playing: <span className="text-cyan-400 font-semibold">{streamLimitModal.stream.gameTitle}</span>
              </div>
              <p className="text-[11px] text-slate-300/90 pt-1 leading-relaxed">
                You can only have 1 stream open at a time. To start a different game stream, please end your current broadcast first or open your active stream.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStreamLimitModal({ open: false, stream: null })}
                className="w-full sm:w-auto px-4 py-2 bg-[#202535] hover:bg-[#282f42] text-slate-300 hover:text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const s = streamLimitModal.stream;
                  setStreamLimitModal({ open: false, stream: null });
                  if (s) setWatchingStream(s);
                }}
                className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-cyan-500/40 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Tv className="w-3.5 h-3.5" />
                <span>View My Stream</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  const s = streamLimitModal.stream;
                  setStreamLimitModal({ open: false, stream: null });
                  if (s) {
                    sounds.playExplosion();
                    await endLiveStream(s.id);
                    setMyActiveStream(null);
                    setTimeout(() => {
                      setStartStreamOpen(true);
                    }, 250);
                  }
                }}
                className="w-full sm:w-auto px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>End Old & Go Live</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanently Delete Signed-in Account Modal */}
      {confirmDeleteSelfAccountModal && userProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md select-none animate-in fade-in duration-150">
          <div className="relative w-full max-w-md bg-[#161924] border border-red-600/70 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.9)] p-6 text-white space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-500 shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-wider">
                    Delete Account from Network
                  </h3>
                  <p className="text-xs text-red-300">
                    Permanent account removal
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isDeletingSelfAccount}
                onClick={() => setConfirmDeleteSelfAccountModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 bg-red-950/50 border border-red-700/60 rounded-xl space-y-2 text-xs text-red-200 leading-relaxed">
              <p>
                Are you sure you want to delete <strong className="text-white font-bold">@{userProfile.gamertag}</strong> from the Atlas cloud network?
              </p>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-red-300/90 pt-1">
                <li>Your profile and login credentials will be permanently erased.</li>
                <li>All friends and friend requests will be bidirectionally removed.</li>
                <li>Any live streams by this account will be ended immediately.</li>
                <li>This action cannot be undone.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeletingSelfAccount}
                onClick={() => setConfirmDeleteSelfAccountModal(false)}
                className="px-4 py-2 bg-[#202535] hover:bg-[#282f42] text-slate-300 hover:text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingSelfAccount}
                onClick={handleConfirmSelfDeleteAccount}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-lg shadow-red-950"
              >
                {isDeletingSelfAccount ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting Account...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Yes, Permanently Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Background Music Engine & Bottom Bar */}
      <MusicPlaybackHost
        track={currentTrack}
        playNonce={playNonce}
        isPlaying={isMusicPlaying}
        volume={musicVolume}
        isMuted={musicMuted}
        seekSignal={musicSeekSignal}
        onProgress={(cur, dur) => {
          setMusicCurrentTimeSec(cur);
          setMusicDurationSec(dur);
        }}
        onPlayStateChange={setIsMusicPlaying}
        onBufferingChange={setIsMusicBuffering}
        onTrackEnded={handleMusicEnded}
        onError={setMusicError}
      />

      {currentTrack && (
        <MusicPlayerBar
          track={currentTrack}
          isPlaying={isMusicPlaying}
          isBuffering={isMusicBuffering}
          currentTimeSec={musicCurrentTimeSec}
          durationSec={musicDurationSec}
          shuffle={musicShuffle}
          repeat={musicRepeat}
          volume={musicVolume}
          isMuted={musicMuted}
          isLiked={likedTracks.some((t) => t.id === currentTrack.id)}
          queueCount={musicQueue.length}
          errorMessage={musicError}
          onTogglePlay={handleToggleMusicPlay}
          onPrev={handleMusicPrev}
          onNext={handleMusicNext}
          onSeek={(timeSec) =>
            setMusicSeekSignal((prev) => ({ seq: (prev?.seq || 0) + 1, timeSec }))
          }
          onToggleShuffle={() => setMusicShuffle((s) => !s)}
          onCycleRepeat={() =>
            setMusicRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'))
          }
          onChangeVolume={(vol) => {
            setMusicVolume(vol);
            if (vol > 0 && musicMuted) setMusicMuted(false);
          }}
          onToggleMute={() => setMusicMuted((m) => !m)}
          onToggleLike={handleToggleLikeTrack}
          onOpenQueue={() => {
            setMusicInitialSection('queue');
            setCurrentTab('MUSIC');
          }}
          onDismissError={() => setMusicError(null)}
        />
      )}
    </div>
  );
}
