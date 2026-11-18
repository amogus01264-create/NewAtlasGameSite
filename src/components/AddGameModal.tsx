import React, { useState, useRef } from 'react';
import { CustomGame } from '../types';
import { X, Plus, Sparkles, Globe, Image as ImageIcon, ShieldCheck, CheckCircle2, AlertTriangle, ExternalLink, Upload, Code, FileText, Check } from 'lucide-react';
import { sounds } from '../services/soundEffects';

interface AddGameModalProps {
  onAddGame: (game: Omit<CustomGame, 'id' | 'addedAt' | 'playedCount' | 'favorite'>) => void;
  onClose: () => void;
}

export const AddGameModal: React.FC<AddGameModalProps> = ({ onAddGame, onClose }) => {
  const [sourceType, setSourceType] = useState<'upload' | 'paste' | 'url'>('upload');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [thumbnail, setThumbnail] = useState('');
  const [genre, setGenre] = useState('Action');
  const [description, setDescription] = useState('');
  const [launchMode, setLaunchMode] = useState<'proxy' | 'direct' | 'popout'>('direct');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    tested: boolean;
    isFrameable?: boolean;
    message?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (file: File) => {
    if (!file) return;
    setUploadedFileName(file.name);
    
    // Automatically derive title from filename if empty
    const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    if (!title.trim()) {
      setTitle(cleanTitle);
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        setHtmlContent(content);
        // Try extracting HTML <title> tag
        const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1] && titleMatch[1].trim()) {
          setTitle(titleMatch[1].trim());
        }
        setUrl(`local://${file.name}`);
        setLaunchMode('direct');
      }
    };
    reader.readAsText(file);
  };

  const thumbnailPresets = [
    {
      name: 'Isaac / Roguelike',
      url: 'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?w=600&auto=format&fit=crop&q=80',
    },
    {
      name: 'Retro Arcade',
      url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80',
    },
    {
      name: 'Dark Dungeon',
      url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80',
    },
    {
      name: 'Cyber Neon',
      url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&auto=format&fit=crop&q=80',
    },
    {
      name: 'Puzzle Master',
      url: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600&auto=format&fit=crop&q=80',
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
    if (!title.trim()) return;

    let finalUrl = url.trim();
    let finalHtmlContent = htmlContent.trim();

    if (sourceType === 'upload' || sourceType === 'paste') {
      if (!finalHtmlContent) return;
      if (!finalUrl) finalUrl = `local://${title.toLowerCase().replace(/\s+/g, '-')}.html`;
    } else {
      if (!finalUrl) return;
      if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
        finalUrl = `https://${finalUrl}`;
      }
    }

    const finalThumbnail =
      thumbnail.trim() ||
      thumbnailPresets[Math.floor(Math.random() * thumbnailPresets.length)].url;

    onAddGame({
      title: title.trim(),
      url: finalUrl,
      htmlContent: finalHtmlContent || undefined,
      thumbnail: finalThumbnail,
      genre: genre.trim() || 'General',
      description: description.trim() || 'Original unblocked game in library.',
      launchMode: finalHtmlContent ? 'direct' : launchMode,
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
              Add Game to Library
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

        {/* Source Type Selector Tabs */}
        <div className="flex items-center bg-[#10141f] p-1.5 border-b border-[#242c3e] gap-1.5 px-6">
          <button
            type="button"
            onClick={() => {
              sounds.playSelect();
              setSourceType('upload');
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              sourceType === 'upload'
                ? 'bg-[#00A2FF] text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-[#1a2133]'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload HTML</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sounds.playSelect();
              setSourceType('paste');
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              sourceType === 'paste'
                ? 'bg-[#00A2FF] text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-[#1a2133]'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Paste Code</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sounds.playSelect();
              setSourceType('url');
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              sourceType === 'url'
                ? 'bg-[#00A2FF] text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-[#1a2133]'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Web URL</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {/* UPLOAD MODE */}
          {sourceType === 'upload' && (
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                Upload Original HTML Game File <span className="text-[#00A2FF]">*</span>
              </label>

              <input
                ref={fileInputRef}
                type="file"
                accept=".html,.htm"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFileUpload(file);
                }}
                className={`p-6 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                  uploadedFileName
                    ? 'bg-emerald-950/20 border-emerald-500/60 text-emerald-300'
                    : 'bg-[#182030]/60 border-slate-700/80 hover:border-[#00A2FF] text-slate-300'
                }`}
              >
                {uploadedFileName ? (
                  <>
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mb-2 text-emerald-400">
                      <Check className="w-6 h-6" />
                    </div>
                    <span className="text-sm font-bold text-white mb-0.5">{uploadedFileName}</span>
                    <span className="text-xs text-emerald-400 font-semibold">
                      HTML game loaded into memory (0ms local launch)
                    </span>
                    <span className="text-[11px] text-slate-400 mt-2 underline">
                      Click to choose another file
                    </span>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-xl bg-[#00A2FF]/10 border border-[#00A2FF]/30 flex items-center justify-center mb-2 text-[#00A2FF]">
                      <Upload className="w-6 h-6" />
                    </div>
                    <span className="text-sm font-bold text-white mb-1">
                      Drag & Drop .html file here
                    </span>
                    <span className="text-xs text-slate-400">
                      Supports Isaac Repentance+, custom offline games, canvas builds
                    </span>
                    <button
                      type="button"
                      className="mt-3 px-3.5 py-1.5 bg-[#20293d] hover:bg-[#2c3854] text-xs font-bold text-cyan-300 rounded-lg border border-slate-700 transition-colors pointer-events-none"
                    >
                      Browse Computer
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* PASTE CODE MODE */}
          {sourceType === 'paste' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                  Paste Raw Game HTML Code <span className="text-[#00A2FF]">*</span>
                </label>
                <span className="text-[10px] text-slate-400">
                  {htmlContent.length.toLocaleString()} characters
                </span>
              </div>
              <textarea
                value={htmlContent}
                onChange={(e) => {
                  const val = e.target.value;
                  setHtmlContent(val);
                  const titleMatch = val.match(/<title[^>]*>([^<]+)<\/title>/i);
                  if (titleMatch && titleMatch[1] && !title.trim()) {
                    setTitle(titleMatch[1].trim());
                  }
                }}
                rows={5}
                placeholder="Paste <!DOCTYPE html> ... or <iframe> code here..."
                className="w-full bg-[#1b2234] text-white text-xs font-mono p-3 rounded-xl border border-slate-700 focus:outline-none focus:border-[#00A2FF] resize-none"
              />
              <p className="text-[11px] text-cyan-400">
                ⚡ Raw HTML executes directly in sandboxed memory for instant 0ms latency.
              </p>
            </div>
          )}

          {/* WEB URL MODE */}
          {sourceType === 'url' && (
            <div className="space-y-3">
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
                    value={url}
                    onChange={(e) => {
                      setUrl(e.target.value);
                      setTestResult(null);
                    }}
                    placeholder="https://example.com/game or any game link"
                    className="w-full bg-[#1b2234] text-white text-sm pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-[#00A2FF]"
                  />
                </div>

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
              <div className="p-3 bg-[#171e2c] rounded-xl border border-slate-700/80">
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
                      Bypasses connection refusal
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
                      Fastest for frameable sites
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
                    <div className="text-xs font-black text-emerald-400">Cloaked Tab</div>
                    <div className="text-[10px] text-slate-400 leading-tight mt-0.5">
                      Clean about:blank tab
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

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
              placeholder="e.g. The Binding of Isaac: Repentance+, 1v1.LOL, Slope"
              className="w-full bg-[#1b2234] text-white text-sm px-3.5 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-[#00A2FF]"
            />
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
              disabled={
                !title.trim() ||
                (sourceType === 'upload' && !htmlContent.trim()) ||
                (sourceType === 'paste' && !htmlContent.trim()) ||
                (sourceType === 'url' && !url.trim())
              }
              className="w-full flex items-center justify-center gap-2 py-3 bg-[#00B06F] hover:bg-[#00c87e] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-black uppercase tracking-wider rounded-xl shadow-lg transition-all active:scale-98 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {sourceType === 'upload' && !htmlContent.trim()
                  ? 'Select .html File to Continue'
                  : sourceType === 'paste' && !htmlContent.trim()
                    ? 'Paste HTML Code to Continue'
                    : 'Save & Add to Atlas Library'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
