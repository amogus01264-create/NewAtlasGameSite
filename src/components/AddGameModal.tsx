import React, { useState } from 'react';
import { CustomGame } from '../types';
import { X, Plus, Sparkles, Globe, Image as ImageIcon, ShieldCheck, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react';
import { sounds } from '../services/soundEffects';

interface AddGameModalProps {
  onAddGame: (game: Omit<CustomGame, 'id' | 'addedAt' | 'playedCount' | 'favorite'>) => void;
  onClose: () => void;
}

export const AddGameModal: React.FC<AddGameModalProps> = ({ onAddGame, onClose }) => {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [thumbnail, setThumbnail] = useState('');
  const [genre, setGenre] = useState('Arcade');
  const [description, setDescription] = useState('');
  const [launchMode, setLaunchMode] = useState<'proxy' | 'direct' | 'popout'>('proxy');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    tested: boolean;
    isFrameable?: boolean;
    message?: string;
  } | null>(null);

  const popularGamePresets = [
    { name: 'Geometry Dash', url: 'https://truffled.lol/games/geo/index.html', genre: 'Action', thumb: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80', mode: 'direct' as const },
    { name: '2048', url: 'https://play2048.co/', genre: 'Puzzle', thumb: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80', mode: 'proxy' as const },
    { name: 'Hextris Neo', url: 'https://hextris.io/', genre: 'Arcade', thumb: 'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?w=600&auto=format&fit=crop&q=80', mode: 'proxy' as const },
    { name: 'Paper.io 2', url: 'https://paper-io.com/', genre: 'Action', thumb: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&auto=format&fit=crop&q=80', mode: 'proxy' as const },
    { name: 'Google Snake', url: 'https://www.google.com/fbx?fbx=snake_arcade', genre: 'Retro', thumb: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600&auto=format&fit=crop&q=80', mode: 'proxy' as const },
  ];

  const thumbnailPresets = [
    {
      name: 'Hide & Seek',
      url: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600&auto=format&fit=crop&q=80',
    },
    {
      name: 'Survival',
      url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&auto=format&fit=crop&q=80',
    },
    {
      name: 'Retro Arcade',
      url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80',
    },
    {
      name: 'Cyber Neon',
      url: 'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?w=600&auto=format&fit=crop&q=80',
    },
    {
      name: 'Voxel Blocks',
      url: 'https://images.unsplash.com/photo-1534423861386-85a16f5d13fd?w=600&auto=format&fit=crop&q=80',
    },
  ];

  const testConnection = async () => {
    let cleanUrl = url.trim();
    if (!cleanUrl) return;
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://${cleanUrl}`;
      setUrl(cleanUrl);
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await fetch(`/api/check-frameable?url=${encodeURIComponent(cleanUrl)}`);
      const data = await res.json();
      if (data.isFrameable) {
        setTestResult({
          tested: true,
          isFrameable: true,
          message: 'Direct iframe embedding is supported! (No X-Frame-Options restriction)',
        });
      } else {
        setTestResult({
          tested: true,
          isFrameable: false,
          message: 'Site restricts direct frames. Atlas Unblocker Proxy will automatically bypass this restriction!',
        });
        setLaunchMode('proxy');
      }
    } catch {
      setTestResult({
        tested: true,
        isFrameable: false,
        message: 'Connection checked. Atlas Unblocker Proxy is recommended for this link.',
      });
      setLaunchMode('proxy');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !url.trim()) return;

    let finalUrl = url.trim();
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = `https://${finalUrl}`;
    }

    const finalThumbnail =
      thumbnail.trim() ||
      thumbnailPresets[Math.floor(Math.random() * thumbnailPresets.length)].url;

    onAddGame({
      title: title.trim(),
      url: finalUrl,
      thumbnail: finalThumbnail,
      genre: genre.trim() || 'General',
      description: description.trim() || 'Custom unblocked game added by player.',
      launchMode,
    });

    sounds.playLaunch();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md select-none">
      <div className="relative w-full max-w-lg bg-[#141824] border border-[#2b3144] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#1a2030] border-b border-[#2b3144]">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-[#00A2FF]" />
            <h2 className="text-lg font-black text-white uppercase tracking-wider">
              Add Custom Game
            </h2>
          </div>
          <button
            onClick={() => {
              sounds.playBack();
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-[#252c40] hover:bg-[#303a54] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {/* Quick Preset Ideas */}
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
              Quick Suggestions:
            </span>
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {popularGamePresets.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
                    setTitle(preset.name);
                    setUrl(preset.url);
                    setGenre(preset.genre);
                    setThumbnail(preset.thumb);
                    setLaunchMode(preset.mode || 'proxy');
                    sounds.playSelect();
                  }}
                  className="px-2.5 py-1 bg-[#1e2638] hover:bg-[#28324a] rounded-lg border border-slate-700 text-xs text-white shrink-0 cursor-pointer"
                >
                  + {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* Game Title */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
              Game Title <span className="text-[#00A2FF]">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Slope, 1v1.LOL, 2048, Retro Bowl"
              className="w-full bg-[#1b2234] text-white text-sm px-3.5 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-[#00A2FF]"
            />
          </div>

          {/* Game URL with Test Connection */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                Game URL <span className="text-[#00A2FF]">*</span>
              </label>
              {url.trim() && (
                <button
                  type="button"
                  onClick={testConnection}
                  disabled={isTesting}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{isTesting ? 'Testing...' : 'Test Connection'}</span>
                </button>
              )}
            </div>

            <div className="relative flex items-center">
              <Globe className="w-4 h-4 text-slate-400 absolute left-3.5" />
              <input
                type="text"
                required
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setTestResult(null);
                }}
                placeholder="https://play2048.co/ or any game site"
                className="w-full bg-[#1b2234] text-white text-sm pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-[#00A2FF]"
              />
            </div>

            {/* Test result status feedback */}
            {testResult && (
              <div
                className={`mt-2 p-2.5 rounded-xl border flex items-start gap-2 text-xs ${
                  testResult.isFrameable
                    ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                    : 'bg-blue-950/40 border-blue-800/60 text-blue-200'
                }`}
              >
                {testResult.isFrameable ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>

          {/* Unblocker / Launch Mode Setting */}
          <div className="p-3.5 bg-[#171e2c] rounded-xl border border-slate-700/80">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-2">
              Launch & Unblocker Method
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setLaunchMode('proxy')}
                className={`p-2 rounded-lg text-left border transition-all cursor-pointer ${
                  launchMode === 'proxy'
                    ? 'bg-[#00A2FF]/20 border-[#00A2FF] text-white'
                    : 'bg-[#121622] border-slate-700/60 text-slate-400 hover:text-white'
                }`}
              >
                <div className="text-xs font-black text-cyan-400">Atlas Proxy</div>
                <div className="text-[10px] text-slate-400 leading-tight mt-0.5">
                  Bypasses "Refused to connect"
                </div>
              </button>

              <button
                type="button"
                onClick={() => setLaunchMode('direct')}
                className={`p-2 rounded-lg text-left border transition-all cursor-pointer ${
                  launchMode === 'direct'
                    ? 'bg-[#00A2FF]/20 border-[#00A2FF] text-white'
                    : 'bg-[#121622] border-slate-700/60 text-slate-400 hover:text-white'
                }`}
              >
                <div className="text-xs font-black text-white">Direct Embed</div>
                <div className="text-[10px] text-slate-400 leading-tight mt-0.5">
                  Standard web iframe
                </div>
              </button>

              <button
                type="button"
                onClick={() => setLaunchMode('popout')}
                className={`p-2 rounded-lg text-left border transition-all cursor-pointer ${
                  launchMode === 'popout'
                    ? 'bg-[#00A2FF]/20 border-[#00A2FF] text-white'
                    : 'bg-[#121622] border-slate-700/60 text-slate-400 hover:text-white'
                }`}
              >
                <div className="text-xs font-black text-emerald-400">Cloaked Window</div>
                <div className="text-[10px] text-slate-400 leading-tight mt-0.5">
                  Clean about:blank tab
                </div>
              </button>
            </div>
          </div>

          {/* Genre */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
              Genre / Category
            </label>
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="w-full bg-[#1b2234] text-white text-sm px-3.5 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-[#00A2FF]"
            >
              <option value="Arcade">Arcade</option>
              <option value="Action">Action</option>
              <option value="Adventure">Adventure</option>
              <option value="Puzzle">Puzzle</option>
              <option value="Sports">Sports</option>
              <option value="Strategy">Strategy</option>
              <option value="Retro">Retro</option>
            </select>
          </div>

          {/* Thumbnail Image URL */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
              Thumbnail Cover Image (Optional)
            </label>
            <div className="relative flex items-center mb-2">
              <ImageIcon className="w-4 h-4 text-slate-400 absolute left-3.5" />
              <input
                type="url"
                value={thumbnail}
                onChange={(e) => setThumbnail(e.target.value)}
                placeholder="https://... cover image URL"
                className="w-full bg-[#1b2234] text-white text-sm pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-[#00A2FF]"
              />
            </div>

            {/* Quick preset thumbnail selector */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-slate-400 mr-1">Presets:</span>
              {thumbnailPresets.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => setThumbnail(p.url)}
                  className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors cursor-pointer ${
                    thumbnail === p.url
                      ? 'bg-[#00A2FF] text-white border-[#00A2FF]'
                      : 'bg-[#1e2638] text-slate-300 border-slate-700 hover:text-white'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
              Description / Notes (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Short description of this game..."
              className="w-full bg-[#1b2234] text-white text-sm px-3.5 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-[#00A2FF] resize-none"
            />
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3 bg-[#00B06F] hover:bg-[#00c87e] text-white text-sm font-black uppercase tracking-wider rounded-xl shadow-lg transition-all active:scale-98 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Save & Add to Atlas Library</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
