import {
  doc,
  getDoc,
  setDoc,
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

// --- Local & High-Capacity Storage Helpers (Cache & Offline Support) ---
export const getRegisteredAccounts = (): RegisteredAccount[] => {
  try {
    const raw = atlasStorage.getItemSync(STORAGE_ACCOUNTS_KEY) || safeLocalStorage.getItem(STORAGE_ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
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

  // Validate username: 3-20 characters, letters, numbers, underscores, dashes only
  if (clean.length < 3 || clean.length > 20) {
    return { success: false, error: 'Username must be between 3 and 20 characters.' };
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(clean)) {
    return {
      success: false,
      error: 'Username can only contain letters, numbers, underscores, and dashes (no spaces).',
    };
  }

  // Validate password
  if (!account.password || account.password.length < 4) {
    return { success: false, error: 'Password must be at least 4 characters long.' };
  }

  // Validate birthday - REQUIRED
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

    // Automatically compress avatar to tiny lightweight ~2KB size
    const optimizedPic = account.gamerpic?.startsWith('data:image')
      ? await compressImageToDataUrl(account.gamerpic, 96, 96, 0.75)
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
    // 1. Delete account document from Cloud Firestore
    const accountRef = doc(db, 'accounts', cleanLower);
    await deleteDoc(accountRef).catch((e) => console.warn('Cloud account delete doc error:', e));

    // 2. Clean up friends records where this user is the owner
    const friendsCol = collection(db, 'friends');
    const qFriendsOwner = query(friendsCol, where('ownerUsername', '==', cleanLower));
    const snapFriendsOwner = await getDocs(qFriendsOwner).catch(() => null);
    if (snapFriendsOwner) {
      for (const d of snapFriendsOwner.docs) {
        await deleteDoc(d.ref).catch(() => null);
      }
    }

    // 3. Clean up friends records where this user was added by others
    const qFriendsOthers = query(friendsCol, where('username', '==', clean));
    const snapFriendsOthers = await getDocs(qFriendsOthers).catch(() => null);
    if (snapFriendsOthers) {
      for (const d of snapFriendsOthers.docs) {
        await deleteDoc(d.ref).catch(() => null);
      }
    }

    // 4. Clean up friend requests where this user is the recipient or sender
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

    // 5. Clean up any active or past streams created by this user
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

    // 6. Clean up local storage
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
 * and local storage (fulfills user request to wipe test accounts).
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
      // Check local cache just in case
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

    cacheAccountLocally(data);
    return { success: true, account: data };
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

// Synchronous wrapper for existing components
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
  // Also push to Firestore in background
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
    return raw ? JSON.parse(raw) : null;
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

// --- Network Directory (Search & Browse) ---

export const findNetworkUserAsync = async (username: string): Promise<NetworkUser | null> => {
  const clean = username.trim();
  const cleanLower = clean.toLowerCase();

  try {
    const accountRef = doc(db, 'accounts', cleanLower);
    const snap = await getDoc(accountRef);

    if (snap.exists()) {
      const data = snap.data() as RegisteredAccount;
      return {
        username: data.username,
        avatarPic: data.gamerpic || MISSING_TEXTURE_DATA_URL,
        avatarBg: '#00A2FF',
        status: 'online',
        bio: 'Registered Atlas player.',
        isRegisteredUser: true,
      };
    }
  } catch (err) {
    console.warn('findNetworkUserAsync cloud error:', err);
  }

  // Local fallback
  const local = getRegisteredAccounts().find((a) => a.username.toLowerCase() === cleanLower);
  if (local) {
    return {
      username: local.username,
      avatarPic: local.gamerpic || MISSING_TEXTURE_DATA_URL,
      avatarBg: '#00A2FF',
      status: 'online',
      bio: 'Registered Atlas player.',
      isRegisteredUser: true,
    };
  }

  return null;
};

export const getAllNetworkUsersAsync = async (excludeUsername?: string): Promise<NetworkUser[]> => {
  const excludeLower = excludeUsername?.trim().toLowerCase();
  const results: NetworkUser[] = [];

  try {
    const accountsCol = collection(db, 'accounts');
    const q = query(accountsCol, limit(50));
    const snap = await getDocs(q);

    snap.forEach((d) => {
      const data = d.data() as RegisteredAccount;
      if (!excludeLower || data.username.toLowerCase() !== excludeLower) {
        results.push({
          username: data.username,
          avatarPic: data.gamerpic || MISSING_TEXTURE_DATA_URL,
          avatarBg: '#00A2FF',
          status: 'online',
          bio: 'Registered Atlas player.',
          isRegisteredUser: true,
        });
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
  const registeredNetworkUsers: NetworkUser[] = accounts.map((a) => ({
    username: a.username,
    avatarPic: a.gamerpic || MISSING_TEXTURE_DATA_URL,
    avatarBg: '#00A2FF',
    status: 'online',
    bio: 'Registered Atlas player.',
    isRegisteredUser: true,
  }));

  if (!excludeUsername) return registeredNetworkUsers;
  const excludeClean = excludeUsername.trim().toLowerCase();
  return registeredNetworkUsers.filter((u) => u.username.toLowerCase() !== excludeClean);
};

export const findNetworkUser = (username: string): NetworkUser | null => {
  const clean = username.trim().toLowerCase();
  const all = getAllNetworkUsers();
  return all.find((u) => u.username.toLowerCase() === clean) || null;
};

// --- Real-time Friends & Requests (Firestore + High-Capacity Local Sync) ---

export const getFriendsForUser = (username: string): Friend[] => {
  if (!username) return [];
  try {
    const key = `atlas_friends_${username.trim().toLowerCase()}`;
    const raw = atlasStorage.getItemSync(key) || safeLocalStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
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

// Realtime subscription to friends
export const subscribeToFriends = (
  username: string,
  onUpdate: (friends: Friend[]) => void
): (() => void) => {
  if (!username) return () => {};
  const cleanLower = username.trim().toLowerCase();

  const friendsCol = collection(db, 'friends');
  const q = query(friendsCol, where('ownerUsername', '==', cleanLower));

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const list: Friend[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          username: data.username,
          status: data.status || 'online',
          avatarBg: data.avatarBg || '#00A2FF',
          avatarPic: data.avatarPic || MISSING_TEXTURE_DATA_URL,
          addedAt: data.addedAt || new Date().toISOString(),
        });
      });
      saveFriendsForUser(username, list);
      onUpdate(list);
    },
    (err) => {
      console.warn('subscribeToFriends listener error:', err);
      // Fallback to local
      onUpdate(getFriendsForUser(username));
    }
  );

  return unsubscribe;
};

// Realtime subscription to incoming & outgoing requests
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

  const mergeAndNotify = () => {
    const map = new Map<string, FriendRequest>();
    for (const r of incomingList) map.set(r.id, r);
    for (const r of outgoingList) map.set(r.id, r);
    const combined = Array.from(map.values());
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

  return () => {
    unsubIncoming();
    unsubOutgoing();
  };
};

// Send Friend Request in Firestore
export const sendFriendRequestCloud = async (req: FriendRequest): Promise<void> => {
  const reqRef = doc(db, 'friendRequests', req.id);
  const optFromPic = req.fromPic?.startsWith('data:image')
    ? await compressImageToDataUrl(req.fromPic, 96, 96, 0.75)
    : (req.fromPic || MISSING_TEXTURE_DATA_URL);
  const optToPic = req.toPic?.startsWith('data:image')
    ? await compressImageToDataUrl(req.toPic, 96, 96, 0.75)
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
    ? await compressImageToDataUrl(req.fromPic, 96, 96, 0.75)
    : (req.fromPic || MISSING_TEXTURE_DATA_URL);
  const optPicB = currentUser.gamerpic?.startsWith('data:image')
    ? await compressImageToDataUrl(currentUser.gamerpic, 96, 96, 0.75)
    : (currentUser.gamerpic || MISSING_TEXTURE_DATA_URL);

  // Create friend record for user A
  const friendIdA = `${userA}_${userB}`;
  const friendRefA = doc(db, 'friends', friendIdA);
  await setDoc(friendRefA, {
    id: friendIdA,
    ownerUsername: userA,
    username: req.fromUser,
    status: 'online',
    avatarBg: '#00A2FF',
    avatarPic: optPicA,
    addedAt: new Date().toISOString(),
  });

  // Create reciprocal friend record for user B
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

  // Delete the fulfilled request
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

  // Also update local storage
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
