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

// Local storage keys for caching and offline fallback
const STORAGE_ACCOUNTS_KEY = 'atlas_registered_accounts';
const STORAGE_SESSION_KEY = 'atlas_saved_session';

// --- Local Storage Helpers (Cache & Offline Support) ---
export const getRegisteredAccounts = (): RegisteredAccount[] => {
  try {
    const raw = localStorage.getItem(STORAGE_ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const clearLocalAccountsCache = () => {
  try {
    localStorage.removeItem(STORAGE_ACCOUNTS_KEY);
    localStorage.removeItem(STORAGE_SESSION_KEY);
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
    localStorage.setItem(STORAGE_ACCOUNTS_KEY, JSON.stringify(updated));
  } catch {
    // ignore local storage errors
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

  if (clean.length < 3) {
    return { success: false, error: 'Username must be at least 3 characters long.' };
  }

  try {
    const accountRef = doc(db, 'accounts', cleanLower);
    const existingSnap = await getDoc(accountRef);

    if (existingSnap.exists()) {
      return { success: false, error: 'Username is already taken by another player.' };
    }

    const accountData: RegisteredAccount = {
      username: clean,
      password: account.password,
      gamerpic: account.gamerpic || MISSING_TEXTURE_DATA_URL,
      birthday: account.birthday,
      gender: account.gender || null,
      createdAt: account.createdAt || new Date().toISOString(),
    };

    await setDoc(accountRef, accountData);
    cacheAccountLocally(accountData);
    return { success: true };
  } catch (err: any) {
    console.error('Cloud registration error:', err);
    // Fallback to local if network fails
    const local = getRegisteredAccounts();
    if (local.some((a) => a.username.toLowerCase() === cleanLower)) {
      return { success: false, error: 'Username is already taken by another player.' };
    }
    local.push({ ...account, username: clean });
    localStorage.setItem(STORAGE_ACCOUNTS_KEY, JSON.stringify(local));
    return { success: true };
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
    const raw = localStorage.getItem(STORAGE_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const saveSession = (profile: UserProfile | null) => {
  if (profile) {
    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(profile));
  } else {
    localStorage.removeItem(STORAGE_SESSION_KEY);
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

// --- Real-time Friends & Requests (Firestore + Local Sync) ---

export const getFriendsForUser = (username: string): Friend[] => {
  if (!username) return [];
  try {
    const raw = localStorage.getItem(`atlas_friends_${username.trim().toLowerCase()}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const saveFriendsForUser = (username: string, friends: Friend[]) => {
  if (!username) return;
  localStorage.setItem(`atlas_friends_${username.trim().toLowerCase()}`, JSON.stringify(friends));
};

export const getRequestsForUser = (username: string): FriendRequest[] => {
  if (!username) return [];
  try {
    const raw = localStorage.getItem(`atlas_requests_${username.trim().toLowerCase()}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const saveRequestsForUser = (username: string, requests: FriendRequest[]) => {
  if (!username) return;
  localStorage.setItem(`atlas_requests_${username.trim().toLowerCase()}`, JSON.stringify(requests));
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
  // Listen to requests directed to this user
  const qIncoming = query(reqCol, where('toUser', '==', cleanLower));

  const unsubscribe = onSnapshot(
    qIncoming,
    (snapshot) => {
      const list: FriendRequest[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          fromUser: data.fromUser,
          toUser: data.toUser,
          fromPic: data.fromPic || MISSING_TEXTURE_DATA_URL,
          toPic: data.toPic,
          timestamp: data.timestamp || new Date().toISOString(),
          status: data.status || 'pending',
        });
      });
      saveRequestsForUser(username, list);
      onUpdate(list);
    },
    (err) => {
      console.warn('subscribeToRequests listener error:', err);
      onUpdate(getRequestsForUser(username));
    }
  );

  return unsubscribe;
};

// Send Friend Request in Firestore
export const sendFriendRequestCloud = async (req: FriendRequest): Promise<void> => {
  const reqRef = doc(db, 'friendRequests', req.id);
  await setDoc(reqRef, {
    id: req.id,
    fromUser: req.fromUser.trim().toLowerCase(),
    toUser: req.toUser.trim().toLowerCase(),
    fromPic: req.fromPic || MISSING_TEXTURE_DATA_URL,
    toPic: req.toPic || '',
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

  // Create friend record for user A
  const friendRefA = doc(db, 'friends', `${userA}_${userB}`);
  await setDoc(friendRefA, {
    ownerUsername: userA,
    username: req.fromUser,
    status: 'online',
    avatarBg: '#00A2FF',
    avatarPic: req.fromPic || MISSING_TEXTURE_DATA_URL,
    addedAt: new Date().toISOString(),
  });

  // Create reciprocal friend record for user B
  const friendRefB = doc(db, 'friends', `${userB}_${userA}`);
  await setDoc(friendRefB, {
    ownerUsername: userB,
    username: currentUser.gamertag,
    status: 'online',
    avatarBg: '#00A2FF',
    avatarPic: currentUser.gamerpic || MISSING_TEXTURE_DATA_URL,
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
