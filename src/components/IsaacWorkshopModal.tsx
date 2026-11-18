import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Lock,
  Plus,
  Check,
  Download,
  Trash2,
  X,
  RefreshCw,
  AlertCircle,
  Package,
  ChevronLeft,
  ChevronRight,
  Play,
  Loader2,
} from 'lucide-react';
import { sounds } from '../services/soundEffects';

export interface WorkshopModItem {
  id: string;
  title: string;
  description: string;
  previewUrl: string;
  fileSize: number;
  subscriptions: number;
  favorited: number;
  views: number;
  timeUpdated: number;
  tags: string[];
  workshopUrl: string;
  withinBudget: boolean;
  added: boolean;
  cachedZipBytes: number | null;
}

export interface AddedIsaacMod {
  id: string;
  name: string;
  description: string;
  previewUrl: string;
  bytes: number;
  fileSize: number;
  subscriptions: number;
  tags: string[];
  addedAt: string;
}

interface IsaacWorkshopModalProps {
  onClose: () => void;
  onReloadIsaac?: () => void;
  onLaunchIsaac?: () => void;
  isGameRunning?: boolean;
}

const SORT_OPTIONS = [
  { value: 'totaluniquesubscribers', label: 'Most Subscribed' },
  { value: 'trend', label: 'Trending' },
  { value: 'mostrecent', label: 'Most Recent' },
  { value: 'toprated', label: 'Top Rated' },
];

const TAG_OPTIONS = [
  'All',
  'Items',
  'Characters',
  'Tweaks',
  'Graphics',
  'Music',
  'Sound Effects',
  'Rooms',
];

const BUDGET_BYTES = 96 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatCount(n: number): string {
  if (!n) return '0';
  return n.toLocaleString();
}

export const IsaacWorkshopModal: React.FC<IsaacWorkshopModalProps> = ({
  onClose,
  onReloadIsaac,
  onLaunchIsaac,
  isGameRunning = false,
}) => {
  const [activeTab, setActiveTab] = useState<'browse' | 'added'>('browse');
  const [searchInput, setSearchInput] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [sort, setSort] = useState('totaluniquesubscribers');
  const [tag, setTag] = useState('All');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const [results, setResults] = useState<WorkshopModItem[]>([]);
  const [addedMods, setAddedMods] = useState<AddedIsaacMod[]>([]);
  const [isSearching, setIsSearching] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [needsReload, setNeedsReload] = useState(false);

  const fetchAddedMods = useCallback(async () => {
    try {
      const res = await fetch('/api/isaac/mods');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.mods)) {
        setAddedMods(data.mods);
      }
    } catch {}
  }, []);

  const searchWorkshop = useCallback(
    async (q: string, sortVal: string, tagVal: string, pageNum: number) => {
      setIsSearching(true);
      setSearchError(null);
      try {
        const params = new URLSearchParams({
          q,
          sort: sortVal,
          tag: tagVal,
          page: String(pageNum),
        });
        const res = await fetch(`/api/isaac/workshop/search?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to load Isaac Workshop.');
        }
        setResults(Array.isArray(data.items) ? data.items : []);
        setHasMore(Boolean(data.hasMore));
      } catch (err: any) {
        setSearchError(err?.message || 'Unable to connect to Steam Workshop.');
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchAddedMods();
  }, [fetchAddedMods]);

  useEffect(() => {
    searchWorkshop(submittedQuery, sort, tag, page);
  }, [submittedQuery, sort, tag, page, searchWorkshop]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sounds.playSelect();
    setPage(1);
    setSubmittedQuery(searchInput.trim());
  };

  const handleAddMod = async (mod: WorkshopModItem) => {
    if (addingId) return;
    sounds.playSelect();
    setAddingId(mod.id);
    setActionFeedback(null);

    try {
      const res = await fetch('/api/isaac/workshop/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: mod.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Could not add this mod.');
      }

      setResults((prev) =>
        prev.map((item) =>
          item.id === mod.id
            ? { ...item, added: true, cachedZipBytes: data.mod?.bytes || item.fileSize }
            : item
        )
      );
      await fetchAddedMods();
      setNeedsReload(true);
      sounds.playLaunch();
      setActionFeedback({
        type: 'success',
        message: `"${mod.title}" added to Isaac Mod Browser (${formatBytes(data.mod?.bytes || mod.fileSize)}).`,
      });
    } catch (err: any) {
      sounds.playBack();
      setActionFeedback({
        type: 'error',
        message: err?.message || 'Failed to fetch mod archive from Workshop.',
      });
    } finally {
      setAddingId(null);
    }
  };

  const handleRemoveMod = async (id: string, name: string) => {
    if (removingId) return;
    sounds.playBack();
    setRemovingId(id);
    try {
      await fetch(`/api/isaac/mods/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setAddedMods((prev) => prev.filter((m) => m.id !== id));
      setResults((prev) =>
        prev.map((item) => (item.id === id ? { ...item, added: false, cachedZipBytes: null } : item))
      );
      setNeedsReload(true);
      setActionFeedback({
        type: 'success',
        message: `Removed "${name}" from your Isaac catalogue.`,
      });
    } catch {
      setActionFeedback({
        type: 'error',
        message: `Could not remove "${name}".`,
      });
    } finally {
      setRemovingId(null);
    }
  };

  const addedIdSet = new Set(addedMods.map((m) => m.id));
  const totalAddedBytes = addedMods.reduce((sum, m) => sum + (m.bytes || 0), 0);
  const budgetPct = Math.min(100, Math.round((totalAddedBytes / BUDGET_BYTES) * 100));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md select-none">
      <div className="relative w-full max-w-5xl h-[88vh] bg-[#111622] border border-[#262f45] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header Bar */}
        <div className="flex items-center justify-between gap-4 px-5 py-4 bg-[#161c2c] border-b border-[#262f45] shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-white">
              <h2 className="text-base sm:text-lg font-bold tracking-tight truncate">
                Steam Workshop · The Binding of Isaac: Repentance+
              </h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
              <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">
                Locked to Binding of Isaac Workshop (App 250900)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 p-1 bg-[#0d111b] rounded-lg border border-[#242c40]">
              <button
                type="button"
                onClick={() => {
                  sounds.playSelect();
                  setActiveTab('browse');
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'browse'
                    ? 'bg-[#00A2FF] text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Browse Workshop
              </button>
              <button
                type="button"
                onClick={() => {
                  sounds.playSelect();
                  setActiveTab('added');
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                  activeTab === 'added'
                    ? 'bg-[#00A2FF] text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Added Mods ({addedMods.length})
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                sounds.playBack();
                onClose();
              }}
              aria-label="Close Isaac Workshop"
              className="p-2 text-slate-400 hover:text-white rounded-lg bg-[#1e2639] hover:bg-[#28334c] border border-[#2d3854] transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Action Feedback Banner */}
        {actionFeedback && (
          <div
            className={`px-5 py-2.5 border-b flex items-center justify-between gap-3 text-xs shrink-0 ${
              actionFeedback.type === 'success'
                ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-200'
                : 'bg-red-950/50 border-red-800/60 text-red-200'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {actionFeedback.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              )}
              <span className="truncate">{actionFeedback.message}</span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {actionFeedback.type === 'success' && isGameRunning && onReloadIsaac && (
                <button
                  type="button"
                  onClick={() => {
                    sounds.playLaunch();
                    onReloadIsaac();
                    onClose();
                  }}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reload Isaac</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setActionFeedback(null)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
                aria-label="Dismiss message"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* BROWSE WORKSHOP TAB */}
        {activeTab === 'browse' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Search & Filters Toolbar */}
            <div className="px-5 py-3.5 bg-[#131826] border-b border-[#222a3d] space-y-3 shrink-0">
              <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search Isaac mods, paste a Workshop link, or enter a mod ID..."
                    className="w-full bg-[#0c101a] text-white text-sm pl-10 pr-4 py-2 rounded-lg border border-[#2a334a] focus:outline-none focus:border-[#00A2FF]"
                  />
                </div>

                <select
                  value={sort}
                  onChange={(e) => {
                    sounds.playSelect();
                    setSort(e.target.value);
                    setPage(1);
                  }}
                  aria-label="Sort Isaac mods"
                  className="bg-[#0c101a] text-slate-200 text-xs font-medium px-3 py-2 rounded-lg border border-[#2a334a] focus:outline-none focus:border-[#00A2FF] cursor-pointer"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                <button
                  type="submit"
                  className="px-4 py-2 bg-[#00A2FF] hover:bg-[#19adff] text-white text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Search Mods
                </button>
              </form>

              {/* Category Filter Bar */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {TAG_OPTIONS.map((tagName) => (
                  <button
                    key={tagName}
                    type="button"
                    onClick={() => {
                      sounds.playSelect();
                      setTag(tagName);
                      setPage(1);
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      tag === tagName
                        ? 'bg-[#1f2c47] text-white border border-[#3a5588]'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-[#192033] border border-transparent'
                    }`}
                  >
                    {tagName}
                  </button>
                ))}
              </div>
            </div>

            {/* Results List */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {isSearching ? (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-4 p-3.5 rounded-xl bg-[#151b2a] border border-[#222a3e] animate-pulse"
                    >
                      <div className="w-20 h-20 rounded-lg bg-[#1d2539] shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-[#1d2539] rounded w-1/3" />
                        <div className="h-3 bg-[#1d2539] rounded w-1/4" />
                        <div className="h-3 bg-[#1d2539] rounded w-3/4" />
                      </div>
                      <div className="w-24 h-9 rounded-lg bg-[#1d2539] shrink-0" />
                    </div>
                  ))}
                </div>
              ) : searchError ? (
                <div className="py-16 text-center max-w-md mx-auto">
                  <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
                  <h3 className="text-sm font-bold text-white mb-1">Workshop Search Unavailable</h3>
                  <p className="text-xs text-slate-400 mb-4 leading-relaxed">{searchError}</p>
                  <button
                    type="button"
                    onClick={() => searchWorkshop(submittedQuery, sort, tag, page)}
                    className="px-4 py-2 bg-[#1f283e] hover:bg-[#2a3654] text-white text-xs font-semibold rounded-lg border border-[#324063] cursor-pointer"
                  >
                    Try Again
                  </button>
                </div>
              ) : results.length === 0 ? (
                <div className="py-16 text-center max-w-md mx-auto">
                  <Package className="w-8 h-8 text-slate-500 mx-auto mb-3" />
                  <h3 className="text-sm font-bold text-white mb-1">No Isaac Mods Found</h3>
                  <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                    No Binding of Isaac Workshop mods matched your query. Note that non-Isaac Steam items are automatically filtered out.
                  </p>
                  {submittedQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchInput('');
                        setSubmittedQuery('');
                        setTag('All');
                        setPage(1);
                      }}
                      className="px-4 py-2 bg-[#1f283e] hover:bg-[#2a3654] text-white text-xs font-semibold rounded-lg border border-[#324063] cursor-pointer"
                    >
                      Clear Search
                    </button>
                  )}
                </div>
              ) : (
                results.map((mod) => {
                  const isAdded = mod.added || addedIdSet.has(mod.id);
                  const isBusy = addingId === mod.id;
                  const imgFailed = brokenImages[mod.id] || !mod.previewUrl;

                  return (
                    <div
                      key={mod.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3.5 rounded-xl bg-[#151b2a] hover:bg-[#192033] border border-[#232c42] transition-colors"
                    >
                      <div className="flex items-start gap-3.5 min-w-0 flex-1">
                        {imgFailed ? (
                          <div className="w-20 h-20 rounded-lg bg-[#1d2538] border border-[#2b3652] flex items-center justify-center shrink-0 text-slate-500">
                            <Package className="w-6 h-6" />
                          </div>
                        ) : (
                          <img
                            src={mod.previewUrl}
                            alt={mod.title}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setBrokenImages((prev) => ({ ...prev, [mod.id]: true }))
                            }
                            className="w-20 h-20 rounded-lg object-cover bg-[#0e131e] border border-[#263048] shrink-0"
                          />
                        )}

                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-bold text-white truncate">{mod.title}</h3>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400 mt-1 tabular-nums">
                            <span>{formatBytes(mod.cachedZipBytes || mod.fileSize)}</span>
                            <span aria-hidden="true">·</span>
                            <span>{formatCount(mod.subscriptions)} subscribers</span>
                            {mod.tags.length > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="truncate max-w-[220px]">
                                  {mod.tags.slice(0, 3).join(', ')}
                                </span>
                              </>
                            )}
                          </div>
                          <p className="text-xs text-slate-400/90 mt-1.5 line-clamp-2 leading-relaxed">
                            {mod.description || 'Steam Workshop mod for The Binding of Isaac.'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        {!mod.withinBudget ? (
                          <span className="text-xs text-amber-400 font-medium whitespace-nowrap">
                            Exceeds 96 MB limit
                          </span>
                        ) : isAdded ? (
                          <>
                            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1 whitespace-nowrap px-2">
                              <Check className="w-3.5 h-3.5" />
                              Added
                            </span>
                            <a
                              href={`/api/isaac/workshop/zip/${mod.id}`}
                              className="px-3 py-2 bg-[#1c2438] hover:bg-[#25304a] text-slate-200 text-xs font-semibold rounded-lg border border-[#2e3a58] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                              title="Download .zip to drag and drop onto Isaac's IMPORT MOD screen"
                            >
                              <Download className="w-3.5 h-3.5 text-cyan-400" />
                              <span>Download .zip</span>
                            </a>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleAddMod(mod)}
                            className="px-4 py-2 bg-[#00B06F] hover:bg-[#00c87e] disabled:opacity-60 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            {isBusy ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Fetching...</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3.5 h-3.5" />
                                <span>Add Mod</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Pagination Footer */}
            <div className="px-5 py-3 bg-[#131826] border-t border-[#222a3d] flex items-center justify-between gap-4 shrink-0">
              <div className="text-xs text-slate-400 tabular-nums">
                Page {page} · Showing Binding of Isaac items only
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || isSearching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 bg-[#1b2234] hover:bg-[#242e47] disabled:opacity-40 text-slate-200 text-xs font-semibold rounded-lg border border-[#2c3754] flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>
                <button
                  type="button"
                  disabled={!hasMore || isSearching}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 bg-[#1b2234] hover:bg-[#242e47] disabled:opacity-40 text-slate-200 text-xs font-semibold rounded-lg border border-[#2c3754] flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ADDED MODS TAB */}
        {activeTab === 'added' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Budget & Install Guide */}
            <div className="px-5 py-4 bg-[#131826] border-b border-[#222a3d] space-y-3 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wide">
                    Browser Mod Memory Budget
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Added mods automatically appear inside Isaac&apos;s <strong className="text-slate-200">MODS</strong> menu on launch or reload. You can also select <strong className="text-slate-200">IMPORT MOD → MOD BROWSER</strong> inside Isaac&apos;s MODS screen.
                  </p>
                </div>
                <div className="text-xs font-mono tabular-nums text-slate-300 shrink-0">
                  {formatBytes(totalAddedBytes)} / 96.0 MB ({budgetPct}%)
                </div>
              </div>

              <div className="w-full h-2 bg-[#0b0f18] rounded-full overflow-hidden border border-[#232c42]">
                <div
                  className={`h-full transition-all ${
                    totalAddedBytes > BUDGET_BYTES ? 'bg-red-500' : 'bg-[#00A2FF]'
                  }`}
                  style={{ width: `${budgetPct}%` }}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {addedMods.length === 0 ? (
                <div className="py-16 text-center max-w-md mx-auto">
                  <Package className="w-8 h-8 text-slate-500 mx-auto mb-3" />
                  <h3 className="text-sm font-bold text-white mb-1">No Mods Added Yet</h3>
                  <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                    Browse the Binding of Isaac Steam Workshop and click Add Mod to load mods into your catalogue.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('browse')}
                    className="px-4 py-2 bg-[#00A2FF] hover:bg-[#19adff] text-white text-xs font-bold rounded-lg cursor-pointer"
                  >
                    Browse Isaac Workshop
                  </button>
                </div>
              ) : (
                addedMods.map((mod) => {
                  const imgFailed = brokenImages[mod.id] || !mod.previewUrl;
                  return (
                    <div
                      key={mod.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3.5 rounded-xl bg-[#151b2a] border border-[#232c42]"
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        {imgFailed ? (
                          <div className="w-16 h-16 rounded-lg bg-[#1d2538] border border-[#2b3652] flex items-center justify-center shrink-0 text-slate-500">
                            <Package className="w-5 h-5" />
                          </div>
                        ) : (
                          <img
                            src={mod.previewUrl}
                            alt={mod.name}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setBrokenImages((prev) => ({ ...prev, [mod.id]: true }))
                            }
                            className="w-16 h-16 rounded-lg object-cover bg-[#0e131e] border border-[#263048] shrink-0"
                          />
                        )}
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-white truncate">{mod.name}</h4>
                          <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 tabular-nums">
                            <span>{formatBytes(mod.bytes)}</span>
                            <span aria-hidden="true">·</span>
                            <span>Workshop ID {mod.id}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <a
                          href={`/api/isaac/workshop/zip/${mod.id}`}
                          className="px-3 py-2 bg-[#1c2438] hover:bg-[#25304a] text-slate-200 text-xs font-semibold rounded-lg border border-[#2e3a58] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                        >
                          <Download className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Download .zip</span>
                        </a>
                        <button
                          type="button"
                          disabled={removingId === mod.id}
                          onClick={() => handleRemoveMod(mod.id, mod.name)}
                          className="px-3 py-2 bg-red-950/40 hover:bg-red-900/60 text-red-300 text-xs font-semibold rounded-lg border border-red-800/50 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Launch / Reload Bar */}
            <div className="px-5 py-3.5 bg-[#161c2c] border-t border-[#262f45] flex items-center justify-between gap-4 shrink-0">
              <div className="text-xs text-slate-400">
                {needsReload && isGameRunning
                  ? 'Reload Isaac so its in-game MOD BROWSER refreshes with your updated list.'
                  : 'Queued mods sync automatically to Isaac’s in-game MOD BROWSER.'}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isGameRunning && onReloadIsaac ? (
                  <button
                    type="button"
                    onClick={() => {
                      sounds.playLaunch();
                      onReloadIsaac();
                      onClose();
                    }}
                    className="px-4 py-2 bg-[#00B06F] hover:bg-[#00c87e] text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Reload Isaac</span>
                  </button>
                ) : onLaunchIsaac ? (
                  <button
                    type="button"
                    onClick={() => {
                      sounds.playLaunch();
                      onClose();
                      onLaunchIsaac();
                    }}
                    className="px-4 py-2 bg-[#00B06F] hover:bg-[#00c87e] text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>Launch Isaac</span>
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
