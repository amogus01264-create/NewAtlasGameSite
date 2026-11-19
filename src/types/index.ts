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
  htmlContent?: string;
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

export type NavTab = 'HOME' | 'GAMES' | 'MUSIC' | 'STREAMS' | 'FRIENDS' | 'SETTINGS';

export type MusicSource =
  | 'ytmusic'
  | 'spotify'
  | 'soundcloud'
  | 'audius'
  | 'apple'
  | 'deezer'
  | 'youtube'
  | 'direct';

export type RepeatMode = 'off' | 'all' | 'one';

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  durationSec: number;
  source: MusicSource;
  sourceName: string;
  sourceUrl: string;
  playbackType: 'youtube' | 'soundcloud' | 'audio' | 'resolve';
  playbackId?: string;
  streamUrl?: string;
  previewUrl?: string;
}

export interface MusicPlaylist {
  id: string;
  name: string;
  tracks: MusicTrack[];
  createdAt: string;
}

export interface LiveStream {
  id: string;
  streamer: string;
  streamerPic?: string;
  title: string;
  gameTitle: string;
  gameId?: string;
  visibility: 'public' | 'friends';
  status: 'live' | 'ended';
  startedAt: string;
  viewerCount: number;
  previewFrame?: string;
}

export interface StreamMessage {
  id: string;
  streamId: string;
  sender: string;
  senderPic?: string;
  text: string;
  timestamp: string;
}

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
  presenceStatus?: 'online' | 'playing' | 'offline';
  lastSeenAt?: number;
  currentGame?: string;
}

export type TabCloakPreset =
  | 'none'
  | 'classroom'
  | 'drive'
  | 'docs'
  | 'slides'
  | 'canvas'
  | 'desmos'
  | 'khan'
  | 'wikipedia'
  | 'custom';

export interface TabCloakConfig {
  preset: TabCloakPreset;
  customTitle?: string;
  customIcon?: string;
}

