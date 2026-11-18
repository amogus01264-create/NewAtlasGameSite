import React, { useState, useEffect, useMemo } from 'react';
import { CustomGame } from '../types';
import { Maximize2, Minimize2, ArrowLeft, RefreshCw, ExternalLink, EyeOff, ShieldCheck, Zap, AlertCircle, Radio, Loader2 } from 'lucide-react';
import { sounds } from '../services/soundEffects';
import { closeCurrentTab } from '../services/tabCloak';

interface GameRunnerModalProps {
  game: CustomGame;
  onClose: () => void;
  onTriggerStealth: () => void;
  onStartStream?: (game: CustomGame) => void;
}

export const GameRunnerModal: React.FC<GameRunnerModalProps> = ({
  game,
  onClose,
  onTriggerStealth,
  onStartStream,
}) => {
  const [key, setKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const hasRawHtml = Boolean(game.htmlContent && game.htmlContent.trim().length > 0);
  const isLocal = hasRawHtml || game.url.startsWith('/') || game.url.startsWith('./');
  
  const [useProxy, setUseProxy] = useState<boolean>(() => {
    if (isLocal) return false;
    return game.launchMode === 'proxy';
  });
  const [showTroubleshooter, setShowTroubleshooter] = useState(false);

  // Generate instant local blob URL for raw HTML games (e.g. Isaac Repentance+ or uploaded OG HTMLs)
  const localBlobUrl = useMemo(() => {
    if (!game.htmlContent) return null;
    try {
      const blob = new Blob([game.htmlContent], { type: 'text/html;charset=utf-8' });
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }, [game.htmlContent]);

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      if (localBlobUrl) {
        URL.revokeObjectURL(localBlobUrl);
      }
    };
  }, [localBlobUrl]);

  // DNS preconnect for target URL to drastically speed up SSL handshake and TTFB
  useEffect(() => {
    if (!game.url || game.url.startsWith('/') || game.url.startsWith('blob:')) return;
    try {
      const parsed = new URL(game.url);
      const preconnectLink = document.createElement('link');
      preconnectLink.rel = 'preconnect';
      preconnectLink.href = parsed.origin;
      preconnectLink.crossOrigin = 'anonymous';

      const dnsLink = document.createElement('link');
      dnsLink.rel = 'dns-prefetch';
      dnsLink.href = parsed.origin;

      document.head.appendChild(preconnectLink);
      document.head.appendChild(dnsLink);

      return () => {
        try {
          document.head.removeChild(preconnectLink);
          document.head.removeChild(dnsLink);
        } catch {}
      };
    } catch {}
  }, [game.url]);

  // Reset loading state on reload
  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => setIsLoading(false), 5000); // safety fallback
    return () => clearTimeout(timer);
  }, [key, useProxy]);

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
    const resolvedUrl = localBlobUrl || (isLocal ? (window.location.origin + game.url) : (useProxy ? `/api/proxy?url=${encodeURIComponent(game.url)}` : game.url));
    try {
      const win = window.open('about:blank', '_blank');
      if (!win) {
        window.open(resolvedUrl, '_blank');
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
      if (game.htmlContent) {
        iframe.srcdoc = game.htmlContent;
      } else {
        iframe.src = resolvedUrl;
      }
      win.document.body.style.margin = '0';
      win.document.body.appendChild(iframe);

      // Close the original tab right after clicking launch in about:blank
      closeCurrentTab(true);
    } catch {
      window.open(resolvedUrl, '_blank');
    }
  };

  const currentIframeSrc = localBlobUrl
    ? localBlobUrl
    : (useProxy && !isLocal)
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

        {/* Center / Mode Toggle or Built-in Badge */}
        {hasRawHtml ? (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-950/70 rounded-xl border border-emerald-500/50 text-emerald-300 text-xs font-bold shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>⚡ Instant OG HTML (0ms Latency)</span>
          </div>
        ) : isLocal ? (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-950/60 rounded-xl border border-emerald-600/50 text-emerald-300 text-xs font-bold shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Local Arcade Game</span>
          </div>
        ) : (
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
        )}

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

          {/* Go Live / Stream Game */}
          {onStartStream && (
            <button
              onClick={() => {
                sounds.playSelect();
                onStartStream(game);
              }}
              className="px-2.5 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 hover:text-red-300 text-xs font-bold rounded-lg border border-red-500/50 transition-colors cursor-pointer hidden sm:flex items-center gap-1.5"
              title="Stream this game to friends or public"
            >
              <Radio className="w-3.5 h-3.5 animate-pulse text-red-500" />
              <span>Stream Game</span>
            </button>
          )}

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
        {/* Fast Loading Splash / Progress Feedback */}
        {isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#090d16] text-white p-6 select-none transition-opacity duration-300">
            <div className="relative mb-4">
              <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center animate-pulse">
                <Loader2 className="w-7 h-7 text-cyan-400 animate-spin" />
              </div>
            </div>
            <h3 className="text-base font-black uppercase tracking-wider text-white mb-1">
              Loading {game.title}...
            </h3>
            <p className="text-xs text-slate-400 max-w-xs text-center mb-4">
              {hasRawHtml
                ? 'Mounting local HTML environment with zero latency.'
                : useProxy
                  ? 'Establishing high-speed proxy tunnel & caching static assets.'
                  : 'Establishing direct embed connection.'}
            </p>

            {useProxy && !isLocal && (
              <button
                onClick={() => {
                  sounds.playSelect();
                  setUseProxy(false);
                  setKey((k) => k + 1);
                }}
                className="text-xs px-3 py-1.5 bg-[#172033] hover:bg-[#202d48] border border-cyan-800 text-cyan-300 rounded-lg font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Switch to Direct Mode</span>
              </button>
            )}
          </div>
        )}

        <iframe
          key={`${key}-${useProxy ? 'proxy' : 'direct'}`}
          src={currentIframeSrc}
          title={game.title}
          className="w-full h-full border-0 flex-1"
          // @ts-ignore: loading attribute on iframe is supported in modern browsers
          loading="eager"
          onLoad={() => setIsLoading(false)}
          sandbox={isLocal ? undefined : "allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen; gamepad; focus-without-user-activation; cross-origin-isolated"
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
            <span>
              {hasRawHtml ? '⚡ Local OG HTML' : useProxy ? 'Atlas Proxy Active' : 'Direct Embed'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
