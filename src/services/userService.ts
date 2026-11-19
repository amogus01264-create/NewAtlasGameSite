import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  limit,
} from 'firebase/firestore';
import { db } from './firebase';
import { Friend, FriendRequest, NetworkUser, RegisteredAccount, UserProfile } from '../types';
import { MISSING_TEXTURE_DATA_URL } from '../utils/assets';
import { atlasStorage, safeLocalStorage } from './storageService';
import { compressImageToDataUrl } from '../utils/imageCompressor';

// Storage keys for caching and offline fallback
const STORAGE_ACCOUNTS_KEY = 'atlas_registered_accounts';
const STORAGE_SESSION_KEY = 'atlas_saved_session';

// Heartbeat & staleness window (100s tolerates browser background tab 60s timer throttling cleanly)
export const PRESENCE_HEARTBEAT_INTERVAL_MS = 25_000;
export const PRESENCE_TIMEOUT_MS = 100_000;

export function isDefaultOrLegacyAvatar(pic?: string | null): boolean {
  if (!pic) return true;
  if (pic === MISSING_TEXTURE_DATA_URL) return true;
  if (pic.includes('images.unsplash.com/')) return true;
  return false;
}

export function sanitizeAvatarUrl(pic?: string | null): string {
  if (!pic || isDefaultOrLegacyAvatar(pic)) {
    return MISSING_TEXTURE_DATA_URL;
  }
  return pic;
}

export function deriveUserPresence(
  account?: Partial<RegisteredAccount> | null
): { status: 'online' | 'playing' | 'offline'; currentGame?: string } {
  if (!account) return { status: 'offline' };
  if (account.presenceStatus === 'offline') {
    return { status: 'offline' };
  }
  if (typeof account.lastSeenAt !== 'number' || !Number.isFinite(account.lastSeenAt)) {
    return { status: 'offline' };
  }
  if (Date.now() - account.lastSeenAt > PRESENCE_TIMEOUT_MS) {
    return { status: 'offline' };
  }
  if (account.presenceStatus === 'playing' && account.currentGame) {
    return { status: 'playing', currentGame: account.currentGame };
  }
  return { status: 'online' };
}

// --- Local & High-Capacity Storage Helpers (Cache & Offline Support) ---
export const getRegisteredAccounts = (): RegisteredAccount[] => {
  try {
    const raw = atlasStorage.getItemSync(STORAGE_ACCOUNTS_KEY) || safeLocalStorage.getItem(STORAGE_ACCOUNTS_KEY);
    const parsed: RegisteredAccount[] = raw ? JSON.parse(raw) : [];
    return parsed.map((a) => ({ ...a, gamerpic: sanitizeAvatarUrl(a.gamerpic) }));
  } catch {
    return [];
  }
};

export const clearLocalAccountsCache = () => {
  try {
    atlasStorage.removeItem(STORAGE_ACCOUNTS_KEY);
    atlasStorage.removeItem(STORAGE_SESSION_KEY);
    safeLocalStorage.removeItem(STORAGE_ACCOUNTS_KEY);
    safeLocalStorage.removeItem(STORAGE_SESSION_KEY);
  } catch {
    // ignore
  }
};

const cacheAccountLocally = (account: RegisteredAccount) => {
  try {
    const current = getRegisteredAccounts();
    const clean = account.username.toLowerCase();
    const updated = current.filter((a) => a.username.toLowerCase() !== clean);
    updated.push(account);
    const serialized = JSON.stringify(updated);
    atlasStorage.setItemSync(STORAGE_ACCOUNTS_KEY, serialized);
  } catch {
    // ignore
  }
};

const patchCachedAccountLocally = (username: string, patch: Partial<RegisteredAccount>) => {
  try {
    const cleanLower = username.trim().toLowerCase();
    const current = getRegisteredAccounts();
    const idx = current.findIndex((a) => a.username.toLowerCase() === cleanLower);
    if (idx >= 0) {
      current[idx] = { ...current[idx], ...patch };
      atlasStorage.setItemSync(STORAGE_ACCOUNTS_KEY, JSON.stringify(current));
    }
  } catch {
    // ignore
  }
};

// --- Real-Time Presence Tracking ---

export const updateUserPresenceAsync = async (
  username: string,
  presenceStatus: 'online' | 'playing' | 'offline',
  currentGame?: string
): Promise<void> => {
  const cleanLower = username.trim().toLowerCase();
  if (!cleanLower) return;

  const now = Date.now();
  const cleanGame = presenceStatus === 'playing' ? (currentGame || '').slice(0, 120) : '';

  patchCachedAccountLocally(cleanLower, {
    presenceStatus,
    lastSeenAt: presenceStatus === 'offline' ? 0 : now,
    currentGame: cleanGame,
  });

  try {
    const accountRef = doc(db, 'accounts', cleanLower);
    await updateDoc(accountRef, {
      presenceStatus,
      lastSeenAt: presenceStatus === 'offline' ? 0 : now,
      currentGame: cleanGame,
    });
  } catch (err) {
    // Best effort: skip noise if account doesn't exist in Firestore (e.g. guest or deleted)
    console.debug('updateUserPresenceAsync skipped:', err);
  }
};

export const sendOfflinePresenceBeacon = (username: string): void => {
  const cleanLower = username.trim().toLowerCase();
  if (!cleanLower || typeof window === 'undefined') return;

  patchCachedAccountLocally(cleanLower, {
    presenceStatus: 'offline',
    lastSeenAt: 0,
    currentGame: '',
  });

  const payload = JSON.stringify({ username: cleanLower });
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const sent = navigator.sendBeacon(
        '/api/presence/offline',
        new Blob([payload], { type: 'application/json' })
      );
      if (sent) return;
    }
  } catch {
    // fallback to keepalive fetch
  }

  try {
    fetch('/api/presence/offline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => null);
  } catch {
    // ignore
  }
};

// --- Cloud Accounts Management (Firestore) ---

export const isUsernameTakenAsync = async (username: string): Promise<boolean> => {
  const clean = username.trim().toLowerCase();
  if (!clean) return false;
  try {
    const accountRef = doc(db, 'accounts', clean);
    const snap = await getDoc(accountRef);
    return snap.exists();
  } catch (err) {
    console.warn('isUsernameTakenAsync fallback to local:', err);
    const local = getRegisteredAccounts();
    return local.some((a) => a.username.toLowerCase() === clean);
  }
};

export const registerAccountAsync = async (
  account: RegisteredAccount
): Promise<{ success: boolean; error?: string }> => {
  const clean = account.username.trim();
  const cleanLower = clean.toLowerCase();

  if (clean.length < 3 || clean.length > 20) {
    return { success: false, error: 'Username must be between 3 and 20 characters.' };
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(clean)) {
    return {
      success: false,
      error: 'Username can only contain letters, numbers, underscores, and dashes (no spaces).',
    };
  }

  if (!account.password || account.password.length < 4) {
    return { success: false, error: 'Password must be at least 4 characters long.' };
  }

  if (
    !account.birthday ||
    !account.birthday.month ||
    account.birthday.month === 'Month' ||
    !account.birthday.day ||
    account.birthday.day === 'Day' ||
    !account.birthday.year ||
    account.birthday.year === 'Year'
  ) {
    return {
      success: false,
      error: 'Birthday is required. Please select your Month, Day, and Year.',
    };
  }

  try {
    const accountRef = doc(db, 'accounts', cleanLower);
    const existingSnap = await getDoc(accountRef);

    if (existingSnap.exists()) {
      return { success: false, error: 'Username is already taken by another player.' };
    }

    const optimizedPic = account.gamerpic?.startsWith('data:image')
      ? await compressImageToDataUrl(account.gamerpic, 128, 128, 0.8)
      : (account.gamerpic || MISSING_TEXTURE_DATA_URL);

    const accountData: RegisteredAccount = {
      username: clean,
      password: account.password,
      gamerpic: optimizedPic,
      birthday: {
        month: account.birthday.month,
        day: account.birthday.day,
        year: account.birthday.year,
      },
      gender: account.gender || null,
      createdAt: account.createdAt || new Date().toISOString(),
      presenceStatus: 'online',
      lastSeenAt: Date.now(),
      currentGame: '',
    };

    await setDoc(accountRef, accountData);
    cacheAccountLocally(accountData);
    return { success: true };
  } catch (err: any) {
    console.error('Cloud registration error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to register account on the Atlas network.',
    };
  }
};

/**
 * Updates a user's custom profile picture / profile fields in Cloud Firestore,
 * local cache, saved session, and related friend/request/stream docs so everyone
 * sees the updated custom profile picture immediately.
 */
export const updateUserProfileAsync = async (
  username: string,
  updates: { gamerpic?: string }
): Promise<{ success: boolean; gamerpic?: string; error?: string }> => {
  const clean = username.trim();
  const cleanLower = clean.toLowerCase();
  if (!cleanLower) {
    return { success: false, error: 'Invalid username.' };
  }

  try {
    let nextPic = updates.gamerpic;
    if (nextPic && nextPic.startsWith('data:image')) {
      nextPic = await compressImageToDataUrl(nextPic, 128, 128, 0.8);
    }

    if (!nextPic) {
      return { success: true };
    }

    // 1. Update primary Cloud Firestore account document
    const accountRef = doc(db, 'accounts', cleanLower);
    const snap = await getDoc(accountRef);
    if (!snap.exists()) {
      return { success: false, error: 'Account record not found on Atlas cloud network.' };
    }
    await updateDoc(accountRef, { gamerpic: nextPic });

    // 2. Sync local accounts cache and saved session
    patchCachedAccountLocally(cleanLower, { gamerpic: nextPic });
    const session = getSavedSession();
    if (session && session.gamertag.toLowerCase() === cleanLower) {
      saveSession({ ...session, gamerpic: nextPic });
    }

    // 3. Best-effort sync of reciprocal cached friend, request, and active stream avatars
    Promise.allSettled([
      (async () => {
        const qFriends = query(collection(db, 'friends'), where('ownerUsername', '==', cleanLower));
        const friendsSnap = await getDocs(qFriends);
        for (const d of friendsSnap.docs) {
          const friendData = d.data();
          const targetLower = (friendData.username || '').trim().toLowerCase();
          if (targetLower) {
            await updateDoc(doc(db, 'friends', `${targetLower}_${cleanLower}`), {
              avatarPic: nextPic,
            }).catch(() => null);
          }
        }
      })(),
      (async () => {
        const qReqsFrom = query(collection(db, 'friendRequests'), where('fromUser', '==', cleanLower));
        const reqSnap = await getDocs(qReqsFrom);
        for (const d of reqSnap.docs) {
          await updateDoc(d.ref, { fromPic: nextPic }).catch(() => null);
        }
      })(),
      (async () => {
        const qStreams = query(
          collection(db, 'streams'),
          where('streamer', '==', clean),
          where('status', '==', 'live')
        );
        const streamSnap = await getDocs(qStreams);
        for (const d of streamSnap.docs) {
          await updateDoc(d.ref, { streamerPic: nextPic }).catch(() => null);
        }
      })(),
    ]).catch(() => null);

    return { success: true, gamerpic: nextPic };
  } catch (err: any) {
    console.error('updateUserProfileAsync error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to save custom profile picture to Atlas cloud.',
    };
  }
};

export const subscribeToOwnAccount = (
  username: string,
  onUpdate: (account: RegisteredAccount | null) => void
): (() => void) => {
  const cleanLower = username.trim().toLowerCase();
  if (!cleanLower) return () => {};

  const accountRef = doc(db, 'accounts', cleanLower);
  return onSnapshot(
    accountRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as RegisteredAccount;
        cacheAccountLocally(data);
        onUpdate(data);
      } else {
        onUpdate(null);
      }
    },
    (err) => {
      console.warn('subscribeToOwnAccount listener notice:', err);
    }
  );
};

/**
 * Permanently deletes an account from Cloud Firestore, cleans up all friendship
 * links, friend requests, and clears local cached credentials.
 */
export const deleteAccountAsync = async (
  username: string
): Promise<{ success: boolean; error?: string }> => {
  const clean = username.trim();
  const cleanLower = clean.toLowerCase();
  if (!cleanLower) return { success: false, error: 'Invalid username.' };

  try {
    const accountRef = doc(db, 'accounts', cleanLower);
    await deleteDoc(accountRef).catch((e) => console.warn('Cloud account delete doc error:', e));

    const friendsCol = collection(db, 'friends');
    const qFriendsOwner = query(friendsCol, where('ownerUsername', '==', cleanLower));
    const snapFriendsOwner = await getDocs(qFriendsOwner).catch(() => null);
    if (snapFriendsOwner) {
      for (const d of snapFriendsOwner.docs) {
        await deleteDoc(d.ref).catch(() => null);
      }
    }

    const qFriendsOthers = query(friendsCol, where('username', '==', clean));
    const snapFriendsOthers = await getDocs(qFriendsOthers).catch(() => null);
    if (snapFriendsOthers) {
      for (const d of snapFriendsOthers.docs) {
        await deleteDoc(d.ref).catch(() => null);
      }
    }

    const reqCol = collection(db, 'friendRequests');
    const qReqTo = query(reqCol, where('toUser', '==', cleanLower));
    const snapReqTo = await getDocs(qReqTo).catch(() => null);
    if (snapReqTo) {
      for (const d of snapReqTo.docs) {
        await deleteDoc(d.ref).catch(() => null);
      }
    }

    const qReqFrom = query(reqCol, where('fromUser', '==', cleanLower));
    const snapReqFrom = await getDocs(qReqFrom).catch(() => null);
    if (snapReqFrom) {
      for (const d of snapReqFrom.docs) {
        await deleteDoc(d.ref).catch(() => null);
      }
    }

    try {
      const streamsCol = collection(db, 'streams');
      const qStreams = query(streamsCol, where('streamer', '==', clean));
      const snapStreams = await getDocs(qStreams).catch(() => null);
      if (snapStreams) {
        for (const d of snapStreams.docs) {
          await deleteDoc(d.ref).catch(() => null);
        }
      }
    } catch {
      // ignore stream delete errors
    }

    try {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        const local = getRegisteredAccounts().filter((a) => a.username.toLowerCase() !== cleanLower);
        localStorage.setItem(STORAGE_ACCOUNTS_KEY, JSON.stringify(local));

        const session = getSavedSession();
        if (session && session.gamertag.toLowerCase() === cleanLower) {
          saveSession(null);
        }

        localStorage.removeItem(`atlas_friends_${cleanLower}`);
        localStorage.removeItem(`atlas_requests_${cleanLower}`);
      }
    } catch {
      // ignore local storage errors
    }

    return { success: true };
  } catch (err: any) {
    console.error('deleteAccountAsync error:', err);
    return { success: false, error: err?.message || 'Failed to delete account.' };
  }
};

/**
 * Purges all test accounts, friends links, and requests from Cloud Firestore
 * and local storage.
 */
export const deleteAllAccountsAsync = async (): Promise<{ success: boolean; count: number }> => {
  let count = 0;
  try {
    const accSnap = await getDocs(collection(db, 'accounts')).catch(() => null);
    if (accSnap) {
      for (const d of accSnap.docs) {
        await deleteDoc(d.ref).catch(() => null);
        count++;
      }
    }

    const friendsSnap = await getDocs(collection(db, 'friends')).catch(() => null);
    if (friendsSnap) {
      for (const d of friendsSnap.docs) {
        await deleteDoc(d.ref).catch(() => null);
      }
    }

    const reqSnap = await getDocs(collection(db, 'friendRequests')).catch(() => null);
    if (reqSnap) {
      for (const d of reqSnap.docs) {
        await deleteDoc(d.ref).catch(() => null);
      }
    }

    clearLocalAccountsCache();
    saveSession(null);
    return { success: true, count };
  } catch (err) {
    console.error('deleteAllAccountsAsync error:', err);
    clearLocalAccountsCache();
    saveSession(null);
    return { success: true, count };
  }
};

export const authenticateUserAsync = async (
  username: string,
  password?: string
): Promise<{ success: boolean; account?: RegisteredAccount; error?: string }> => {
  const clean = username.trim();
  const cleanLower = clean.toLowerCase();

  try {
    const accountRef = doc(db, 'accounts', cleanLower);
    const snap = await getDoc(accountRef);

    if (!snap.exists()) {
      const local = getRegisteredAccounts().find((a) => a.username.toLowerCase() === cleanLower);
      if (!local) {
        return { success: false, error: 'User does not exist. Please sign up first.' };
      }
      if (password && local.password !== password) {
        return { success: false, error: 'Incorrect password for this user.' };
      }
      return { success: true, account: local };
    }

    const data = snap.data() as RegisteredAccount;
    if (password && data.password !== password) {
      return { success: false, error: 'Incorrect password for this user.' };
    }

    const now = Date.now();
    await updateDoc(accountRef, {
      presenceStatus: 'online',
      lastSeenAt: now,
      currentGame: '',
    }).catch(() => null);

    const freshAccount: RegisteredAccount = {
      ...data,
      presenceStatus: 'online',
      lastSeenAt: now,
      currentGame: '',
    };
    cacheAccountLocally(freshAccount);
    return { success: true, account: freshAccount };
  } catch (err: any) {
    console.warn('Cloud authenticateUser fallback to local:', err);
    const local = getRegisteredAccounts().find((a) => a.username.toLowerCase() === cleanLower);
    if (!local) {
      return { success: false, error: 'User does not exist. Please sign up first.' };
    }
    if (password && local.password !== password) {
      return { success: false, error: 'Incorrect password for this user.' };
    }
    return { success: true, account: local };
  }
};

export const isUsernameTaken = (username: string): boolean => {
  const clean = username.trim().toLowerCase();
  const accounts = getRegisteredAccounts();
  return accounts.some((a) => a.username.toLowerCase() === clean);
};

export const registerAccount = (
  account: RegisteredAccount
): { success: boolean; error?: string } => {
  const clean = account.username.trim();
  cacheAccountLocally({ ...account, username: clean });
  registerAccountAsync(account).catch(console.error);
  return { success: true };
};

export const authenticateUser = (
  username: string,
  password?: string
): { success: boolean; account?: RegisteredAccount; error?: string } => {
  const clean = username.trim().toLowerCase();
  const accounts = getRegisteredAccounts();
  const matched = accounts.find((a) => a.username.toLowerCase() === clean);

  if (!matched) {
    return { success: false, error: 'User does not exist. Please sign up first.' };
  }

  if (password && matched.password !== password) {
    return { success: false, error: 'Incorrect password for this user.' };
  }

  return { success: true, account: matched };
};

// --- Saved Session ---

export const getSavedSession = (): UserProfile | null => {
  try {
    const raw = atlasStorage.getItemSync(STORAGE_SESSION_KEY) || safeLocalStorage.getItem(STORAGE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserProfile;
    return {
      ...parsed,
      gamerpic: sanitizeAvatarUrl(parsed.gamerpic),
    };
  } catch {
    return null;
  }
};

export const saveSession = (profile: UserProfile | null) => {
  try {
    if (profile) {
      const serialized = JSON.stringify(profile);
      atlasStorage.setItemSync(STORAGE_SESSION_KEY, serialized);
    } else {
      atlasStorage.removeItem(STORAGE_SESSION_KEY);
    }
  } catch {
    // ignore
  }
};

// --- Network Directory (Search, Browse, & Real-Time Presence) ---

function mapAccountToNetworkUser(data: RegisteredAccount): NetworkUser {
  const presence = deriveUserPresence(data);
  return {
    username: data.username,
    avatarPic: sanitizeAvatarUrl(data.gamerpic),
    avatarBg: '#00A2FF',
    status: presence.status,
    currentGame: presence.currentGame,
    bio: 'Registered Atlas player.',
    isRegisteredUser: true,
  };
}

export const findNetworkUserAsync = async (username: string): Promise<NetworkUser | null> => {
  const clean = username.trim();
  const cleanLower = clean.toLowerCase();

  try {
    const accountRef = doc(db, 'accounts', cleanLower);
    const snap = await getDoc(accountRef);

    if (snap.exists()) {
      const data = snap.data() as RegisteredAccount;
      return mapAccountToNetworkUser(data);
    }
  } catch (err) {
    console.warn('findNetworkUserAsync cloud error:', err);
  }

  const local = getRegisteredAccounts().find((a) => a.username.toLowerCase() === cleanLower);
  if (local) {
    return mapAccountToNetworkUser(local);
  }

  return null;
};

export const getAllNetworkUsersAsync = async (excludeUsername?: string): Promise<NetworkUser[]> => {
  const excludeLower = excludeUsername?.trim().toLowerCase();
  const results: NetworkUser[] = [];

  try {
    const accountsCol = collection(db, 'accounts');
    const q = query(accountsCol, limit(100));
    const snap = await getDocs(q);

    snap.forEach((d) => {
      const data = d.data() as RegisteredAccount;
      if (!excludeLower || data.username.toLowerCase() !== excludeLower) {
        results.push(mapAccountToNetworkUser(data));
      }
    });

    if (results.length > 0) {
      return results;
    }
  } catch (err) {
    console.warn('getAllNetworkUsersAsync cloud error:', err);
  }

  return getAllNetworkUsers(excludeUsername);
};

export const getAllNetworkUsers = (excludeUsername?: string): NetworkUser[] => {
  const accounts = getRegisteredAccounts();
  const registeredNetworkUsers: NetworkUser[] = accounts.map(mapAccountToNetworkUser);

  if (!excludeUsername) return registeredNetworkUsers;
  const excludeClean = excludeUsername.trim().toLowerCase();
  return registeredNetworkUsers.filter((u) => u.username.toLowerCase() !== excludeClean);
};

export const subscribeToNetworkUsers = (
  excludeUsername: string | undefined,
  onUpdate: (users: NetworkUser[]) => void
): (() => void) => {
  const excludeLower = excludeUsername?.trim().toLowerCase();
  const accountsByKey = new Map<string, RegisteredAccount>();

  const emit = () => {
    const list: NetworkUser[] = [];
    for (const acc of accountsByKey.values()) {
      if (!excludeLower || acc.username.toLowerCase() !== excludeLower) {
        list.push(mapAccountToNetworkUser(acc));
      }
    }
    // Sort online/playing first, then alphabetically
    const rank = { playing: 0, online: 1, offline: 2 } as const;
    list.sort((a, b) => {
      const diff = rank[a.status] - rank[b.status];
      return diff !== 0 ? diff : a.username.localeCompare(b.username);
    });
    onUpdate(list);
  };

  const q = query(collection(db, 'accounts'), limit(100));
  const unsub = onSnapshot(
    q,
    (snapshot) => {
      accountsByKey.clear();
      snapshot.forEach((d) => {
        const data = d.data() as RegisteredAccount;
        if (data?.username) {
          accountsByKey.set(data.username.toLowerCase(), data);
        }
      });
      emit();
    },
    (err) => {
      console.warn('subscribeToNetworkUsers listener error:', err);
      onUpdate(getAllNetworkUsers(excludeUsername));
    }
  );

  // Re-evaluate lastSeenAt staleness periodically even if no writes happen
  const stalenessTimer = window.setInterval(emit, 15_000);

  return () => {
    unsub();
    window.clearInterval(stalenessTimer);
  };
};

export const findNetworkUser = (username: string): NetworkUser | null => {
  const clean = username.trim().toLowerCase();
  const all = getAllNetworkUsers();
  return all.find((u) => u.username.toLowerCase() === clean) || null;
};

// --- Real-time Friends & Requests (Firestore + Live Presence + Avatar Enrichment) ---

export const getFriendsForUser = (username: string): Friend[] => {
  if (!username) return [];
  try {
    const key = `atlas_friends_${username.trim().toLowerCase()}`;
    const raw = atlasStorage.getItemSync(key) || safeLocalStorage.getItem(key);
    const parsed: Friend[] = raw ? JSON.parse(raw) : [];
    // Cached friend list starts as offline until live presence arrives from Firestore
    return parsed.map((f) => ({ ...f, status: 'offline', currentGame: undefined }));
  } catch {
    return [];
  }
};

export const saveFriendsForUser = (username: string, friends: Friend[]) => {
  if (!username) return;
  try {
    const key = `atlas_friends_${username.trim().toLowerCase()}`;
    const serialized = JSON.stringify(friends);
    atlasStorage.setItemSync(key, serialized);
  } catch {
    // ignore
  }
};

export const getRequestsForUser = (username: string): FriendRequest[] => {
  if (!username) return [];
  try {
    const key = `atlas_requests_${username.trim().toLowerCase()}`;
    const raw = atlasStorage.getItemSync(key) || safeLocalStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const saveRequestsForUser = (username: string, requests: FriendRequest[]) => {
  if (!username) return;
  try {
    const key = `atlas_requests_${username.trim().toLowerCase()}`;
    const serialized = JSON.stringify(requests);
    atlasStorage.setItemSync(key, serialized);
  } catch {
    // ignore
  }
};

// Realtime subscription to friends enriched with live account presence & custom avatars
export const subscribeToFriends = (
  username: string,
  onUpdate: (friends: Friend[]) => void
): (() => void) => {
  if (!username) return () => {};
  const cleanLower = username.trim().toLowerCase();

  let rawFriendDocs: Array<{
    id: string;
    username: string;
    avatarBg: string;
    avatarPic: string;
    addedAt: string;
  }> = [];
  const liveAccounts = new Map<string, RegisteredAccount>();
  let friendsLoaded = false;

  const emitEnrichedFriends = () => {
    if (!friendsLoaded) return;
    const enriched: Friend[] = rawFriendDocs.map((f) => {
      const acc = liveAccounts.get(f.username.toLowerCase());
      const presence = deriveUserPresence(acc);
      const preferredPic = !isDefaultOrLegacyAvatar(acc?.gamerpic)
        ? acc!.gamerpic
        : !isDefaultOrLegacyAvatar(f.avatarPic)
          ? f.avatarPic
          : MISSING_TEXTURE_DATA_URL;
      return {
        id: f.id,
        username: acc?.username || f.username,
        status: presence.status,
        currentGame: presence.currentGame,
        avatarBg: f.avatarBg,
        avatarPic: preferredPic,
        addedAt: f.addedAt,
      };
    });

    const rank = { playing: 0, online: 1, offline: 2 } as const;
    enriched.sort((a, b) => {
      const diff = rank[a.status] - rank[b.status];
      return diff !== 0 ? diff : a.username.localeCompare(b.username);
    });

    saveFriendsForUser(username, enriched);
    onUpdate(enriched);
  };

  const friendsCol = collection(db, 'friends');
  const qFriends = query(friendsCol, where('ownerUsername', '==', cleanLower));
  const unsubFriends = onSnapshot(
    qFriends,
    (snapshot) => {
      friendsLoaded = true;
      rawFriendDocs = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data?.username) {
          rawFriendDocs.push({
            id: docSnap.id,
            username: data.username,
            avatarBg: data.avatarBg || '#00A2FF',
            avatarPic: data.avatarPic || MISSING_TEXTURE_DATA_URL,
            addedAt: data.addedAt || new Date().toISOString(),
          });
        }
      });
      emitEnrichedFriends();
    },
    (err) => {
      console.warn('subscribeToFriends listener error:', err);
      onUpdate(getFriendsForUser(username));
    }
  );

  const qAccounts = query(collection(db, 'accounts'), limit(200));
  const unsubAccounts = onSnapshot(
    qAccounts,
    (snapshot) => {
      liveAccounts.clear();
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as RegisteredAccount;
        if (data?.username) {
          liveAccounts.set(data.username.toLowerCase(), data);
        }
      });
      emitEnrichedFriends();
    },
    (err) => {
      console.warn('subscribeToFriends accounts sync error:', err);
    }
  );

  // Periodic staleness check so disconnected friends flip to offline when heartbeat expires
  const stalenessTimer = window.setInterval(emitEnrichedFriends, 15_000);

  return () => {
    unsubFriends();
    unsubAccounts();
    window.clearInterval(stalenessTimer);
  };
};

// Realtime subscription to incoming & outgoing requests enriched with latest custom avatars
export const subscribeToRequests = (
  username: string,
  onUpdate: (requests: FriendRequest[]) => void
): (() => void) => {
  if (!username) return () => {};
  const cleanLower = username.trim().toLowerCase();

  const reqCol = collection(db, 'friendRequests');
  const qIncoming = query(reqCol, where('toUser', '==', cleanLower));
  const qOutgoing = query(reqCol, where('fromUser', '==', cleanLower));

  let incomingList: FriendRequest[] = [];
  let outgoingList: FriendRequest[] = [];
  const liveAccounts = new Map<string, RegisteredAccount>();

  const mergeAndNotify = () => {
    const map = new Map<string, FriendRequest>();
    for (const r of incomingList) map.set(r.id, r);
    for (const r of outgoingList) map.set(r.id, r);
    const combined = Array.from(map.values()).map((r) => {
      const fromAcc = liveAccounts.get(r.fromUser.toLowerCase());
      const toAcc = liveAccounts.get(r.toUser.toLowerCase());
      const fromPic = !isDefaultOrLegacyAvatar(fromAcc?.gamerpic)
        ? fromAcc!.gamerpic
        : sanitizeAvatarUrl(r.fromPic);
      const toPic = !isDefaultOrLegacyAvatar(toAcc?.gamerpic)
        ? toAcc!.gamerpic
        : (r.toPic && !isDefaultOrLegacyAvatar(r.toPic) ? r.toPic : '');
      return {
        ...r,
        fromPic,
        toPic,
      };
    });
    saveRequestsForUser(username, combined);
    onUpdate(combined);
  };

  const unsubIncoming = onSnapshot(
    qIncoming,
    (snapshot) => {
      incomingList = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        incomingList.push({
          id: docSnap.id,
          fromUser: data.fromUser,
          toUser: data.toUser,
          fromPic: data.fromPic || MISSING_TEXTURE_DATA_URL,
          toPic: data.toPic || '',
          timestamp: data.timestamp || new Date().toISOString(),
          status: data.status || 'pending',
        });
      });
      mergeAndNotify();
    },
    (err) => {
      console.warn('subscribeToRequests incoming listener error:', err);
      onUpdate(getRequestsForUser(username));
    }
  );

  const unsubOutgoing = onSnapshot(
    qOutgoing,
    (snapshot) => {
      outgoingList = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        outgoingList.push({
          id: docSnap.id,
          fromUser: data.fromUser,
          toUser: data.toUser,
          fromPic: data.fromPic || MISSING_TEXTURE_DATA_URL,
          toPic: data.toPic || '',
          timestamp: data.timestamp || new Date().toISOString(),
          status: data.status || 'pending',
        });
      });
      mergeAndNotify();
    },
    (err) => {
      console.warn('subscribeToRequests outgoing listener error:', err);
    }
  );

  const qAccounts = query(collection(db, 'accounts'), limit(200));
  const unsubAccounts = onSnapshot(
    qAccounts,
    (snapshot) => {
      liveAccounts.clear();
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as RegisteredAccount;
        if (data?.username) {
          liveAccounts.set(data.username.toLowerCase(), data);
        }
      });
      mergeAndNotify();
    },
    () => null
  );

  return () => {
    unsubIncoming();
    unsubOutgoing();
    unsubAccounts();
  };
};

// Send Friend Request in Firestore
export const sendFriendRequestCloud = async (req: FriendRequest): Promise<void> => {
  const reqRef = doc(db, 'friendRequests', req.id);
  const optFromPic = req.fromPic?.startsWith('data:image')
    ? await compressImageToDataUrl(req.fromPic, 128, 128, 0.8)
    : (req.fromPic || MISSING_TEXTURE_DATA_URL);
  const optToPic = req.toPic?.startsWith('data:image')
    ? await compressImageToDataUrl(req.toPic, 128, 128, 0.8)
    : (req.toPic || '');

  await setDoc(reqRef, {
    id: req.id,
    fromUser: req.fromUser.trim().toLowerCase(),
    toUser: req.toUser.trim().toLowerCase(),
    fromPic: optFromPic,
    toPic: optToPic,
    timestamp: req.timestamp || new Date().toISOString(),
    status: req.status || 'pending',
  });
};

// Accept Friend Request: creates reciprocal friend links and removes request
export const acceptFriendRequestCloud = async (
  req: FriendRequest,
  currentUser: UserProfile
): Promise<void> => {
  const userA = currentUser.gamertag.trim().toLowerCase();
  const userB = req.fromUser.trim().toLowerCase();

  const optPicA = req.fromPic?.startsWith('data:image')
    ? await compressImageToDataUrl(req.fromPic, 128, 128, 0.8)
    : (req.fromPic || MISSING_TEXTURE_DATA_URL);
  const optPicB = currentUser.gamerpic?.startsWith('data:image')
    ? await compressImageToDataUrl(currentUser.gamerpic, 128, 128, 0.8)
    : (currentUser.gamerpic || MISSING_TEXTURE_DATA_URL);

  const friendIdA = `${userA}_${userB}`;
  const friendRefA = doc(db, 'friends', friendIdA);
  await setDoc(friendRefA, {
    id: friendIdA,
    ownerUsername: userA,
    username: req.fromUser,
    status: 'offline',
    avatarBg: '#00A2FF',
    avatarPic: optPicA,
    addedAt: new Date().toISOString(),
  });

  const friendIdB = `${userB}_${userA}`;
  const friendRefB = doc(db, 'friends', friendIdB);
  await setDoc(friendRefB, {
    id: friendIdB,
    ownerUsername: userB,
    username: currentUser.gamertag,
    status: 'online',
    avatarBg: '#00A2FF',
    avatarPic: optPicB,
    addedAt: new Date().toISOString(),
  });

  const reqRef = doc(db, 'friendRequests', req.id);
  await deleteDoc(reqRef).catch(() => null);
};

// Decline or cancel Friend Request in Firestore
export const declineFriendRequestCloud = async (requestId: string): Promise<void> => {
  const reqRef = doc(db, 'friendRequests', requestId);
  await deleteDoc(reqRef).catch(() => null);
};

// Unfriend helper in Firestore
export const unfriendUsersAsync = async (userA: string, userB: string): Promise<void> => {
  const cleanA = userA.trim().toLowerCase();
  const cleanB = userB.trim().toLowerCase();

  try {
    await deleteDoc(doc(db, 'friends', `${cleanA}_${cleanB}`)).catch(() => null);
    await deleteDoc(doc(db, 'friends', `${cleanB}_${cleanA}`)).catch(() => null);
  } catch (err) {
    console.warn('unfriendUsersAsync error:', err);
  }

  unfriendUsers(userA, userB);
};

export const unfriendUsers = (userA: string, userB: string) => {
  if (!userA || !userB) return;
  const cleanA = userA.trim().toLowerCase();
  const cleanB = userB.trim().toLowerCase();

  const friendsOfA = getFriendsForUser(cleanA);
  const updatedA = friendsOfA.filter((f) => f.username.toLowerCase() !== cleanB);
  saveFriendsForUser(cleanA, updatedA);

  const friendsOfB = getFriendsForUser(cleanB);
  const updatedB = friendsOfB.filter((f) => f.username.toLowerCase() !== cleanA);
  saveFriendsForUser(cleanB, updatedB);
};
