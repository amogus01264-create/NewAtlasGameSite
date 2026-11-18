import React, { useEffect, useRef, useState } from 'react';
import { MusicTrack } from '../types';
import { resolveFullStream } from '../services/musicService';

interface MusicPlaybackHostProps {
  track: MusicTrack | null;
  playNonce: number;
  isPlaying: boolean;
  volume: number; // 0..100
  isMuted: boolean;
  seekSignal: { seq: number; timeSec: number } | null;
  onProgress: (currentSec: number, durationSec: number) => void;
  onPlayStateChange: (playing: boolean) => void;
  onBufferingChange: (buffering: boolean) => void;
  onTrackEnded: () => void;
  onError: (message: string | null) => void;
}

type ActiveBackend =
  | { mode: 'none' }
  | { mode: 'audio'; url: string }
  | { mode: 'youtube'; videoId: string }
  | { mode: 'soundcloud'; trackUrl: string };

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
    SC?: any;
  }
}

let ytApiPromise: Promise<any> | null = null;
function loadYouTubeIframeApi(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve, reject) => {
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prevReady) prevReady();
      resolve(window.YT);
    };
    const existing = document.querySelector('script[src*="youtube.com/iframe_api"]');
    if (!existing) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.onerror = () => {
        ytApiPromise = null;
        reject(new Error('Failed to load YouTube Player API'));
      };
      document.head.appendChild(s);
    }
    setTimeout(() => {
      if (window.YT && window.YT.Player) resolve(window.YT);
    }, 5000);
  });
  return ytApiPromise;
}

let scApiPromise: Promise<any> | null = null;
function loadSoundCloudWidgetApi(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.SC && window.SC.Widget) return Promise.resolve(window.SC);
  if (scApiPromise) return scApiPromise;

  scApiPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="w.soundcloud.com/player/api.js"]');
    if (existing) {
      const check = setInterval(() => {
        if (window.SC && window.SC.Widget) {
          clearInterval(check);
          resolve(window.SC);
        }
      }, 100);
      setTimeout(() => clearInterval(check), 8000);
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://w.soundcloud.com/player/api.js';
    s.async = true;
    s.onload = () => {
      if (window.SC && window.SC.Widget) resolve(window.SC);
      else reject(new Error('SoundCloud Widget unavailable'));
    };
    s.onerror = () => {
      scApiPromise = null;
      reject(new Error('Failed to load SoundCloud Widget API'));
    };
    document.head.appendChild(s);
  });
  return scApiPromise;
}

export const MusicPlaybackHost: React.FC<MusicPlaybackHostProps> = ({
  track,
  playNonce,
  isPlaying,
  volume,
  isMuted,
  seekSignal,
  onProgress,
  onPlayStateChange,
  onBufferingChange,
  onTrackEnded,
  onError,
}) => {
  const [backend, setBackend] = useState<ActiveBackend>({ mode: 'none' });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytMountRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytReadyRef = useRef<boolean>(false);
  const scIframeRef = useRef<HTMLIFrameElement | null>(null);
  const scWidgetRef = useRef<any>(null);
  const activeTokenRef = useRef<number>(0);

  // Refs for latest callbacks so event handlers never go stale
  const callbacksRef = useRef({
    onProgress,
    onPlayStateChange,
    onBufferingChange,
    onTrackEnded,
    onError,
  });
  callbacksRef.current = {
    onProgress,
    onPlayStateChange,
    onBufferingChange,
    onTrackEnded,
    onError,
  };

  const backendRef = useRef<ActiveBackend>(backend);
  backendRef.current = backend;
  const failedYtIdsRef = useRef<Set<string>>(new Set());

  const trackRef = useRef(track);
  trackRef.current = track;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const volumeRef = useRef(isMuted ? 0 : volume);
  volumeRef.current = isMuted ? 0 : volume;

  const commitBackend = (next: ActiveBackend) => {
    backendRef.current = next;
    setBackend(next);
  };

  const stopAllOtherEngines = (keep: ActiveBackend['mode']) => {
    if (keep === 'none') {
      backendRef.current = { mode: 'none' };
    }
    if (keep !== 'audio' && audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      } catch {}
    }
    if (keep !== 'youtube' && ytPlayerRef.current && ytReadyRef.current) {
      try {
        ytPlayerRef.current.pauseVideo();
      } catch {}
    }
    if (keep !== 'soundcloud' && scWidgetRef.current) {
      try {
        scWidgetRef.current.pause();
      } catch {}
    }
  };

  // Resolve target playback backend whenever track or playNonce changes
  useEffect(() => {
    const token = ++activeTokenRef.current;
    failedYtIdsRef.current = new Set();
    callbacksRef.current.onError(null);
    callbacksRef.current.onProgress(0, track?.durationSec || 0);

    if (!track) {
      stopAllOtherEngines('none');
      callbacksRef.current.onBufferingChange(false);
      commitBackend({ mode: 'none' });
      return;
    }

    if (track.playbackType === 'audio' && track.streamUrl) {
      stopAllOtherEngines('audio');
      callbacksRef.current.onBufferingChange(true);
      commitBackend({ mode: 'audio', url: track.streamUrl });
      return;
    }

    if (track.playbackType === 'youtube' && track.playbackId) {
      stopAllOtherEngines('youtube');
      callbacksRef.current.onBufferingChange(true);
      commitBackend({ mode: 'youtube', videoId: track.playbackId });
      return;
    }

    if (track.playbackType === 'soundcloud' && (track.playbackId || track.sourceUrl)) {
      stopAllOtherEngines('soundcloud');
      callbacksRef.current.onBufferingChange(true);
      commitBackend({ mode: 'soundcloud', trackUrl: track.playbackId || track.sourceUrl });
      return;
    }

    // For Spotify, Apple Music, Deezer, or snipped SoundCloud: resolve verified full-length matching audio
    stopAllOtherEngines('none');
    callbacksRef.current.onBufferingChange(true);
    commitBackend({ mode: 'none' });

    resolveFullStream(track.title, track.artist, track.durationSec || 0)
      .then((resolved) => {
        if (activeTokenRef.current !== token) return;
        if (resolved.playbackType === 'audio' && resolved.streamUrl) {
          commitBackend({ mode: 'audio', url: resolved.streamUrl });
        } else if (resolved.playbackType === 'youtube' && resolved.playbackId) {
          commitBackend({ mode: 'youtube', videoId: resolved.playbackId });
        } else if (track.previewUrl) {
          commitBackend({ mode: 'audio', url: track.previewUrl });
          callbacksRef.current.onError(
            `Full track embed unavailable — playing 30s official preview. Click "${track.sourceName}" for the full song.`
          );
        } else {
          callbacksRef.current.onBufferingChange(false);
          callbacksRef.current.onPlayStateChange(false);
          callbacksRef.current.onError(
            `Direct playback unavailable here — click "${track.sourceName}" to open on site.`
          );
        }
      })
      .catch(() => {
        if (activeTokenRef.current !== token) return;
        if (track.previewUrl) {
          commitBackend({ mode: 'audio', url: track.previewUrl });
          callbacksRef.current.onError(
            `Full track embed unavailable — playing 30s official preview. Click "${track.sourceName}" for the full song.`
          );
        } else {
          callbacksRef.current.onBufferingChange(false);
          callbacksRef.current.onPlayStateChange(false);
          callbacksRef.current.onError(`Unable to stream right now — click "${track.sourceName}" to listen directly.`);
        }
      });
  }, [track?.id, playNonce]);

  // 1. Native <audio> engine
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || backend.mode !== 'audio') return;

    audio.src = backend.url;
    audio.volume = Math.max(0, Math.min(1, volumeRef.current / 100));
    audio.load();
    if (isPlayingRef.current) {
      audio.play().catch(() => {
        callbacksRef.current.onBufferingChange(false);
      });
    }
  }, [backend]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || backend.mode !== 'audio') return;
    if (isPlaying) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [isPlaying, backend.mode]);

  // 2. YouTube IFrame Player engine
  useEffect(() => {
    if (backend.mode !== 'youtube') return;
    let cancelled = false;
    const videoId = backend.videoId;
    const effectToken = activeTokenRef.current;

    loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled || activeTokenRef.current !== effectToken) return;
        if (ytPlayerRef.current && ytReadyRef.current) {
          try {
            ytPlayerRef.current.setVolume(volumeRef.current);
            if (isPlayingRef.current) {
              ytPlayerRef.current.loadVideoById(videoId);
            } else {
              ytPlayerRef.current.cueVideoById(videoId);
            }
            return;
          } catch {}
        }

        if (!ytMountRef.current) return;
        ytMountRef.current.innerHTML = '';
        const div = document.createElement('div');
        ytMountRef.current.appendChild(div);
        ytReadyRef.current = false;

        ytPlayerRef.current = new YT.Player(div, {
          width: '200',
          height: '200',
          host: 'https://www.youtube-nocookie.com',
          videoId,
          playerVars: {
            autoplay: isPlayingRef.current ? 1 : 0,
            controls: 0,
            disablekb: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
          },
          events: {
            onReady: (ev: any) => {
              ytReadyRef.current = true;
              if (backendRef.current.mode !== 'youtube') return;
              try {
                ev.target.setVolume(volumeRef.current);
                if (isPlayingRef.current) ev.target.playVideo();
              } catch {}
              callbacksRef.current.onBufferingChange(false);
            },
            onStateChange: (ev: any) => {
              if (backendRef.current.mode !== 'youtube') return;
              const s = ev.data;
              if (s === 1) {
                // Playing
                callbacksRef.current.onBufferingChange(false);
                callbacksRef.current.onPlayStateChange(true);
              } else if (s === 2) {
                // Paused
                callbacksRef.current.onBufferingChange(false);
                callbacksRef.current.onPlayStateChange(false);
              } else if (s === 3) {
                // Buffering
                callbacksRef.current.onBufferingChange(true);
              } else if (s === 0) {
                // Ended
                callbacksRef.current.onTrackEnded();
              }
            },
            onError: () => {
              const curBackend = backendRef.current;
              const t = trackRef.current;
              if (curBackend.mode !== 'youtube' || !t) return;

              failedYtIdsRef.current.add(curBackend.videoId);
              const excluded = Array.from(failedYtIdsRef.current);
              const skipYt = excluded.length >= 3;
              const callToken = activeTokenRef.current;

              // Try next verified embeddable match for this exact song before preview fallback
              resolveFullStream(t.title, t.artist, t.durationSec || 0, excluded, skipYt)
                .then((fallback) => {
                  if (activeTokenRef.current !== callToken) return;
                  if (
                    fallback.playbackType === 'youtube' &&
                    fallback.playbackId &&
                    !failedYtIdsRef.current.has(fallback.playbackId)
                  ) {
                    commitBackend({ mode: 'youtube', videoId: fallback.playbackId });
                  } else if (fallback.playbackType === 'audio' && fallback.streamUrl) {
                    stopAllOtherEngines('audio');
                    commitBackend({ mode: 'audio', url: fallback.streamUrl });
                  } else if (t.previewUrl) {
                    stopAllOtherEngines('audio');
                    commitBackend({ mode: 'audio', url: t.previewUrl });
                    callbacksRef.current.onError(
                      `Full embed restricted — playing 30s official preview. Click "${t.sourceName}" for the full song.`
                    );
                  } else {
                    callbacksRef.current.onBufferingChange(false);
                    callbacksRef.current.onPlayStateChange(false);
                    callbacksRef.current.onError(
                      `Playback restricted for this upload — click "${t.sourceName}" to play on the original site.`
                    );
                  }
                })
                .catch(() => {
                  if (activeTokenRef.current !== callToken) return;
                  if (t.previewUrl) {
                    stopAllOtherEngines('audio');
                    commitBackend({ mode: 'audio', url: t.previewUrl });
                    callbacksRef.current.onError(
                      `Full embed restricted — playing 30s official preview. Click "${t.sourceName}" for the full song.`
                    );
                  } else {
                    callbacksRef.current.onBufferingChange(false);
                    callbacksRef.current.onPlayStateChange(false);
                    callbacksRef.current.onError(
                      `Playback restricted — click "${t.sourceName}" to listen on site.`
                    );
                  }
                });
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          callbacksRef.current.onBufferingChange(false);
          callbacksRef.current.onError('YouTube player unavailable right now.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [backend]);

  useEffect(() => {
    if (backend.mode !== 'youtube' || !ytPlayerRef.current || !ytReadyRef.current) return;
    try {
      if (isPlaying) ytPlayerRef.current.playVideo();
      else ytPlayerRef.current.pauseVideo();
    } catch {}
  }, [isPlaying, backend.mode]);

  // Poll YouTube progress smoothly while active
  useEffect(() => {
    if (backend.mode !== 'youtube') return;
    const timer = setInterval(() => {
      const p = ytPlayerRef.current;
      if (!p || !ytReadyRef.current || backendRef.current.mode !== 'youtube') return;
      try {
        const cur = Number(p.getCurrentTime?.() || 0);
        const reportedDur = Number(p.getDuration?.() || 0);
        const dur = reportedDur > 0 ? reportedDur : trackRef.current?.durationSec || 0;
        if (dur > 0 || cur > 0) {
          callbacksRef.current.onProgress(cur, dur);
        }
      } catch {}
    }, 300);
    return () => clearInterval(timer);
  }, [backend.mode]);

  // 3. SoundCloud Widget engine
  useEffect(() => {
    if (backend.mode !== 'soundcloud') return;
    let cancelled = false;
    const token = activeTokenRef.current;
    const iframe = scIframeRef.current;
    if (!iframe) return;

    const widgetUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(
      backend.trackUrl
    )}&auto_play=true&buying=false&liking=false&download=false&sharing=false&show_artwork=false&show_comments=false&show_playcount=false&show_user=false`;

    let activeWidget: any = null;
    let activeSC: any = null;

    const handleIframeLoad = () => {
      if (cancelled || activeTokenRef.current !== token || backendRef.current.mode !== 'soundcloud') return;
      loadSoundCloudWidgetApi()
        .then((SC) => {
          if (cancelled || activeTokenRef.current !== token || !scIframeRef.current) return;
          activeSC = SC;
          const widget = SC.Widget(scIframeRef.current);
          activeWidget = widget;
          scWidgetRef.current = widget;
          let scDurationSec = trackRef.current?.durationSec || 0;

          widget.bind(SC.Widget.Events.READY, () => {
            if (cancelled || activeTokenRef.current !== token) return;
            callbacksRef.current.onBufferingChange(false);
            try {
              widget.setVolume(volumeRef.current);
              widget.getDuration((ms: number) => {
                if (ms > 0) scDurationSec = ms / 1000;
              });
              if (isPlayingRef.current) widget.play();
            } catch {}
          });

          widget.bind(SC.Widget.Events.PLAY, () => {
            if (cancelled || activeTokenRef.current !== token) return;
            callbacksRef.current.onBufferingChange(false);
            callbacksRef.current.onPlayStateChange(true);
            try {
              widget.getDuration((ms: number) => {
                if (ms > 0) scDurationSec = ms / 1000;
              });
            } catch {}
          });

          widget.bind(SC.Widget.Events.PAUSE, () => {
            if (cancelled || activeTokenRef.current !== token) return;
            callbacksRef.current.onPlayStateChange(false);
          });

          widget.bind(SC.Widget.Events.PLAY_PROGRESS, (ev: any) => {
            if (cancelled || activeTokenRef.current !== token) return;
            const posSec = (Number(ev?.currentPosition) || 0) / 1000;
            callbacksRef.current.onProgress(posSec, scDurationSec || trackRef.current?.durationSec || 0);
          });

          widget.bind(SC.Widget.Events.FINISH, () => {
            if (cancelled || activeTokenRef.current !== token) return;
            callbacksRef.current.onTrackEnded();
          });

          widget.bind(SC.Widget.Events.ERROR, () => {
            if (cancelled || activeTokenRef.current !== token) return;
            callbacksRef.current.onBufferingChange(false);
            callbacksRef.current.onError('SoundCloud stream unavailable — click SoundCloud link to open.');
          });
        })
        .catch(() => {
          if (!cancelled) {
            callbacksRef.current.onBufferingChange(false);
            callbacksRef.current.onError('SoundCloud player unavailable right now.');
          }
        });
    };

    iframe.addEventListener('load', handleIframeLoad, { once: true });
    iframe.src = widgetUrl;

    return () => {
      cancelled = true;
      iframe.removeEventListener('load', handleIframeLoad);
      if (activeWidget && activeSC?.Widget?.Events) {
        try {
          activeWidget.unbind(activeSC.Widget.Events.READY);
          activeWidget.unbind(activeSC.Widget.Events.PLAY);
          activeWidget.unbind(activeSC.Widget.Events.PAUSE);
          activeWidget.unbind(activeSC.Widget.Events.PLAY_PROGRESS);
          activeWidget.unbind(activeSC.Widget.Events.FINISH);
          activeWidget.unbind(activeSC.Widget.Events.ERROR);
        } catch {}
      }
      if (scWidgetRef.current === activeWidget) {
        scWidgetRef.current = null;
      }
    };
  }, [backend]);

  useEffect(() => {
    if (backend.mode !== 'soundcloud' || !scWidgetRef.current) return;
    try {
      if (isPlaying) scWidgetRef.current.play();
      else scWidgetRef.current.pause();
    } catch {}
  }, [isPlaying, backend.mode]);

  // Synchronize Volume across all 3 engines
  useEffect(() => {
    const effective = isMuted ? 0 : Math.max(0, Math.min(100, volume));
    if (audioRef.current) {
      audioRef.current.volume = effective / 100;
    }
    if (ytPlayerRef.current && ytReadyRef.current) {
      try {
        ytPlayerRef.current.setVolume(effective);
      } catch {}
    }
    if (scWidgetRef.current) {
      try {
        scWidgetRef.current.setVolume(effective);
      } catch {}
    }
  }, [volume, isMuted]);

  // Synchronize Seek across all 3 engines
  useEffect(() => {
    if (!seekSignal) return;
    const t = Math.max(0, seekSignal.timeSec);
    if (backend.mode === 'audio' && audioRef.current) {
      try {
        audioRef.current.currentTime = t;
      } catch {}
    } else if (backend.mode === 'youtube' && ytPlayerRef.current && ytReadyRef.current) {
      try {
        ytPlayerRef.current.seekTo(t, true);
      } catch {}
    } else if (backend.mode === 'soundcloud' && scWidgetRef.current) {
      try {
        scWidgetRef.current.seekTo(t * 1000);
      } catch {}
    }
  }, [seekSignal?.seq]);

  return (
    <div
      className="fixed bottom-0 left-0 w-px h-px opacity-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      <audio
        ref={audioRef}
        preload="auto"
        onCanPlay={() => {
          if (backendRef.current.mode === 'audio') callbacksRef.current.onBufferingChange(false);
        }}
        onPlaying={() => {
          if (backendRef.current.mode !== 'audio') return;
          callbacksRef.current.onBufferingChange(false);
          callbacksRef.current.onPlayStateChange(true);
        }}
        onPause={() => {
          if (backendRef.current.mode !== 'audio') return;
          callbacksRef.current.onPlayStateChange(false);
        }}
        onWaiting={() => {
          if (backendRef.current.mode === 'audio') callbacksRef.current.onBufferingChange(true);
        }}
        onTimeUpdate={(e) => {
          if (backendRef.current.mode !== 'audio') return;
          const el = e.currentTarget;
          callbacksRef.current.onProgress(
            el.currentTime || 0,
            Number.isFinite(el.duration) && el.duration > 0
              ? el.duration
              : trackRef.current?.durationSec || 0
          );
        }}
        onEnded={() => {
          if (backendRef.current.mode === 'audio') callbacksRef.current.onTrackEnded();
        }}
        onError={() => {
          if (backendRef.current.mode !== 'audio') return;
          const t = trackRef.current;
          callbacksRef.current.onBufferingChange(false);
          callbacksRef.current.onPlayStateChange(false);
          if (t) {
            callbacksRef.current.onError(
              `Audio stream failed — click "${t.sourceName}" to open on site.`
            );
          }
        }}
      />
      <div ref={ytMountRef} />
      <iframe
        ref={scIframeRef}
        title="SoundCloud Audio Bridge"
        width="200"
        height="166"
        allow="autoplay"
      />
    </div>
  );
};
