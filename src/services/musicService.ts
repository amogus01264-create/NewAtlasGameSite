import { MusicPlaylist, MusicSource, MusicTrack } from '../types';
import { atlasStorage } from './storageService';

export interface MusicSourceStyle {
  label: string;
  accentClass: string;
  dotClass: string;
}

export const MUSIC_SOURCE_STYLES: Record<MusicSource, MusicSourceStyle> = {
  spotify: {
    label: 'Spotify',
    accentClass: 'text-[#1DB954] hover:text-[#34e371]',
    dotClass: 'bg-[#1DB954]',
  },
  ytmusic: {
    label: 'YouTube Music',
    accentClass: 'text-[#FF4E45] hover:text-[#ff7870]',
    dotClass: 'bg-[#FF4E45]',
  },
  youtube: {
    label: 'YouTube',
    accentClass: 'text-[#FF4E45] hover:text-[#ff7870]',
    dotClass: 'bg-[#FF4E45]',
  },
  soundcloud: {
    label: 'SoundCloud',
    accentClass: 'text-[#FF7700] hover:text-[#ff983d]',
    dotClass: 'bg-[#FF7700]',
  },
  audius: {
    label: 'Audius',
    accentClass: 'text-[#C084FC] hover:text-[#d8b4fe]',
    dotClass: 'bg-[#C084FC]',
  },
  apple: {
    label: 'Apple Music',
    accentClass: 'text-[#FA586A] hover:text-[#ff8593]',
    dotClass: 'bg-[#FA586A]',
  },
  deezer: {
    label: 'Deezer',
    accentClass: 'text-[#38BDF8] hover:text-[#7dd3fc]',
    dotClass: 'bg-[#38BDF8]',
  },
  direct: {
    label: 'Direct Audio',
    accentClass: 'text-cyan-400 hover:text-cyan-300',
    dotClass: 'bg-cyan-400',
  },
};

export const MUSIC_FILTER_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'All Sites' },
  { id: 'ytmusic', label: 'YouTube Music' },
  { id: 'spotify', label: 'Spotify' },
  { id: 'soundcloud', label: 'SoundCloud' },
  { id: 'audius', label: 'Audius' },
  { id: 'apple', label: 'Apple Music' },
  { id: 'deezer', label: 'Deezer' },
];

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const s = Math.floor(seconds);
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${rem.toString().padStart(2, '0')}`;
}

/**
 * Safely calls an /api endpoint and ONLY parses JSON when the response is truly JSON.
 * Prevents "Unexpected token '<', '<!doctype '... is not valid JSON" when running behind
 * auth cookie-check redirects, about:blank wrappers, or static SPA hosting.
 */
async function safeFetchApiJson<T>(url: string): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const res = await fetch(url, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    const text = await res.text();
    const trimmed = text.trim();
    if (!trimmed || trimmed.startsWith('<')) {
      return { ok: false, status: res.status, data: null };
    }
    const parsed = JSON.parse(trimmed) as T;
    return { ok: res.ok, status: res.status, data: parsed };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

function fetchJsonp<T = any>(url: string, timeoutMs = 7000): Promise<T> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('No document available'));
      return;
    }
    const cbName = `__atlasMusicJsonp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const sep = url.includes('?') ? '&' : '?';
    const script = document.createElement('script');
    let settled = false;

    const cleanup = () => {
      try {
        delete (window as any)[cbName];
      } catch {
        (window as any)[cbName] = undefined;
      }
      if (script.parentNode) script.parentNode.removeChild(script);
    };

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('JSONP request timed out'));
    }, timeoutMs);

    (window as any)[cbName] = (data: T) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanup();
      resolve(data);
    };

    script.src = `${url}${sep}output=jsonp&callback=${encodeURIComponent(cbName)}`;
    script.async = true;
    script.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanup();
      reject(new Error('JSONP script error'));
    };

    document.head.appendChild(script);
  });
}

async function clientFetchAudius(query?: string, limit = 8): Promise<MusicTrack[]> {
  try {
    const endpoint = query
      ? `https://discoveryprovider.audius.co/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=AtlasMusic`
      : `https://discoveryprovider.audius.co/v1/tracks/trending?time=week&app_name=AtlasMusic`;
    const res = await fetch(endpoint);
    if (!res.ok) return [];
    const json = await res.json();
    const list = Array.isArray(json?.data) ? json.data : [];
    return list
      .filter((t: any) => t?.id && t?.title)
      .slice(0, limit)
      .map((t: any) => ({
        id: `audius:${t.id}`,
        title: String(t.title),
        artist: String(t.user?.name || t.user?.handle || 'Audius Artist'),
        album: t.genre ? String(t.genre) : undefined,
        artwork: t.artwork?.['480x480'] || t.artwork?.['150x150'] || undefined,
        durationSec: Number(t.duration) || 0,
        source: 'audius' as MusicSource,
        sourceName: 'Audius',
        sourceUrl: t.permalink ? `https://audius.co${t.permalink}` : `https://audius.co/tracks/${t.id}`,
        playbackType: 'audio' as const,
        streamUrl: `https://discoveryprovider.audius.co/v1/tracks/${encodeURIComponent(t.id)}/stream?app_name=AtlasMusic`,
      }));
  } catch {
    return [];
  }
}

async function clientFetchAppleMusic(query: string, limit = 8): Promise<MusicTrack[]> {
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=${limit}`
    );
    if (!res.ok) return [];
    const json = await res.json();
    const list = Array.isArray(json?.results) ? json.results : [];
    return list
      .filter((t: any) => t?.trackId && t?.trackName)
      .map((t: any) => ({
        id: `apple:${t.trackId}`,
        title: String(t.trackName),
        artist: String(t.artistName || 'Apple Music Artist'),
        album: t.collectionName ? String(t.collectionName) : undefined,
        artwork: t.artworkUrl100 ? String(t.artworkUrl100).replace('100x100bb', '400x400bb') : undefined,
        durationSec: Math.round((Number(t.trackTimeMillis) || 0) / 1000),
        source: 'apple' as MusicSource,
        sourceName: 'Apple Music',
        sourceUrl: String(t.trackViewUrl || 'https://music.apple.com'),
        playbackType: 'resolve' as const,
        previewUrl: t.previewUrl ? String(t.previewUrl) : undefined,
      }));
  } catch {
    return [];
  }
}

async function clientFetchDeezer(query?: string, limit = 8): Promise<MusicTrack[]> {
  try {
    const url = query
      ? `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=${limit}`
      : `https://api.deezer.com/chart/0/tracks?limit=${limit}`;
    const json = await fetchJsonp<any>(url);
    const list = Array.isArray(json?.data) ? json.data : [];
    return list
      .filter((t: any) => t?.id && t?.title)
      .map((t: any) => ({
        id: `deezer:${t.id}`,
        title: String(t.title),
        artist: String(t.artist?.name || 'Deezer Artist'),
        album: t.album?.title ? String(t.album.title) : undefined,
        artwork: t.album?.cover_big || t.album?.cover_medium || undefined,
        durationSec: Number(t.duration) || 0,
        source: 'deezer' as MusicSource,
        sourceName: 'Deezer',
        sourceUrl: String(t.link || `https://www.deezer.com/track/${t.id}`),
        playbackType: 'resolve' as const,
        previewUrl: t.preview ? String(t.preview) : undefined,
      }));
  } catch {
    return [];
  }
}

function interleaveClientTracks(buckets: MusicTrack[][]): MusicTrack[] {
  const out: MusicTrack[] = [];
  const maxLen = Math.max(0, ...buckets.map((b) => b.length));
  for (let i = 0; i < maxLen; i++) {
    for (const b of buckets) {
      if (b[i]) out.push(b[i]);
    }
  }
  return out;
}

export async function fetchDiscoverTracks(): Promise<MusicTrack[]> {
  const api = await safeFetchApiJson<{ tracks?: MusicTrack[] }>('/api/music/discover');
  if (api.ok && Array.isArray(api.data?.tracks) && api.data.tracks.length > 0) {
    return api.data.tracks;
  }

  // Fallback directly via browser-accessible live music APIs (Audius + Deezer + Apple Music)
  const [audius, deezer, apple] = await Promise.all([
    clientFetchAudius(undefined, 10),
    clientFetchDeezer(undefined, 10),
    clientFetchAppleMusic('top hits', 8),
  ]);
  const combined = interleaveClientTracks([audius, deezer, apple]);
  if (combined.length === 0) {
    throw new Error('Unable to reach music services right now. Check your connection and try again.');
  }
  return combined;
}

export async function searchMusicTracks(query: string, source = 'all'): Promise<MusicTrack[]> {
  const params = new URLSearchParams({ q: query, source });
  const api = await safeFetchApiJson<{ tracks?: MusicTrack[] }>(`/api/music/search?${params.toString()}`);
  if (api.ok && Array.isArray(api.data?.tracks)) {
    return api.data.tracks;
  }

  // Client-side multi-source fallback when backend route is unreachable or behind HTML proxy
  const tasks: Promise<MusicTrack[]>[] = [];
  if (source === 'all' || source === 'audius') {
    tasks.push(clientFetchAudius(query, source === 'all' ? 8 : 15));
  }
  if (source === 'all' || source === 'deezer') {
    tasks.push(clientFetchDeezer(query, source === 'all' ? 8 : 15));
  }
  if (source === 'all' || source === 'apple') {
    tasks.push(clientFetchAppleMusic(query, source === 'all' ? 8 : 15));
  }
  if (tasks.length === 0) {
    tasks.push(clientFetchAudius(query, 8), clientFetchDeezer(query, 8), clientFetchAppleMusic(query, 8));
  }
  return interleaveClientTracks(await Promise.all(tasks));
}

async function resolveMusicUrlClientFallback(
  rawUrl: string
): Promise<{ tracks: MusicTrack[]; playlistTitle?: string }> {
  const parsed = new URL(rawUrl);
  const host = parsed.hostname.toLowerCase();

  // Spotify URL via Spotify oEmbed (CORS *)
  if (host.includes('spotify.com')) {
    const m = parsed.pathname.match(/\/(track|album|playlist)\/([a-zA-Z0-9]+)/);
    if (!m) throw new Error('Use a Spotify track, album, or playlist link.');
    const oRes = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(rawUrl)}`);
    if (!oRes.ok) throw new Error('Could not read that Spotify link.');
    const o = await oRes.json();
    const rawTitle = String(o?.title || 'Spotify Track');
    return {
      tracks: [
        {
          id: `spotify:${m[2]}`,
          title: rawTitle,
          artist: 'Spotify',
          artwork: o?.thumbnail_url ? String(o.thumbnail_url) : undefined,
          durationSec: 0,
          source: 'spotify',
          sourceName: 'Spotify',
          sourceUrl: rawUrl,
          playbackType: 'resolve',
        },
      ],
    };
  }

  // YouTube / YouTube Music URL via noembed (CORS *)
  if (host.includes('youtube.com') || host.includes('youtu.be')) {
    let videoId = '';
    if (host.includes('youtu.be')) {
      videoId = parsed.pathname.replace(/^\/+/, '').split('/')[0];
    } else {
      videoId = parsed.searchParams.get('v') || '';
    }
    if (!/^[a-zA-Z0-9_-]{6,15}$/.test(videoId)) {
      throw new Error('Invalid YouTube or YouTube Music link.');
    }
    const isYtMusic = host.includes('music.youtube.com');
    let title = 'YouTube Track';
    let artist = isYtMusic ? 'YouTube Music' : 'YouTube';
    let artwork = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    try {
      const nRes = await fetch(
        `https://noembed.com/embed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`
      );
      if (nRes.ok) {
        const o = await nRes.json();
        if (o?.title) title = String(o.title);
        if (o?.author_name) artist = String(o.author_name).replace(/\s*-\s*Topic$/i, '');
        if (o?.thumbnail_url) artwork = String(o.thumbnail_url);
      }
    } catch {}

    return {
      tracks: [
        {
          id: `${isYtMusic ? 'ytmusic' : 'youtube'}:${videoId}`,
          title,
          artist,
          artwork,
          durationSec: 0,
          source: isYtMusic ? 'ytmusic' : 'youtube',
          sourceName: isYtMusic ? 'YouTube Music' : 'YouTube',
          sourceUrl: isYtMusic
            ? `https://music.youtube.com/watch?v=${videoId}`
            : `https://www.youtube.com/watch?v=${videoId}`,
          playbackType: 'youtube',
          playbackId: videoId,
        },
      ],
    };
  }

  // SoundCloud URL via SoundCloud oEmbed (CORS *)
  if (host.includes('soundcloud.com')) {
    const cleanUrl = `${parsed.origin}${parsed.pathname}`;
    const oRes = await fetch(
      `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(cleanUrl)}`
    );
    if (!oRes.ok) throw new Error('Could not read that SoundCloud link.');
    const o = await oRes.json();
    return {
      tracks: [
        {
          id: `soundcloud:${encodeURIComponent(cleanUrl)}`,
          title: String(o?.title || 'SoundCloud Track').replace(/\s+by\s+.+$/i, ''),
          artist: String(o?.author_name || 'SoundCloud Artist'),
          artwork: o?.thumbnail_url ? String(o.thumbnail_url) : undefined,
          durationSec: 0,
          source: 'soundcloud',
          sourceName: 'SoundCloud',
          sourceUrl: cleanUrl,
          playbackType: 'soundcloud',
          playbackId: cleanUrl,
        },
      ],
    };
  }

  // Deezer URL via JSONP
  if (host.includes('deezer.com')) {
    const m = parsed.pathname.match(/\/track\/(\d+)/);
    if (!m) throw new Error('Use a Deezer track link (deezer.com/track/...).');
    const t = await fetchJsonp<any>(`https://api.deezer.com/track/${m[1]}`);
    return {
      tracks: [
        {
          id: `deezer:${t.id}`,
          title: String(t.title || 'Deezer Track'),
          artist: String(t.artist?.name || 'Deezer Artist'),
          album: t.album?.title,
          artwork: t.album?.cover_big || t.album?.cover_medium,
          durationSec: Number(t.duration) || 0,
          source: 'deezer',
          sourceName: 'Deezer',
          sourceUrl: String(t.link || rawUrl),
          playbackType: 'resolve',
          previewUrl: t.preview,
        },
      ],
    };
  }

  // Apple Music URL
  if (host.includes('music.apple.com')) {
    const idParam = parsed.searchParams.get('i') || parsed.pathname.split('/').pop() || '';
    if (!/^\d+$/.test(idParam)) throw new Error('Use an Apple Music song link.');
    const res = await fetch(`https://itunes.apple.com/lookup?id=${idParam}&entity=song`);
    const data = await res.json();
    const t = Array.isArray(data?.results) ? data.results.find((r: any) => r.trackName) : null;
    if (!t) throw new Error('Song not found on Apple Music.');
    return {
      tracks: [
        {
          id: `apple:${t.trackId}`,
          title: String(t.trackName),
          artist: String(t.artistName || 'Apple Music Artist'),
          album: t.collectionName,
          artwork: t.artworkUrl100 ? String(t.artworkUrl100).replace('100x100bb', '400x400bb') : undefined,
          durationSec: Math.round((Number(t.trackTimeMillis) || 0) / 1000),
          source: 'apple',
          sourceName: 'Apple Music',
          sourceUrl: String(t.trackViewUrl || rawUrl),
          playbackType: 'resolve',
          previewUrl: t.previewUrl,
        },
      ],
    };
  }

  // Audius URL
  if (host.includes('audius.co')) {
    const res = await fetch(
      `https://discoveryprovider.audius.co/v1/resolve?url=${encodeURIComponent(rawUrl)}&app_name=AtlasMusic`
    );
    const resolved = await res.json();
    const t = resolved?.data;
    if (!t?.id) throw new Error('Track not found on Audius.');
    return {
      tracks: [
        {
          id: `audius:${t.id}`,
          title: String(t.title || 'Audius Track'),
          artist: String(t.user?.name || t.user?.handle || 'Audius Artist'),
          artwork: t.artwork?.['480x480'] || t.artwork?.['150x150'],
          durationSec: Number(t.duration) || 0,
          source: 'audius',
          sourceName: 'Audius',
          sourceUrl: rawUrl,
          playbackType: 'audio',
          streamUrl: `https://discoveryprovider.audius.co/v1/tracks/${encodeURIComponent(t.id)}/stream?app_name=AtlasMusic`,
        },
      ],
    };
  }

  // Direct Audio URL
  if (/\.(mp3|ogg|wav|m4a|flac|aac|webm)(\?|$)/i.test(rawUrl)) {
    const fname = decodeURIComponent(parsed.pathname.split('/').pop() || 'Audio Track').replace(
      /\.[^.]+$/,
      ''
    );
    return {
      tracks: [
        {
          id: `direct:${encodeURIComponent(rawUrl)}`,
          title: fname || 'Direct Audio',
          artist: parsed.hostname,
          durationSec: 0,
          source: 'direct',
          sourceName: parsed.hostname,
          sourceUrl: rawUrl,
          playbackType: 'audio',
          streamUrl: rawUrl,
        },
      ],
    };
  }

  throw new Error(
    'Supported links: YouTube Music, YouTube, Spotify, SoundCloud, Audius, Apple Music, Deezer, or direct audio URLs.'
  );
}

export async function resolveMusicUrl(
  url: string
): Promise<{ tracks: MusicTrack[]; playlistTitle?: string }> {
  const api = await safeFetchApiJson<{
    tracks?: MusicTrack[];
    playlistTitle?: string;
    error?: string;
  }>(`/api/music/resolve?url=${encodeURIComponent(url)}`);

  if (api.data) {
    if (!api.ok) {
      throw new Error(api.data.error || 'Could not resolve music link.');
    }
    return {
      tracks: Array.isArray(api.data.tracks) ? api.data.tracks : [],
      playlistTitle: api.data.playlistTitle,
    };
  }

  return resolveMusicUrlClientFallback(url);
}

const CLIENT_PLACEHOLDER_ARTISTS = new Set([
  'spotify',
  'spotify artist',
  'youtube',
  'youtube music',
  'soundcloud',
  'soundcloud artist',
  'apple music',
  'apple music artist',
  'deezer',
  'deezer artist',
  'audius',
  'audius artist',
]);

function normClientMusicStr(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export async function resolveFullStream(
  title: string,
  artist: string,
  expectedDurationSec = 0,
  excludeYtIds: string[] = [],
  skipYoutube = false
): Promise<{
  playbackType: 'audio' | 'youtube' | 'preview';
  streamUrl?: string;
  playbackId?: string;
  durationSec?: number;
}> {
  const params = new URLSearchParams({
    title,
    artist,
    ...(expectedDurationSec > 0 ? { duration: String(Math.round(expectedDurationSec)) } : {}),
    ...(excludeYtIds.length > 0 ? { excludeIds: excludeYtIds.join(',') } : {}),
    ...(skipYoutube ? { skipYoutube: '1' } : {}),
  });
  const api = await safeFetchApiJson<{
    playbackType: 'audio' | 'youtube' | 'preview';
    streamUrl?: string;
    playbackId?: string;
    durationSec?: number;
  }>(`/api/music/resolve-stream?${params.toString()}`);

  if (api.ok && api.data) {
    return api.data;
  }

  // Client fallback: match on Audius strictly (never return an unrelated track)
  const cleanArtist = CLIENT_PLACEHOLDER_ARTISTS.has(artist.trim().toLowerCase()) ? '' : artist.trim();
  const audiusMatches = await clientFetchAudius(`${title} ${cleanArtist}`.trim(), 6);
  const reqTitleNorm = normClientMusicStr(title);
  const reqTitleTokens = reqTitleNorm.split(' ').filter((w) => w.length >= 2);
  const reqArtistTokens = normClientMusicStr(cleanArtist)
    .split(' ')
    .filter((w) => w.length >= 2);

  const verifiedAudius = audiusMatches.find((cand) => {
    if (!cand.streamUrl) return false;
    const candTitle = normClientMusicStr(cand.title);
    const candCombined = `${candTitle} ${normClientMusicStr(cand.artist)}`;
    const unwanted = ['remix', 'edit', 'bootleg', 'flip', 'cover', 'slowed', 'nightcore', 'sped', 'karaoke', 'instrumental'];
    if (unwanted.some((q) => !reqTitleNorm.includes(q) && new RegExp(`(?:^| )${q}(?: |$)`).test(candCombined))) {
      return false;
    }
    const titleOk =
      candTitle === reqTitleNorm ||
      (reqTitleTokens.length > 0 &&
        reqTitleTokens.filter((tok) => candTitle.includes(tok)).length / reqTitleTokens.length >= 0.75);
    if (!titleOk) return false;
    if (reqArtistTokens.length > 0 && !reqArtistTokens.some((tok) => candCombined.includes(tok))) {
      return false;
    }
    if (expectedDurationSec > 0 && cand.durationSec > 0) {
      if (Math.abs(cand.durationSec - expectedDurationSec) > 25) return false;
    }
    return true;
  });

  if (verifiedAudius && verifiedAudius.streamUrl) {
    return {
      playbackType: 'audio',
      streamUrl: verifiedAudius.streamUrl,
      durationSec: verifiedAudius.durationSec,
    };
  }
  return { playbackType: 'preview' };
}

function scopeKey(username: string | undefined, suffix: string): string {
  const clean = (username || 'guest').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return `atlas_music_${clean}_${suffix}`;
}

export function loadLikedTracks(username?: string): MusicTrack[] {
  try {
    const raw = atlasStorage.getItemSync(scopeKey(username, 'likes'));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLikedTracks(username: string | undefined, tracks: MusicTrack[]): void {
  try {
    atlasStorage.setItemSync(scopeKey(username, 'likes'), JSON.stringify(tracks));
  } catch {}
}

export function loadPlaylists(username?: string): MusicPlaylist[] {
  try {
    const raw = atlasStorage.getItemSync(scopeKey(username, 'playlists'));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePlaylists(username: string | undefined, playlists: MusicPlaylist[]): void {
  try {
    atlasStorage.setItemSync(scopeKey(username, 'playlists'), JSON.stringify(playlists));
  } catch {}
}
