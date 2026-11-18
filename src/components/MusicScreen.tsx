import React, { useEffect, useState } from 'react';
import {
  Search,
  Play,
  Pause,
  Heart,
  ListMusic,
  ListPlus,
  Plus,
  ExternalLink,
  Music2,
  Link2,
  Trash2,
  Disc3,
  Loader2,
  Compass,
  FolderPlus,
  RefreshCw,
  AlertCircle,
  Check,
  X,
} from 'lucide-react';
import { MusicPlaylist, MusicTrack } from '../types';
import {
  MUSIC_FILTER_OPTIONS,
  MUSIC_SOURCE_STYLES,
  fetchDiscoverTracks,
  formatDuration,
  resolveMusicUrl,
  searchMusicTracks,
} from '../services/musicService';
import { sounds } from '../services/soundEffects';

type LibrarySection =
  | { kind: 'discover' }
  | { kind: 'search'; query: string }
  | { kind: 'likes' }
  | { kind: 'queue' }
  | { kind: 'playlist'; playlistId: string };

interface MusicScreenProps {
  currentTrack: MusicTrack | null;
  isPlaying: boolean;
  isBuffering: boolean;
  queue: MusicTrack[];
  likedTracks: MusicTrack[];
  playlists: MusicPlaylist[];
  onPlayTrack: (track: MusicTrack, contextQueue?: MusicTrack[]) => void;
  onTogglePlayPause: () => void;
  onAddToQueue: (track: MusicTrack) => void;
  onRemoveFromQueue: (index: number) => void;
  onToggleLike: (track: MusicTrack) => void;
  onCreatePlaylist: (name: string, initialTracks?: MusicTrack[]) => MusicPlaylist;
  onDeletePlaylist: (playlistId: string) => void;
  onAddTrackToPlaylist: (playlistId: string, track: MusicTrack) => void;
  onRemoveTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  initialSection?: 'discover' | 'queue';
}

const TrackArtwork: React.FC<{ artwork?: string; title: string; isCurrent: boolean }> = ({
  artwork,
  title,
  isCurrent,
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [artwork]);

  return (
    <div
      className={`w-10 h-10 rounded-md overflow-hidden bg-[#141c2c] border flex items-center justify-center shrink-0 ${
        isCurrent ? 'border-[#00A2FF]' : 'border-slate-700/70'
      }`}
    >
      {artwork && !failed ? (
        <img
          src={artwork}
          alt={title}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <Music2 className={`w-4 h-4 ${isCurrent ? 'text-[#00A2FF]' : 'text-slate-400'}`} />
      )}
    </div>
  );
};

export const MusicScreen: React.FC<MusicScreenProps> = ({
  currentTrack,
  isPlaying,
  isBuffering,
  queue,
  likedTracks,
  playlists,
  onPlayTrack,
  onTogglePlayPause,
  onAddToQueue,
  onRemoveFromQueue,
  onToggleLike,
  onCreatePlaylist,
  onDeletePlaylist,
  onAddTrackToPlaylist,
  onRemoveTrackFromPlaylist,
  initialSection,
}) => {
  const [section, setSection] = useState<LibrarySection>(
    initialSection === 'queue' ? { kind: 'queue' } : { kind: 'discover' }
  );
  const [discoverTracks, setDiscoverTracks] = useState<MusicTrack[]>([]);
  const [searchTracks, setSearchTracks] = useState<MusicTrack[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // URL Importer state
  const [pasteUrl, setPasteUrl] = useState('');
  const [importingUrl, setImportingUrl] = useState(false);
  const [importFeedback, setImportFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  // Playlist creation & track menu state
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [playlistMenuTrackId, setPlaylistMenuTrackId] = useState<string | null>(null);
  const [queuedNoticeId, setQueuedNoticeId] = useState<string | null>(null);

  useEffect(() => {
    if (initialSection === 'queue') {
      setSection({ kind: 'queue' });
    }
  }, [initialSection]);

  const loadDiscover = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const tracks = await fetchDiscoverTracks();
      setDiscoverTracks(tracks);
    } catch (err: any) {
      setLoadError(err?.message || 'Unable to load multi-site catalog.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDiscover();
  }, []);

  const runSearch = async (queryText: string, source: string) => {
    const clean = queryText.trim();
    if (!clean) {
      setSection({ kind: 'discover' });
      return;
    }
    setSection({ kind: 'search', query: clean });
    setIsLoading(true);
    setLoadError(null);
    try {
      const tracks = await searchMusicTracks(clean, source);
      setSearchTracks(tracks);
    } catch (err: any) {
      setLoadError(err?.message || 'Search request failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sounds.playSelect();
    runSearch(searchInput, sourceFilter);
  };

  const handleSourceFilterClick = (nextSource: string) => {
    sounds.playSelect();
    setSourceFilter(nextSource);
    const activeQuery = searchInput.trim() || (section.kind === 'search' ? section.query.trim() : '');
    if (activeQuery) {
      runSearch(activeQuery, nextSource);
    }
  };

  const handleImportUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = pasteUrl.trim();
    if (!clean) return;
    setImportingUrl(true);
    setImportFeedback(null);
    try {
      const result = await resolveMusicUrl(clean);
      if (result.tracks.length === 0) {
        setImportFeedback({ type: 'err', text: 'No playable songs found at that link.' });
        return;
      }
      sounds.playLaunch();
      if (result.tracks.length === 1) {
        onPlayTrack(result.tracks[0], result.tracks);
        setImportFeedback({
          type: 'ok',
          text: `Playing "${result.tracks[0].title}" from ${result.tracks[0].sourceName}.`,
        });
      } else {
        const plName = result.playlistTitle || `Imported Mix (${result.tracks.length})`;
        const created = onCreatePlaylist(plName, result.tracks);
        onPlayTrack(result.tracks[0], result.tracks);
        setSection({ kind: 'playlist', playlistId: created.id });
        setImportFeedback({
          type: 'ok',
          text: `Imported ${result.tracks.length} tracks into "${created.name}".`,
        });
      }
      setPasteUrl('');
    } catch (err: any) {
      setImportFeedback({ type: 'err', text: err?.message || 'Could not resolve link.' });
    } finally {
      setImportingUrl(false);
    }
  };

  const handleCreatePlaylistSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newPlaylistName.trim();
    if (!clean) return;
    sounds.playSelect();
    const pl = onCreatePlaylist(clean);
    setNewPlaylistName('');
    setCreatingPlaylist(false);
    setSection({ kind: 'playlist', playlistId: pl.id });
  };

  // Determine displayed tracks based on current section & active source filter
  const activePlaylist =
    section.kind === 'playlist'
      ? playlists.find((p) => p.id === section.playlistId) || null
      : null;

  let rawTracks: MusicTrack[] = [];
  let sectionTitle = 'Discover Across Sites';
  let sectionSubtitle = 'Stream ad-free tracks from YouTube Music, Spotify, SoundCloud, Audius, Apple Music, and Deezer.';

  if (section.kind === 'discover') {
    rawTracks = discoverTracks;
  } else if (section.kind === 'search') {
    rawTracks = searchTracks;
    sectionTitle = `Results for "${section.query}"`;
    sectionSubtitle = 'Click any song to play ad-free, or click the site name next to a song to open it on that site.';
  } else if (section.kind === 'likes') {
    rawTracks = likedTracks;
    sectionTitle = 'Liked Songs';
    sectionSubtitle = 'Your saved favorite tracks across every music site.';
  } else if (section.kind === 'queue') {
    rawTracks = queue;
    sectionTitle = 'Up Next Queue';
    sectionSubtitle = 'Tracks lined up to play automatically without interruptions.';
  } else if (section.kind === 'playlist' && activePlaylist) {
    rawTracks = activePlaylist.tracks;
    sectionTitle = activePlaylist.name;
    sectionSubtitle = 'Custom multi-site playlist — mix tracks from any music service freely.';
  }

  const visibleTracks =
    section.kind === 'search' || sourceFilter === 'all'
      ? rawTracks
      : rawTracks.filter((t) => {
          if (sourceFilter === 'ytmusic') return t.source === 'ytmusic' || t.source === 'youtube';
          return t.source === sourceFilter;
        });

  const isLikedId = (id: string) => likedTracks.some((t) => t.id === id);

  return (
    <div className="relative z-10 w-full px-6 sm:px-8 py-4 max-w-7xl mx-auto select-none">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ================= LEFT SIDEBAR ================= */}
        <aside className="lg:col-span-3 flex flex-col gap-4">
          {/* Library Navigation */}
          <div className="bg-[#0e1420]/90 border border-slate-800/90 rounded-xl p-3 space-y-1">
            <div className="px-2 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Music Library
            </div>

            <button
              type="button"
              onClick={() => {
                sounds.playSelect();
                setSection({ kind: 'discover' });
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                section.kind === 'discover' || section.kind === 'search'
                  ? 'bg-[#00A2FF]/20 text-white border border-[#00A2FF]/40'
                  : 'text-slate-300 hover:bg-[#172033] hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-[#00A2FF]" />
                <span>Discover</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                sounds.playSelect();
                setSection({ kind: 'likes' });
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                section.kind === 'likes'
                  ? 'bg-[#00A2FF]/20 text-white border border-[#00A2FF]/40'
                  : 'text-slate-300 hover:bg-[#172033] hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-rose-400" />
                <span>Liked Songs</span>
              </span>
              <span className="font-mono tabular-nums text-[11px] text-slate-400">
                {likedTracks.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                sounds.playSelect();
                setSection({ kind: 'queue' });
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                section.kind === 'queue'
                  ? 'bg-[#00A2FF]/20 text-white border border-[#00A2FF]/40'
                  : 'text-slate-300 hover:bg-[#172033] hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2">
                <ListMusic className="w-4 h-4 text-cyan-400" />
                <span>Queue</span>
              </span>
              <span className="font-mono tabular-nums text-[11px] text-slate-400">
                {queue.length}
              </span>
            </button>
          </div>

          {/* Paste Song or Playlist Link */}
          <div className="bg-[#0e1420]/90 border border-slate-800/90 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
              <Link2 className="w-3.5 h-3.5 text-[#00A2FF]" />
              <span>Play From Any Link</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Paste a Spotify, YouTube Music, SoundCloud, Audius, Apple Music, or Deezer song/playlist URL.
            </p>
            <form onSubmit={handleImportUrl} className="space-y-2">
              <input
                type="text"
                value={pasteUrl}
                onChange={(e) => setPasteUrl(e.target.value)}
                placeholder="https://open.spotify.com/track/..."
                className="w-full bg-[#151d2e] text-white text-xs px-3 py-2 rounded-lg border border-slate-700/80 focus:outline-none focus:border-[#00A2FF]"
              />
              <button
                type="submit"
                disabled={importingUrl || !pasteUrl.trim()}
                className="w-full py-2 bg-[#00A2FF] hover:bg-[#1ab0ff] disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {importingUrl ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Resolving...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Load & Play</span>
                  </>
                )}
              </button>
            </form>
            {importFeedback && (
              <div
                className={`text-[11px] px-2.5 py-1.5 rounded-lg border ${
                  importFeedback.type === 'ok'
                    ? 'bg-emerald-950/50 border-emerald-700/50 text-emerald-300'
                    : 'bg-red-950/50 border-red-700/50 text-red-300'
                }`}
              >
                {importFeedback.text}
              </div>
            )}
          </div>

          {/* Playlists */}
          <div className="bg-[#0e1420]/90 border border-slate-800/90 rounded-xl p-3 space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Playlists
              </span>
              <button
                type="button"
                onClick={() => setCreatingPlaylist((prev) => !prev)}
                className="inline-flex items-center gap-1 text-xs font-bold text-[#00A2FF] hover:text-cyan-300 cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>New</span>
              </button>
            </div>

            {creatingPlaylist && (
              <form onSubmit={handleCreatePlaylistSubmit} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  placeholder="Playlist name..."
                  autoFocus
                  className="flex-1 min-w-0 bg-[#151d2e] text-white text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:border-[#00A2FF]"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1.5 bg-[#00B06F] hover:bg-[#00c87e] text-white text-xs font-bold rounded-lg cursor-pointer shrink-0"
                >
                  Add
                </button>
              </form>
            )}

            {playlists.length === 0 ? (
              <p className="text-xs text-slate-500 px-1 py-2">
                No playlists yet. Create one to combine songs from different music sites.
              </p>
            ) : (
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {playlists.map((pl) => {
                  const isActive = section.kind === 'playlist' && section.playlistId === pl.id;
                  return (
                    <div
                      key={pl.id}
                      onClick={() => {
                        sounds.playSelect();
                        setSection({ kind: 'playlist', playlistId: pl.id });
                      }}
                      className={`group flex items-center justify-between px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-[#00A2FF]/20 text-white border border-[#00A2FF]/40'
                          : 'text-slate-300 hover:bg-[#172033] hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Disc3 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-semibold truncate">{pl.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-mono tabular-nums text-[10px] text-slate-500">
                          {pl.tracks.length}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeletePlaylist(pl.id);
                            if (isActive) setSection({ kind: 'discover' });
                          }}
                          className="p-1 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          title="Delete playlist"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* ================= MAIN WORKSPACE ================= */}
        <section className="lg:col-span-9 flex flex-col gap-4">
          {/* Search + Source Filter Bar */}
          <div className="bg-[#0e1420]/90 border border-slate-800/90 rounded-xl p-4 space-y-3">
            <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search songs, artists, or albums across YouTube Music, Spotify, SoundCloud..."
                  className="w-full bg-[#151d2e] text-white text-xs sm:text-sm pl-10 pr-9 py-2 rounded-lg border border-slate-700/80 focus:outline-none focus:border-[#00A2FF]"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput('');
                      setSection({ kind: 'discover' });
                    }}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
                    title="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <button
                type="submit"
                className="px-5 py-2 bg-[#00A2FF] hover:bg-[#1ab0ff] text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Search All Sites
              </button>
            </form>

            {/* Site Filters */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {MUSIC_FILTER_OPTIONS.map((opt) => {
                const active = sourceFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSourceFilterClick(opt.id)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-[#00A2FF] text-white'
                        : 'bg-[#151d2e] text-slate-400 hover:text-white hover:bg-[#1e2940]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wider">
                {sectionTitle}
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">{sectionSubtitle}</p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {section.kind === 'discover' && (
                <button
                  type="button"
                  onClick={loadDiscover}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#151d2e] hover:bg-[#1d283f] border border-slate-700 text-slate-300 hover:text-white text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              )}

              {visibleTracks.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    sounds.playLaunch();
                    onPlayTrack(visibleTracks[0], visibleTracks);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#00B06F] hover:bg-[#00c87e] text-white text-xs font-black uppercase tracking-wider rounded-lg shadow-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Play All ({visibleTracks.length})</span>
                </button>
              )}
            </div>
          </div>

          {/* Track Table */}
          <div className="bg-[#0e1420]/90 border border-slate-800/90 rounded-xl overflow-hidden">
            {/* Column Header */}
            <div className="hidden sm:grid grid-cols-[40px_minmax(0,1fr)_165px_64px_104px] items-center gap-3 px-4 py-2.5 border-b border-slate-800/90 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <div className="text-center">#</div>
              <div>Song</div>
              <div>Source Site</div>
              <div className="text-right">Time</div>
              <div className="text-right">Actions</div>
            </div>

            {isLoading ? (
              <div className="divide-y divide-slate-800/60">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[40px_minmax(0,1fr)_140px] sm:grid-cols-[40px_minmax(0,1fr)_165px_64px_104px] items-center gap-3 px-4 py-3 animate-pulse"
                  >
                    <div className="h-3 w-4 mx-auto rounded bg-slate-800" />
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-md bg-slate-800 shrink-0" />
                      <div className="space-y-1.5 flex-1">
                        <div className="h-3 w-48 max-w-full rounded bg-slate-800" />
                        <div className="h-2.5 w-28 rounded bg-slate-800/80" />
                      </div>
                    </div>
                    <div className="h-3 w-24 rounded bg-slate-800" />
                    <div className="hidden sm:block h-3 w-10 ml-auto rounded bg-slate-800" />
                    <div className="hidden sm:block h-3 w-16 ml-auto rounded bg-slate-800" />
                  </div>
                ))}
              </div>
            ) : loadError ? (
              <div className="py-12 px-6 text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
                <p className="text-sm font-semibold text-white">{loadError}</p>
                <button
                  type="button"
                  onClick={() =>
                    section.kind === 'search' ? runSearch(section.query, sourceFilter) : loadDiscover()
                  }
                  className="px-4 py-2 bg-[#00A2FF] hover:bg-[#1ab0ff] text-white text-xs font-bold rounded-lg cursor-pointer"
                >
                  Try Again
                </button>
              </div>
            ) : visibleTracks.length === 0 ? (
              <div className="py-14 px-6 text-center space-y-3">
                <Music2 className="w-9 h-9 text-slate-500 mx-auto" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-white">No songs here yet</p>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    {section.kind === 'likes'
                      ? 'Click the heart icon on any song to save it to your Liked Songs.'
                      : section.kind === 'queue'
                        ? 'Play a song or click + Queue on any track to build your queue.'
                        : section.kind === 'playlist'
                          ? 'Add songs from Discover or Search using the + button on any track.'
                          : 'Try another search term, switch to All Sites, or paste a song URL on the left.'}
                  </p>
                </div>
                {section.kind !== 'discover' && (
                  <button
                    type="button"
                    onClick={() => setSection({ kind: 'discover' })}
                    className="px-4 py-2 bg-[#00A2FF] hover:bg-[#1ab0ff] text-white text-xs font-bold rounded-lg cursor-pointer"
                  >
                    Browse Discover
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-800/50">
                {visibleTracks.map((track, idx) => {
                  const isCurrent = currentTrack?.id === track.id;
                  const sourceStyle = MUSIC_SOURCE_STYLES[track.source] || MUSIC_SOURCE_STYLES.direct;
                  const liked = isLikedId(track.id);
                  const menuOpen = playlistMenuTrackId === track.id;

                  return (
                    <div
                      key={`${track.id}-${idx}`}
                      onClick={() => {
                        if (isCurrent) {
                          onTogglePlayPause();
                        } else {
                          sounds.playSelect();
                          onPlayTrack(track, visibleTracks);
                        }
                      }}
                      className={`group grid grid-cols-[36px_minmax(0,1fr)_auto] sm:grid-cols-[40px_minmax(0,1fr)_165px_64px_104px] items-center gap-3 px-4 py-2.5 transition-colors cursor-pointer ${
                        isCurrent ? 'bg-[#00A2FF]/12' : 'hover:bg-[#141c2c]/80'
                      }`}
                    >
                      {/* Index / Play Toggle */}
                      <div className="flex items-center justify-center">
                        <span
                          className={`font-mono tabular-nums text-xs group-hover:hidden ${
                            isCurrent ? 'text-[#00A2FF] font-bold' : 'text-slate-500'
                          }`}
                        >
                          {isCurrent && isPlaying ? '▶' : idx + 1}
                        </span>
                        <span className="hidden group-hover:flex items-center justify-center text-white">
                          {isCurrent && isBuffering ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#00A2FF]" />
                          ) : isCurrent && isPlaying ? (
                            <Pause className="w-3.5 h-3.5 fill-current text-[#00A2FF]" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current" />
                          )}
                        </span>
                      </div>

                      {/* Song Artwork + Title + Artist (+ Mobile Source Link) */}
                      <div className="flex items-center gap-3 min-w-0">
                        <TrackArtwork
                          artwork={track.artwork}
                          title={track.title}
                          isCurrent={isCurrent}
                        />
                        <div className="min-w-0">
                          <div
                            className={`text-sm font-bold truncate ${
                              isCurrent ? 'text-[#00A2FF]' : 'text-white'
                            }`}
                          >
                            {track.title}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-400 truncate">
                            <span className="truncate">{track.artist}</span>
                            {track.album && (
                              <>
                                <span className="hidden md:inline text-slate-600">·</span>
                                <span className="hidden md:inline truncate text-slate-500">
                                  {track.album}
                                </span>
                              </>
                            )}
                          </div>
                          {/* Mobile-only source link directly beside song */}
                          <div className="sm:hidden mt-0.5">
                            <a
                              href={track.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title={`Open "${track.title}" on ${track.sourceName}`}
                              className={`inline-flex items-center gap-1 text-[11px] font-semibold hover:underline underline-offset-2 ${sourceStyle.accentClass}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${sourceStyle.dotClass}`} />
                              <span>{track.sourceName}</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      </div>

                      {/* Desktop Clickable Source Site Link Right Next to Song */}
                      <div className="hidden sm:flex items-center min-w-0">
                        <a
                          href={track.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title={`Click to open this song on ${track.sourceName}`}
                          className={`inline-flex items-center gap-1.5 text-xs font-bold hover:underline underline-offset-2 truncate transition-colors ${sourceStyle.accentClass}`}
                        >
                          <span className={`w-2 h-2 rounded-full shrink-0 ${sourceStyle.dotClass}`} />
                          <span className="truncate">{track.sourceName}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </div>

                      {/* Duration */}
                      <div className="hidden sm:block text-right font-mono tabular-nums text-xs text-slate-400">
                        {track.durationSec > 0 ? formatDuration(track.durationSec) : '—'}
                      </div>

                      {/* Actions */}
                      <div
                        className="relative flex items-center justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => onToggleLike(track)}
                          className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                            liked
                              ? 'text-rose-400 hover:bg-rose-950/40'
                              : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                          }`}
                          title={liked ? 'Unlike' : 'Like song'}
                        >
                          <Heart className={`w-3.5 h-3.5 ${liked ? 'fill-rose-400' : ''}`} />
                        </button>

                        {section.kind === 'queue' ? (
                          <button
                            type="button"
                            onClick={() => onRemoveFromQueue(idx)}
                            className="p-1.5 rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-800/80 cursor-pointer"
                            title="Remove from Queue"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              onAddToQueue(track);
                              setQueuedNoticeId(track.id);
                              setTimeout(() => setQueuedNoticeId(null), 1200);
                            }}
                            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800/80 cursor-pointer"
                            title="Add to Queue"
                          >
                            {queuedNoticeId === track.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <ListPlus className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}

                        {section.kind === 'playlist' && activePlaylist ? (
                          <button
                            type="button"
                            onClick={() => onRemoveTrackFromPlaylist(activePlaylist.id, track.id)}
                            className="p-1.5 rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-800/80 cursor-pointer"
                            title="Remove from playlist"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setPlaylistMenuTrackId(menuOpen ? null : track.id)
                            }
                            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800/80 cursor-pointer"
                            title="Add to Playlist"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {menuOpen && (
                          <div className="absolute right-0 top-full mt-1 w-48 bg-[#141a28] border border-slate-700 rounded-xl shadow-2xl z-30 p-2 space-y-1">
                            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Add to Playlist
                            </div>
                            {playlists.length === 0 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const created = onCreatePlaylist('My Mix', [track]);
                                  setPlaylistMenuTrackId(null);
                                  setSection({ kind: 'playlist', playlistId: created.id });
                                }}
                                className="w-full text-left px-2 py-1.5 rounded-lg text-xs font-semibold text-cyan-300 hover:bg-slate-800 cursor-pointer"
                              >
                                + Create "My Mix"
                              </button>
                            ) : (
                              playlists.map((pl) => (
                                <button
                                  key={pl.id}
                                  type="button"
                                  onClick={() => {
                                    onAddTrackToPlaylist(pl.id, track);
                                    setPlaylistMenuTrackId(null);
                                  }}
                                  className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-slate-200 hover:bg-slate-800 truncate cursor-pointer"
                                >
                                  {pl.name}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
