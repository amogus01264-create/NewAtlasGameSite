import { Friend, FriendRequest, NetworkUser, RegisteredAccount, UserProfile } from '../types';
import { MISSING_TEXTURE_DATA_URL } from '../utils/assets';

// Accounts Management: Only real registered user accounts exist on Atlas
export const getRegisteredAccounts = (): RegisteredAccount[] => {
  try {
    const raw = localStorage.getItem('atlas_registered_accounts');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
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
  if (clean.length < 3) {
    return { success: false, error: 'Username must be at least 3 characters long.' };
  }
  if (isUsernameTaken(clean)) {
    return { success: false, error: 'Username is already taken by another player.' };
  }

  const accounts = getRegisteredAccounts();
  accounts.push({ ...account, username: clean });
  localStorage.setItem('atlas_registered_accounts', JSON.stringify(accounts));
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

// Saved Session
export const getSavedSession = (): UserProfile | null => {
  try {
    const raw = localStorage.getItem('atlas_saved_session');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const saveSession = (profile: UserProfile | null) => {
  if (profile) {
    localStorage.setItem('atlas_saved_session', JSON.stringify(profile));
  } else {
    localStorage.removeItem('atlas_saved_session');
  }
};

// Account-Scoped Friends
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

// Bidirectional unfriend helper: removes each player from the other's friends list
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

// Account-Scoped Friend Requests
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

// Directory: All Real Network Users Only (No fake or bot players)
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
