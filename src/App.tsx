import { useState, useEffect, useCallback, useMemo } from 'react';
import { CustomGame, Friend, FriendRequest, NavTab, NetworkUser, UserProfile } from './types';
import { sounds } from './services/soundEffects';
import { HeaderNav } from './components/HeaderNav';
import { HomeScreen } from './components/HomeScreen';
import { GamesScreen } from './components/GamesScreen';
import { FriendsScreen } from './components/FriendsScreen';
import { AddGameModal } from './components/AddGameModal';
import { FriendBrowserModal } from './components/FriendBrowserModal';
import { GameRunnerModal } from './components/GameRunnerModal';
import { SettingsModal } from './components/SettingsModal';
import { StealthView } from './components/StealthView';
import { SignInModal } from './components/SignInModal';
import { MISSING_TEXTURE_DATA_URL } from './utils/assets';
import {
  getSavedSession,
  saveSession,
  getFriendsForUser,
  saveFriendsForUser,
  getRequestsForUser,
  saveRequestsForUser,
  unfriendUsers,
} from './services/userService';

export const PRESET_GAMES: CustomGame[] = [
  {
    id: 'game-geo',
    title: 'Geometry Dash WASM',
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
  const [stealthActive, setStealthActive] = useState(false);
  const [isMuted, setIsMuted] = useState(sounds.isMuted());

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
          // Normalize preset games with isPreset: true
          const normalized = filtered.map((g) => {
            if (isGamePreset(g)) {
              return { ...g, isPreset: true };
            }
            return g;
          });
          // Ensure all PRESET_GAMES are present
          for (const preset of PRESET_GAMES) {
            const exists = normalized.some(
              (g) => g.id === preset.id || g.url?.toLowerCase() === preset.url.toLowerCase()
            );
            if (!exists) {
              normalized.unshift(preset);
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

  // When active user account changes, reload their unique scoped friends and requests
  useEffect(() => {
    if (userProfile && !userProfile.isGuest) {
      const loadedFriends = getFriendsForUser(userProfile.gamertag);
      const loadedRequests = getRequestsForUser(userProfile.gamertag);
      setFriends(loadedFriends);
      setRequests(loadedRequests);
    } else {
      setFriends([]);
      setRequests([]);
    }
  }, [userProfile?.gamertag, userProfile?.isGuest]);

  // Persist friends for current user account
  useEffect(() => {
    if (userProfile && !userProfile.isGuest) {
      saveFriendsForUser(userProfile.gamertag, friends);
    }
  }, [friends, userProfile]);

  // Persist requests for current user account
  useEffect(() => {
    if (userProfile && !userProfile.isGuest) {
      saveRequestsForUser(userProfile.gamertag, requests);
    }
  }, [requests, userProfile]);

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

  // Actions: Friend Requests & Approval Flow
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

    // Add to sender's outgoing requests
    setRequests((prev) => [...prev, newReq]);

    // Place in recipient's requests inbox so the real user can review and accept when logged in
    const targetRequests = getRequestsForUser(targetUser.username);
    saveRequestsForUser(targetUser.username, [...targetRequests, newReq]);
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

    // Also add current user to sender's friends list in their account storage!
    const senderFriends = getFriendsForUser(req.fromUser);
    if (!senderFriends.some((f) => f.username.toLowerCase() === userProfile.gamertag.toLowerCase())) {
      senderFriends.push({
        id: `friend-recip-${Date.now()}`,
        username: userProfile.gamertag,
        status: 'online',
        avatarBg: '#00A2FF',
        avatarPic: userProfile.gamerpic || MISSING_TEXTURE_DATA_URL,
        addedAt: new Date().toISOString(),
      });
      saveFriendsForUser(req.fromUser, senderFriends);
    }

    // Remove pending request
    setRequests((prev) => prev.filter((r) => r.id !== req.id));

    // Remove from recipient's storage
    const remaining = getRequestsForUser(userProfile.gamertag).filter((r) => r.id !== req.id);
    saveRequestsForUser(userProfile.gamertag, remaining);
  };

  const handleDeclineRequest = (requestId: string) => {
    if (!userProfile) return;
    const req = requests.find((r) => r.id === requestId);
    setRequests((prev) => prev.filter((r) => r.id !== requestId));

    // Remove from both sender and recipient in storage
    const currentRem = getRequestsForUser(userProfile.gamertag).filter((r) => r.id !== requestId);
    saveRequestsForUser(userProfile.gamertag, currentRem);

    if (req) {
      const otherUser = req.fromUser.toLowerCase() === userProfile.gamertag.toLowerCase()
        ? req.toUser
        : req.fromUser;
      const otherRem = getRequestsForUser(otherUser).filter((r) => r.id !== requestId);
      saveRequestsForUser(otherUser, otherRem);
    }
  };

  const handleRemoveFriend = (friendId: string) => {
    const friendToRemove = friends.find((f) => f.id === friendId);
    if (!friendToRemove) return;

    // Remove from current user state
    setFriends((prev) => prev.filter((f) => f.id !== friendId));

    // Remove bidirectionally from both accounts in persistent storage
    if (userProfile && !userProfile.isGuest) {
      unfriendUsers(userProfile.gamertag, friendToRemove.username);
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
  const tabList: NavTab[] = useMemo(() => ['HOME', 'GAMES', 'FRIENDS'], []);
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
        else if (activeGame) setActiveGame(null);
        else if (stealthActive) setStealthActive(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [addGameOpen, friendBrowserOpen, settingsOpen, activeGame, stealthActive]);

  // If user is not signed in and has no saved session, show the SignInModal
  if (!userProfile) {
    return <SignInModal onSignIn={handleSignIn} />;
  }

  return (
    <div className="relative min-h-screen flex flex-col bg-[#070a10] text-white overflow-x-hidden font-sans">
      {/* Ambient Blue Glow & Perspective 3D Neon Bars */}
      <div className="atlas-neon-grid" />
      <div className="atlas-neon-bars pointer-events-none">
        <div className="neon-bar-v left-[15%]" />
        <div className="neon-bar-v left-[45%]" />
        <div className="neon-bar-v left-[75%]" />
        <div className="neon-bar-h top-[25%]" />
        <div className="neon-bar-h top-[60%]" />
      </div>

      {/* Panic / Stealth Camouflage Screen */}
      {stealthActive && <StealthView onExit={() => setStealthActive(false)} />}

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
            onPlayGame={handlePlayGame}
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

        {currentTab === 'FRIENDS' && (
          <FriendsScreen
            friends={friends}
            games={games}
            requests={requests}
            onOpenAddFriend={() => {
              if (userProfile.isGuest) {
                handleLogOut();
              } else {
                setFriendBrowserOpen(true);
              }
            }}
            onRemoveFriend={handleRemoveFriend}
            onPlayGame={handlePlayGame}
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
          onClearCustomGames={handleClearCustomGames}
          onResetData={handleResetData}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* Sandboxed Game Player Overlay */}
      {activeGame && (
        <GameRunnerModal
          game={activeGame}
          onClose={() => setActiveGame(null)}
          onTriggerStealth={() => setStealthActive(true)}
        />
      )}
    </div>
  );
}
