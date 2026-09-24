export interface CustomGame {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  genre: string;
  description: string;
  addedAt: string;
  playedCount: number;
  lastPlayed?: string;
  favorite: boolean;
  launchMode?: 'auto' | 'proxy' | 'direct' | 'popout';
  isPreset?: boolean;
}

export interface Friend {
  id: string;
  username: string;
  status: 'online' | 'playing' | 'offline';
  currentGame?: string;
  avatarBg: string;
  avatarPic?: string;
  addedAt: string;
}

export interface FriendRequest {
  id: string;
  fromUser: string;
  toUser: string;
  fromPic: string;
  toPic?: string;
  timestamp: string;
  status: 'pending' | 'accepted' | 'declined';
}

export interface NetworkUser {
  username: string;
  avatarPic: string;
  avatarBg: string;
  status: 'online' | 'playing' | 'offline';
  currentGame?: string;
  bio?: string;
  isRegisteredUser?: boolean;
}

export type NavTab = 'HOME' | 'GAMES' | 'FRIENDS' | 'SETTINGS';

export interface UserProfile {
  gamertag: string;
  gamerpic: string;
  isGuest?: boolean;
  rememberMe?: boolean;
}

export interface RegisteredAccount {
  username: string;
  password: string;
  gamerpic: string;
  birthday?: {
    month: string;
    day: string;
    year: string;
  };
  gender?: 'female' | 'male' | null;
  createdAt: string;
}
