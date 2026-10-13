import React, { useState, useEffect, useRef } from 'react';
import { LiveStream, StreamMessage, UserProfile } from '../types';
import {
  connectViewerToStream,
  subscribeToStream,
  subscribeToStreamChat,
  sendStreamChatMessage,
  endLiveStream,
  getActiveLocalStream,
  updateViewerCount,
} from '../services/streamingService';
import { sounds } from '../services/soundEffects';
import { MISSING_TEXTURE_DATA_URL } from '../utils/assets';
import {
  X,
  Radio,
  Users,
  Globe,
  MessageSquare,
  Send,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Eye,
  AlertCircle,
  Loader2,
  Share2,
  Gamepad2,
  Flame,
  Shield,
} from 'lucide-react';

interface LiveStreamPlayerModalProps {
  stream: LiveStream;
  currentUser: UserProfile;
  onClose: () => void;
  onStreamEnded?: (streamId: string) => void;
}

export const LiveStreamPlayerModal: React.FC<LiveStreamPlayerModalProps> = ({
  stream: initialStream,
  currentUser,
  onClose,
  onStreamEnded,
}) => {
  const [stream, setStream] = useState<LiveStream>(initialStream);
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>('connecting');
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const theaterContainerRef = useRef<HTMLDivElement | null>(null);

  const isStreamer = currentUser.gamertag.toLowerCase() === stream.streamer.toLowerCase();

  // 1. Subscribe to live stream doc updates
  useEffect(() => {
    const unsub = subscribeToStream(stream.id, (updated) => {
      if (updated) {
        setStream(updated);
        if (updated.status === 'ended') {
          if (onStreamEnded) onStreamEnded(updated.id);
        }
      }
    });
    return unsub;
  }, [stream.id, onStreamEnded]);

  // 2. Subscribe to real-time stream chat
  useEffect(() => {
    const unsubChat = subscribeToStreamChat(stream.id, (msgs) => {
      setMessages((prev) => {
        // Retain any pending optimistic messages that haven't shown up in Firestore yet
        const cloudKeys = new Set(msgs.map((m) => `${m.sender}:${m.text}`));
        const pendingOptimistic = prev.filter(
          (m) => m.id.startsWith('msg-opt-') && !cloudKeys.has(`${m.sender}:${m.text}`)
        );
        const combined = [...msgs, ...pendingOptimistic].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        return combined;
      });
      setTimeout(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
      }, 50);
    });
    return unsubChat;
  }, [stream.id]);

  // 3. Connect Video Stream (Host local stream vs Viewer remote WebRTC stream)
  useEffect(() => {
    if (isStreamer) {
      // Host: use local captured media stream
      const localStream = getActiveLocalStream();
      if (localStream && videoRef.current) {
        videoRef.current.srcObject = localStream;
        videoRef.current.muted = true; // prevent host echo
        videoRef.current.play().catch(() => null);
        setHasRemoteVideo(true);
        setConnectionStatus('broadcasting');
      }
      return;
    }

    // Viewer: connect via WebRTC
    updateViewerCount(stream.id, (stream.viewerCount || 0) + 1);

    const disconnect = connectViewerToStream(
      stream.id,
      (remoteMediaStream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = remoteMediaStream;
          videoRef.current.play().catch(() => null);
          setHasRemoteVideo(true);
          setConnectionStatus('connected');
        }
      },
      (status) => {
        setConnectionStatus(status);
      }
    );

    return () => {
      disconnect();
      updateViewerCount(stream.id, Math.max(1, (stream.viewerCount || 1) - 1));
    };
  }, [stream.id, isStreamer]);

  // Handle Send Chat
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = chatInput.trim();
    if (!clean || isSending) return;

    setChatInput('');
    setIsSending(true);
    sounds.playSelect();

    // Optimistic message displayed immediately in UI
    const tempId = `msg-opt-${Date.now()}`;
    const optimisticMsg: StreamMessage = {
      id: tempId,
      streamId: stream.id,
      sender: currentUser.gamertag,
      senderPic: currentUser.gamerpic || MISSING_TEXTURE_DATA_URL,
      text: clean,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    }, 30);

    try {
      await sendStreamChatMessage(stream.id, currentUser, clean);
    } catch (err) {
      console.error('Failed to send stream message:', err);
      // Remove optimistic message if write failed
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setIsSending(false);
    }
  };

  const handleEndStreamClick = async () => {
    if (!confirm('Are you sure you want to end your live stream broadcast?')) return;
    sounds.playExplosion();
    await endLiveStream(stream.id);
    if (onStreamEnded) onStreamEnded(stream.id);
    onClose();
  };

  const toggleFullscreen = () => {
    if (!theaterContainerRef.current) return;
    if (!document.fullscreenElement) {
      theaterContainerRef.current.requestFullscreen().catch(() => null);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => null);
      setIsFullscreen(false);
    }
  };

  const handleCopyShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    sounds.playSelect();
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/90 backdrop-blur-md select-none">
      <div
        ref={theaterContainerRef}
        className="relative w-full max-w-6xl h-[92vh] bg-[#0c0f17] border border-[#232a3d] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Top Twitch/YouTube Style Streamer Header Bar */}
        <div className="flex items-center justify-between px-5 py-3 bg-[#131722] border-b border-[#232a3d] shrink-0">
          {/* Streamer details & title */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-slate-800 border-2 border-red-500/80 shrink-0">
              <img
                src={stream.streamerPic}
                alt=""
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-red-500 border border-black animate-pulse" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-white truncate">
                  {stream.streamer}
                </span>
                <span className="text-[10px] bg-red-600 text-white font-extrabold px-1.5 py-0.2 rounded uppercase flex items-center gap-1 shrink-0 animate-pulse">
                  <Radio className="w-2.5 h-2.5" /> LIVE
                </span>
                {stream.visibility === 'friends' ? (
                  <span className="text-[10px] bg-cyan-950/80 border border-cyan-800 text-cyan-300 px-1.5 py-0.2 rounded font-bold shrink-0 flex items-center gap-1">
                    <Users className="w-2.5 h-2.5" /> Friends Only
                  </span>
                ) : (
                  <span className="text-[10px] bg-emerald-950/80 border border-emerald-800 text-emerald-300 px-1.5 py-0.2 rounded font-bold shrink-0 flex items-center gap-1">
                    <Globe className="w-2.5 h-2.5" /> Public
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-300 font-semibold truncate flex items-center gap-2 mt-0.5">
                <span className="text-white font-bold truncate">{stream.title}</span>
                <span className="text-slate-500">·</span>
                <span className="text-cyan-400 font-bold shrink-0 flex items-center gap-1">
                  <Gamepad2 className="w-3 h-3" /> {stream.gameTitle}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Actions (Viewers, End stream, Fullscreen, Close) */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Viewer Counter */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1a2130] rounded-lg border border-slate-700 text-xs font-bold text-slate-200">
              <Eye className="w-3.5 h-3.5 text-red-400" />
              <span>{stream.viewerCount || 1}</span>
            </div>

            {/* Share / Copy */}
            <button
              onClick={handleCopyShare}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-[#1c2233] hover:bg-[#28324a] transition-colors cursor-pointer"
              title="Share Stream"
            >
              <Share2 className="w-4 h-4" />
            </button>
            {copiedLink && (
              <span className="text-[10px] text-emerald-400 font-bold hidden sm:inline">
                Link Copied!
              </span>
            )}

            {/* End Stream (If host) */}
            {isStreamer && (
              <button
                onClick={handleEndStreamClick}
                className="px-3 py-1 bg-red-600/90 hover:bg-red-500 text-white text-xs font-bold rounded-lg border border-red-500 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>End Stream</span>
              </button>
            )}

            {/* Fullscreen toggle */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-[#1c2233] hover:bg-[#28324a] transition-colors cursor-pointer"
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close Button */}
            <button
              onClick={() => {
                sounds.playBack();
                onClose();
              }}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-[#1c2233] hover:bg-[#28324a] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Theater Body: Video on Left (75%), Chat on Right (25%) */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden bg-black">
          {/* ================= LEFT: VIDEO STAGE ================= */}
          <div className="flex-1 relative flex items-center justify-center bg-black min-h-0 overflow-hidden group">
            {/* Live WebRTC Video Player */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted={isMuted || isStreamer}
              className={`w-full h-full object-contain ${hasRemoteVideo ? 'block' : 'hidden'}`}
            />

            {/* Fallback Live Snapshot Frame if WebRTC is initializing */}
            {!hasRemoteVideo && stream.previewFrame && (
              <img
                src={stream.previewFrame}
                alt=""
                className="w-full h-full object-contain filter brightness-95"
              />
            )}

            {/* Loading / Connecting Overlay if no frames yet */}
            {!hasRemoteVideo && !stream.previewFrame && (
              <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
                <Loader2 className="w-10 h-10 animate-spin text-red-500" />
                <h3 className="text-base font-bold text-white">
                  Tuning into {stream.streamer}'s stream...
                </h3>
                <p className="text-xs text-slate-400 max-w-sm">
                  Establishing secure low-latency WebRTC broadcast connection.
                </p>
              </div>
            )}

            {/* Stream Status Overlay (Top Left inside video) */}
            <div className="absolute top-4 left-4 z-20 flex items-center gap-2 pointer-events-none opacity-90 group-hover:opacity-100 transition-opacity">
              <span className="px-2.5 py-1 bg-red-600/95 text-white text-xs font-black rounded-lg uppercase tracking-wider flex items-center gap-1.5 shadow-lg backdrop-blur-sm">
                <Radio className="w-3 h-3 animate-pulse" /> LIVE
              </span>
              <span className="px-2 py-1 bg-black/70 text-slate-200 text-xs font-bold rounded-lg backdrop-blur-sm flex items-center gap-1">
                <Eye className="w-3 h-3 text-red-400" /> {stream.viewerCount || 1}
              </span>
              {isStreamer && (
                <span className="px-2.5 py-1 bg-cyan-600/90 text-white text-xs font-bold rounded-lg backdrop-blur-sm">
                  ★ Broadcasting Your Screen
                </span>
              )}
            </div>

            {/* Bottom Controls Bar inside Video */}
            <div className="absolute bottom-4 left-4 right-4 z-20 flex items-center justify-between p-2.5 bg-black/60 backdrop-blur-md rounded-xl border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex items-center gap-3">
                {/* Audio Mute/Unmute */}
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-1.5 text-white hover:text-cyan-400 transition-colors cursor-pointer"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <span className="text-xs font-semibold text-slate-300 truncate">
                  {stream.gameTitle} · Playing live
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400 font-mono">
                  Low Latency WebRTC
                </span>
                <button
                  onClick={toggleFullscreen}
                  className="p-1.5 text-white hover:text-cyan-400 transition-colors cursor-pointer"
                  title="Fullscreen"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* ================= RIGHT: LIVE STREAM CHAT (Twitch Style) ================= */}
          <div className="w-full lg:w-80 h-72 lg:h-full bg-[#10141f] border-t lg:border-t-0 lg:border-l border-[#232a3d] flex flex-col shrink-0">
            {/* Chat Header */}
            <div className="px-4 py-3 bg-[#151a28] border-b border-[#232a3d] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-black uppercase tracking-wider text-white">
                  Stream Chat
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-bold bg-[#1e2536] px-1.5 py-0.5 rounded">
                Live
              </span>
            </div>

            {/* Messages Feed */}
            <div
              ref={chatContainerRef}
              className="flex-1 p-3.5 space-y-3 overflow-y-auto min-h-0 text-xs"
            >
              {/* Welcome message */}
              <div className="p-2.5 rounded-lg bg-[#161c2b] border border-slate-800 text-[11px] text-slate-400 leading-relaxed text-center">
                Welcome to <strong className="text-white">{stream.streamer}'s</strong> live stream chat! Say hello and keep comments respectful.
              </div>

              {messages.map((msg) => {
                const isMsgHost = msg.sender.toLowerCase() === stream.streamer.toLowerCase();
                const isMsgSelf = msg.sender.toLowerCase() === currentUser.gamertag.toLowerCase();

                return (
                  <div key={msg.id} className="flex items-start gap-2 leading-relaxed">
                    <div className="w-6 h-6 rounded-md overflow-hidden bg-slate-800 border border-slate-700 shrink-0 mt-0.5">
                      <img src={msg.senderPic} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-bold truncate text-[11px] ${
                            isMsgHost
                              ? 'text-red-400 font-extrabold'
                              : isMsgSelf
                              ? 'text-cyan-400'
                              : 'text-slate-300'
                          }`}
                        >
                          {msg.sender}
                        </span>
                        {isMsgHost && (
                          <span className="text-[9px] bg-red-950 text-red-300 border border-red-800 px-1 rounded uppercase font-bold">
                            Streamer
                          </span>
                        )}
                      </div>
                      <p className="text-white break-words text-xs">{msg.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Chat Input */}
            <form onSubmit={handleSendMessage} className="p-3 bg-[#131722] border-t border-[#232a3d] flex items-center gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                maxLength={200}
                placeholder="Send a message in chat..."
                className="flex-1 bg-[#0b0e16] text-white text-xs px-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-red-500 font-medium"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || isSending}
                className="p-2 bg-red-600 hover:bg-red-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl transition-colors cursor-pointer shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
