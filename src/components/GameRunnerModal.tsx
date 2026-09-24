import React, { useState } from 'react';
import { CustomGame } from '../types';
import { Maximize2, Minimize2, ArrowLeft, RefreshCw, ExternalLink, EyeOff, ShieldCheck, Zap, AlertCircle } from 'lucide-react';
import { sounds } from '../services/soundEffects';

interface GameRunnerModalProps {
  game: CustomGame;
  onClose: () => void;
  onTriggerStealth: () => void;
}

export const GameRunnerModal: React.FC<GameRunnerModalProps> = ({
  game,
  onClose,
  onTriggerStealth,
}) => {
  const [key, setKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [useProxy, setUseProxy] = useState<boolean>(() => {
    // If explicitly specified, respect it. Otherwise, default to proxy to bypass refused connections!
    return game.launchMode !== 'direct';
  });
  const [showTroubleshooter, setShowTroubleshooter] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Cloaked Tab launcher (creates an about:blank stealth window with the game)
  const openCloakedWindow = () => {
    sounds.playLaunch();
    try {
      const win = window.open('about:blank', '_blank');
      if (!win) {
        window.open(game.url, '_blank');
        return;
      }
      win.document.title = game.title || 'Google Classroom';
      const iframe = win.document.createElement('iframe');
      iframe.style.width = '100vw';
      iframe.style.height = '100vh';
      iframe.style.border = 'none';
      iframe.style.position = 'fixed';
      iframe.style.top = '0';
      iframe.style.left = '0';
      iframe.src = game.url;
      win.document.body.style.margin = '0';
      win.document.body.appendChild(iframe);
    } catch {
      window.open(game.url, '_blank');
    }
  };

  const currentIframeSrc = useProxy
    ? `/api/proxy?url=${encodeURIComponent(game.url)}`
    : game.url;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#070a10] select-none">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-2.5 bg-[#121622] border-b border-[#242b3c] shadow-md z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              sounds.playBack();
              onClose();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e2538] hover:bg-[#28324a] text-slate-200 text-xs font-bold rounded-lg border border-[#2d3750] transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </button>

          <div className="h-4 w-[1px] bg-slate-700 mx-1 hidden sm:block" />

          <h2 className="text-sm font-black text-white tracking-wide uppercase truncate max-w-[150px] sm:max-w-xs md:max-w-md">
            {game.title}
          </h2>
          <span className="text-[11px] font-semibold text-cyan-400 bg-cyan-950/60 border border-cyan-800/40 px-2 py-0.5 rounded uppercase hidden md:inline">
            {game.genre}
          </span>
        </div>

        {/* Center / Mode Toggle */}
        <div className="flex items-center gap-1.5 bg-[#171d2b] p-1 rounded-xl border border-slate-700/80">
          <button
            onClick={() => {
              sounds.playSelect();
              setUseProxy(true);
              setKey((k) => k + 1);
            }}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
              useProxy
                ? 'bg-[#00A2FF] text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Atlas Reverse Proxy strips X-Frame-Options to bypass connection refusal"
          >
            <Zap className="w-3 h-3 text-amber-300" />
            <span className="hidden sm:inline">Unblocker</span> Proxy
          </button>

          <button
            onClick={() => {
              sounds.playSelect();
              setUseProxy(false);
              setKey((k) => k + 1);
            }}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              !useProxy
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Direct site iframe embed"
          >
            Direct
          </button>
        </div>

        {/* Actions Cluster */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Reload Frame */}
          <button
            onClick={() => {
              sounds.playMove();
              setKey((k) => k + 1);
            }}
            className="p-1.5 bg-[#1e2538] hover:bg-[#28324a] text-slate-300 rounded-lg border border-[#2d3750] transition-colors cursor-pointer"
            title="Reload Game"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* Cloaked Tab (about:blank) */}
          <button
            onClick={openCloakedWindow}
            className="px-2.5 py-1.5 bg-[#1e2538] hover:bg-emerald-950 hover:text-emerald-400 text-slate-300 text-xs font-bold rounded-lg border border-[#2d3750] transition-colors cursor-pointer hidden sm:flex items-center gap-1.5"
            title="Launch in stealth about:blank window"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Cloaked Tab</span>
          </button>

          {/* Panic / Stealth Key */}
          <button
            onClick={onTriggerStealth}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-950/50 hover:bg-red-900 border border-red-700/50 text-red-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            title="Panic Disguise (P or ~)"
          >
            <EyeOff className="w-3.5 h-3.5 text-red-400" />
            <span className="hidden md:inline">Panic</span>
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 bg-[#1e2538] hover:bg-[#28324a] text-slate-300 rounded-lg border border-[#2d3750] transition-colors cursor-pointer"
            title="Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Troubleshooter Banner (if needed) */}
      {showTroubleshooter && (
        <div className="bg-amber-950/70 border-b border-amber-600/50 px-6 py-2 flex items-center justify-between text-xs text-amber-200 z-10">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              If this site refuses to connect, switch to <strong>Unblocker Proxy</strong> mode or click <strong>Launch Cloaked Tab</strong>.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setUseProxy(true);
                setKey((k) => k + 1);
                setShowTroubleshooter(false);
              }}
              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded cursor-pointer"
            >
              Use Proxy
            </button>
            <button
              onClick={openCloakedWindow}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded cursor-pointer"
            >
              Cloaked Tab
            </button>
          </div>
        </div>
      )}

      {/* Sandboxed Game Container */}
      <div className="relative flex-1 w-full h-full bg-black overflow-hidden flex flex-col">
        <iframe
          key={`${key}-${useProxy ? 'proxy' : 'direct'}`}
          src={currentIframeSrc}
          title={game.title}
          className="w-full h-full border-0 flex-1"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
        />

        {/* Bottom indicator with quick troubleshoot button */}
        <div className="absolute bottom-2 right-3 flex items-center gap-2 z-10">
          <button
            onClick={() => setShowTroubleshooter(!showTroubleshooter)}
            className="flex items-center gap-1.5 bg-black/85 hover:bg-slate-900 px-2.5 py-1 rounded text-[11px] text-slate-300 border border-slate-700 shadow-md cursor-pointer transition-colors"
          >
            <AlertCircle className="w-3 h-3 text-cyan-400" />
            <span>Refused to connect?</span>
          </button>

          <div className="flex items-center gap-1.5 bg-black/80 px-2.5 py-1 rounded text-[11px] text-slate-400 border border-slate-800 pointer-events-none">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            <span>{useProxy ? 'Atlas Proxy Active' : 'Direct Embed'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
