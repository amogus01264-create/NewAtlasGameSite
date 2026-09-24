import React, { useState } from 'react';
import { CustomGame } from '../types';
import { Plus, Play, Trash2, Search, ExternalLink, ShieldCheck, AlertTriangle, X } from 'lucide-react';
import { sounds } from '../services/soundEffects';

interface GamesScreenProps {
  games: CustomGame[];
  onPlayGame: (game: CustomGame) => void;
  onOpenAddGame: () => void;
  onDeleteGame: (id: string) => void;
  onClearCustomGames?: () => void;
}

export const GamesScreen: React.FC<GamesScreenProps> = ({
  games,
  onPlayGame,
  onOpenAddGame,
  onDeleteGame,
  onClearCustomGames,
}) => {
  const [search, setSearch] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const customGamesCount = games.filter((g) => !g.isPreset).length;

  const genres = ['All', 'Arcade', 'Action', 'Adventure', 'Puzzle', 'Sports', 'Strategy', 'Retro'];

  const filtered = games.filter((g) => {
    const matchesSearch =
      g.title.toLowerCase().includes(search.toLowerCase()) ||
      g.genre.toLowerCase().includes(search.toLowerCase());
    const matchesGenre = selectedGenre === 'All' || g.genre === selectedGenre;
    return matchesSearch && matchesGenre;
  });

  return (
    <div className="relative z-10 w-full px-6 sm:px-8 py-4 select-none max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-wider">
            Game Library
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            {games.length} total {games.length === 1 ? 'game' : 'games'} ({customGamesCount} custom added).
          </p>
        </div>

        <div className="flex items-center gap-2">
          {customGamesCount > 0 && onClearCustomGames && (
            <button
              onClick={() => {
                sounds.playSelect();
                setShowClearConfirm(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-700/50 text-amber-300 text-xs font-black uppercase tracking-wider rounded-xl shadow-lg transition-all active:scale-95 cursor-pointer"
              title="Clear all user-added custom games while keeping preset games"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Custom ({customGamesCount})</span>
            </button>
          )}

          <button
            onClick={() => {
              sounds.playSelect();
              onOpenAddGame();
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#00B06F] hover:bg-[#00c87e] text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-lg transition-all active:scale-95 w-fit cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Custom Game</span>
          </button>
        </div>
      </div>

      {/* Search & Genre Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between mb-6">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search custom games..."
            className="w-full bg-[#151c28] text-white text-xs pl-9 pr-3 py-2.5 rounded-xl border border-slate-700/70 focus:outline-none focus:border-[#00A2FF]"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full sm:w-auto">
          {genres.map((genre) => (
            <button
              key={genre}
              onClick={() => {
                sounds.playSelect();
                setSelectedGenre(genre);
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors shrink-0 ${
                selectedGenre === genre
                  ? 'bg-[#00A2FF] text-white'
                  : 'bg-[#151c28] text-slate-400 hover:text-white hover:bg-[#1f283a]'
              }`}
            >
              {genre}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Games */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-[#131924]/60 rounded-2xl border border-slate-800">
          <p className="text-slate-400 text-sm mb-3">
            {games.length === 0
              ? 'No games in your library yet! Add your first custom unblocked game above.'
              : 'No games match your search.'}
          </p>
          <button
            onClick={() => {
              sounds.playSelect();
              onOpenAddGame();
            }}
            className="px-5 py-2 bg-[#00A2FF] hover:bg-blue-600 text-white text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Custom Game
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filtered.map((game) => (
            <div
              key={game.id}
              onClick={() => {
                sounds.playLaunch();
                onPlayGame(game);
              }}
              className="atlas-tile group relative flex flex-col aspect-[4/5] rounded-xl overflow-hidden bg-[#151c28] border border-slate-700/60 cursor-pointer shadow-lg"
            >
              {/* Cover Image */}
              <div className="relative w-full aspect-square bg-[#0b0e14] overflow-hidden">
                <img
                  src={game.thumbnail}
                  alt={game.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />

                {/* Overlay actions */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity">
                  <div className="w-9 h-9 rounded-full bg-[#00B06F] flex items-center justify-center shadow-lg">
                    <Play className="w-4 h-4 fill-white text-white ml-0.5" />
                  </div>
                </div>

                {/* Preset Badge or Delete button */}
                {game.isPreset ? (
                  <span
                    className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-[#00A2FF]/20 border border-[#00A2FF]/60 text-[#00A2FF] text-[10px] font-black uppercase tracking-wider backdrop-blur-sm shadow flex items-center gap-1"
                    title="Preset Game (Protected)"
                  >
                    <ShieldCheck className="w-3 h-3" />
                    <span>Preset</span>
                  </span>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      sounds.playExplosion();
                      onDeleteGame(game.id);
                    }}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 hover:bg-red-600 text-slate-300 hover:text-white transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                    title="Delete Custom Game"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Title & Genre */}
              <div className="p-2.5 flex flex-col justify-between flex-1">
                <div>
                  <h3 className="text-xs font-bold text-white group-hover:text-[#00A2FF] transition-colors truncate">
                    {game.title}
                  </h3>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                    {game.genre}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                  <span>Played {game.playedCount || 0}x</span>
                  <ExternalLink className="w-3 h-3 text-slate-500" />
                </div>
              </div>
            </div>
          ))}

          {/* Add Game Tile */}
          <div
            onClick={() => {
              sounds.playSelect();
              onOpenAddGame();
            }}
            className="atlas-tile flex flex-col items-center justify-center aspect-[4/5] rounded-xl bg-[#141a26]/40 border-2 border-dashed border-slate-700/80 hover:border-[#00A2FF] cursor-pointer text-slate-400 hover:text-white transition-colors p-4 text-center"
          >
            <Plus className="w-8 h-8 text-[#00A2FF] mb-2" />
            <span className="text-xs font-bold uppercase">Add New Game</span>
          </div>
        </div>
      )}

      {/* Clear Custom Games Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
          <div className="w-full max-w-sm bg-[#161c28] border border-amber-600/60 rounded-2xl shadow-2xl overflow-hidden p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-amber-400 font-black text-sm uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Clear Custom Games</span>
              </div>
              <button
                onClick={() => {
                  sounds.playBack();
                  setShowClearConfirm(false);
                }}
                className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-5">
              Are you sure you want to remove all <strong className="text-white font-bold">{customGamesCount} custom added</strong> {customGamesCount === 1 ? 'game' : 'games'}?
              <br /><br />
              <span className="text-emerald-400 font-semibold">
                Preset games (such as Geometry Dash WASM) will NOT be cleared or affected.
              </span>
            </p>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  sounds.playBack();
                  setShowClearConfirm(false);
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                onClick={() => {
                  sounds.playExplosion();
                  if (onClearCustomGames) onClearCustomGames();
                  setShowClearConfirm(false);
                }}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-black font-black text-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Yes, Clear Custom</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
