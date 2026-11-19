import {
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { LiveStream, StreamMessage, UserProfile, Friend } from '../types';
import { MISSING_TEXTURE_DATA_URL } from '../utils/assets';
import { compressImageToDataUrl } from '../utils/imageCompressor';
import { sanitizeAvatarUrl } from './userService';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

// Global active local stream reference for the current tab
let activeLocalMediaStream: MediaStream | null = null;
let broadcastSnapshotInterval: any = null;
let broadcastPingInterval: any = null;
let currentBroadcastingStreamId: string | null = null;
let unloadCleanupHandler: (() => void) | null = null;

// Track all active Firestore snapshot unsubscribe callbacks for the broadcaster session
const broadcasterUnsubs: (() => void)[] = [];

// Track peer connections on the broadcaster side: viewerId -> RTCPeerConnection
const activeViewerPeerConnections: Map<string, RTCPeerConnection> = new Map();

export function getActiveLocalStream(): MediaStream | null {
  return activeLocalMediaStream;
}

// Broadcast compositor state & teardown hook
let stopWebsiteCaptureLoop: (() => void) | null = null;

export interface AtlasBroadcastContext {
  gamertag: string;
  currentTab: string;
  activeGameTitle?: string;
  activeGameGenre?: string;
  currentTrackTitle?: string;
  currentTrackArtist?: string;
  currentTrackSource?: string;
  isMusicPlaying?: boolean;
  gamesCount: number;
}

let latestBroadcastContext: AtlasBroadcastContext = {
  gamertag: 'Player',
  currentTab: 'HOME',
  gamesCount: 0,
};

export function updateAtlasBroadcastContext(ctx: AtlasBroadcastContext): void {
  latestBroadcastContext = ctx;
}

/**
 * Find the largest playable <canvas> or <video> inside any open same-origin game iframe or main page
 */
function findSameOriginPlayableSurface(): HTMLCanvasElement | HTMLVideoElement | null {
  const inspectDoc = (doc: Document, depth = 0): HTMLCanvasElement | HTMLVideoElement | null => {
    if (depth > 2) return null;
    try {
      const canvases = Array.from(doc.querySelectorAll('canvas'));
      let bestCanvas: HTMLCanvasElement | null = null;
      let bestArea = 0;
      for (const c of canvases) {
        if (c.dataset.atlasBroadcastSurface === '1') continue;
        const rect = c.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (rect.width >= 120 && rect.height >= 120 && area > bestArea) {
          bestCanvas = c;
          bestArea = area;
        }
      }
      if (bestCanvas) return bestCanvas;

      const videos = Array.from(doc.querySelectorAll('video'));
      for (const v of videos) {
        if (v.dataset.atlasBroadcastBridge === '1') continue;
        const rect = v.getBoundingClientRect();
        if (rect.width >= 120 && rect.height >= 120 && v.readyState >= 2) {
          return v;
        }
      }

      const frames = Array.from(doc.querySelectorAll('iframe'));
      for (const frame of frames) {
        try {
          const innerDoc = frame.contentDocument || frame.contentWindow?.document;
          if (innerDoc) {
            const found = inspectDoc(innerDoc, depth + 1);
            if (found) return found;
          }
        } catch {
          // Cross-origin iframe cannot be pixel-read by browser security policy
        }
      }
    } catch {}
    return null;
  };

  return inspectDoc(document, 0);
}

/**
 * Capture ONLY this Atlas website directly in-page via Canvas 30fps stream.
 * Never calls getDisplayMedia, so it works cleanly inside restricted iframes
 * and never exposes external desktop apps or screens.
 */
export async function startScreenCapture(): Promise<MediaStream> {
  if (stopWebsiteCaptureLoop) {
    stopWebsiteCaptureLoop();
    stopWebsiteCaptureLoop = null;
  }
  if (activeLocalMediaStream) {
    activeLocalMediaStream.getTracks().forEach((t) => t.stop());
    activeLocalMediaStream = null;
  }

  const W = 1280;
  const H = 720;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.dataset.atlasBroadcastSurface = '1';

  const ctx = canvas.getContext('2d');
  if (!ctx || typeof canvas.captureStream !== 'function') {
    throw new Error('This browser does not support in-page canvas streaming.');
  }

  let running = true;
  const startedAt = Date.now();
  let mirroredCanvas: HTMLCanvasElement | null = null;
  let bridgeVideo: HTMLVideoElement | null = null;
  let bridgeStream: MediaStream | null = null;

  const cleanupBridge = () => {
    if (bridgeStream) {
      bridgeStream.getTracks().forEach((t) => t.stop());
      bridgeStream = null;
    }
    if (bridgeVideo) {
      bridgeVideo.pause();
      bridgeVideo.srcObject = null;
      bridgeVideo = null;
    }
    mirroredCanvas = null;
  };

  const ensureCanvasBridge = (target: HTMLCanvasElement) => {
    if (mirroredCanvas === target) return;
    cleanupBridge();
    mirroredCanvas = target;
    try {
      if (typeof target.captureStream === 'function') {
        bridgeStream = target.captureStream(30);
        bridgeVideo = document.createElement('video');
        bridgeVideo.dataset.atlasBroadcastBridge = '1';
        bridgeVideo.muted = true;
        bridgeVideo.playsInline = true;
        bridgeVideo.srcObject = bridgeStream;
        bridgeVideo.play().catch(() => null);
      }
    } catch {
      cleanupBridge();
    }
  };

  const drawContained = (source: HTMLCanvasElement | HTMLVideoElement, srcW: number, srcH: number) => {
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, W, H);
    if (srcW <= 0 || srcH <= 0) return;
    const scale = Math.min(W / srcW, H / srcH);
    const dw = Math.round(srcW * scale);
    const dh = Math.round(srcH * scale);
    const dx = Math.round((W - dw) / 2);
    const dy = Math.round((H - dh) / 2);
    ctx.drawImage(source, dx, dy, dw, dh);
  };

  const drawAtlasWebsiteScene = () => {
    const state = latestBroadcastContext;
    const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
    const mins = Math.floor(elapsedSec / 60);
    const secs = elapsedSec % 60;
    const clock = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    // Dark Atlas background gradient
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#070a10');
    bg.addColorStop(0.55, '#0d1524');
    bg.addColorStop(1, '#070a10');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Subtle grid lines matching Atlas theme
    ctx.strokeStyle = 'rgba(0, 162, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Header strip
    ctx.fillStyle = 'rgba(13, 19, 32, 0.92)';
    ctx.fillRect(0, 0, W, 74);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 74, W, 1);

    ctx.fillStyle = '#00A2FF';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText('ATLAS', 44, 46);

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(`@${state.gamertag}`, 152, 45);

    // Active tab bar
    const navTabs = ['HOME', 'GAMES', 'MUSIC', 'STREAMS', 'FRIENDS'];
    let tx = 360;
    for (const tab of navTabs) {
      const active = state.currentTab === tab;
      ctx.fillStyle = active ? '#ffffff' : '#64748b';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText(tab, tx, 45);
      if (active) {
        ctx.fillStyle = '#00A2FF';
        ctx.fillRect(tx, 58, ctx.measureText(tab).width, 3);
      }
      tx += 105;
    }

    // Stream LIVE timer badge (top-right)
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.roundRect(W - 180, 22, 136, 32, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`LIVE  ${clock}`, W - 160, 43);

    // Center stage card
    ctx.fillStyle = 'rgba(16, 23, 38, 0.95)';
    ctx.strokeStyle = 'rgba(0, 162, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(64, 118, W - 128, 450, 18);
    ctx.fill();
    ctx.stroke();

    if (state.activeGameTitle) {
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText(
        `ACTIVE GAME SESSION${state.activeGameGenre ? ` · ${state.activeGameGenre.toUpperCase()}` : ''}`,
        104,
        180
      );

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 42px system-ui, sans-serif';
      ctx.fillText(state.activeGameTitle.slice(0, 38), 104, 240);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillText(
        'Playing inside the Atlas Arcade browser stage (website-only stream).',
        104,
        290
      );

      // Clean live equalizer / activity bars (driven by frame timestamp)
      const t = Date.now() / 220;
      for (let i = 0; i < 24; i++) {
        const barH = 22 + Math.round(Math.abs(Math.sin(t + i * 0.45)) * 78);
        ctx.fillStyle = i % 3 === 0 ? '#00A2FF' : '#00B06F';
        ctx.fillRect(104 + i * 24, 480 - barH, 14, barH);
      }
    } else {
      ctx.fillStyle = '#00A2FF';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText(`ATLAS WEBSITE · ${state.currentTab} VIEW`, 104, 180);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 38px system-ui, sans-serif';
      ctx.fillText(
        state.currentTab === 'MUSIC'
          ? 'Browsing Ad-Free Multi-Site Music'
          : state.currentTab === 'GAMES'
            ? `Browsing Game Library (${state.gamesCount} Games)`
            : `Live in Atlas ${state.currentTab}`,
        104,
        242
      );

      ctx.fillStyle = '#94a3b8';
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillText(
        'Launch any game or browse Atlas — viewers automatically see your live website activity.',
        104,
        290
      );
    }

    // Bottom Now-Playing Music strip (if music track is active)
    if (state.currentTrackTitle) {
      ctx.fillStyle = 'rgba(11, 16, 27, 0.96)';
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(64, 594, W - 128, 84, 14);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = state.isMusicPlaying ? '#00B06F' : '#64748b';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(
        `${state.isMusicPlaying ? 'NOW PLAYING' : 'PAUSED'}${state.currentTrackSource ? ` · FROM ${state.currentTrackSource.toUpperCase()}` : ''}`,
        94,
        626
      );

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px system-ui, sans-serif';
      const musicLine = `${state.currentTrackTitle}${state.currentTrackArtist ? ` — ${state.currentTrackArtist}` : ''}`;
      ctx.fillText(musicLine.slice(0, 68), 94, 656);
    }
  };

  let surfacePollCounter = 0;
  let cachedSurface: HTMLCanvasElement | HTMLVideoElement | null = null;

  const renderFrame = () => {
    if (!running) return;
    try {
      if (surfacePollCounter % 15 === 0) {
        cachedSurface = findSameOriginPlayableSurface();
      }
      surfacePollCounter += 1;

      if (cachedSurface instanceof HTMLCanvasElement && document.contains(cachedSurface)) {
        ensureCanvasBridge(cachedSurface);
        if (bridgeVideo && bridgeVideo.readyState >= 2 && bridgeVideo.videoWidth > 0) {
          drawContained(bridgeVideo, bridgeVideo.videoWidth, bridgeVideo.videoHeight);
        } else {
          try {
            drawContained(cachedSurface, cachedSurface.width, cachedSurface.height);
          } catch {
            drawAtlasWebsiteScene();
          }
        }
      } else if (cachedSurface instanceof HTMLVideoElement && cachedSurface.readyState >= 2) {
        drawContained(cachedSurface, cachedSurface.videoWidth, cachedSurface.videoHeight);
      } else {
        cleanupBridge();
        drawAtlasWebsiteScene();
      }
    } catch {
      drawAtlasWebsiteScene();
    }
  };

  // Paint initial frame immediately so stream is non-empty from frame 0
  renderFrame();
  const intervalId = window.setInterval(renderFrame, Math.round(1000 / 30));

  const mediaStream = canvas.captureStream(30);
  activeLocalMediaStream = mediaStream;

  stopWebsiteCaptureLoop = () => {
    running = false;
    window.clearInterval(intervalId);
    cleanupBridge();
  };

  return mediaStream;
}

/**
 * Create a live stream session in Cloud Firestore
 */
export async function createLiveStream(
  user: UserProfile,
  gameTitle: string,
  title: string,
  visibility: 'public' | 'friends'
): Promise<LiveStream> {
  const streamId = `stream-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  currentBroadcastingStreamId = streamId;
  const streamRef = doc(db, 'streams', streamId);

  // Compress avatar pic to ensure streamerPic is tiny (< 3KB)
  let cleanPic = MISSING_TEXTURE_DATA_URL;
  if (user.gamerpic) {
    if (user.gamerpic.startsWith('data:image')) {
      try {
        cleanPic = await compressImageToDataUrl(user.gamerpic, 64, 64, 0.7);
      } catch {
        cleanPic = user.gamerpic.length > 50000 ? MISSING_TEXTURE_DATA_URL : user.gamerpic;
      }
    } else {
      cleanPic = user.gamerpic;
    }
  }

  const newStream: LiveStream = {
    id: streamId,
    streamer: user.gamertag,
    streamerPic: cleanPic,
    title: title.trim() || `${user.gamertag}'s ${gameTitle} Stream`,
    gameTitle: gameTitle || 'Atlas Arcade',
    visibility,
    status: 'live',
    startedAt: new Date().toISOString(),
    viewerCount: 1,
  };

  await setDoc(streamRef, newStream);

  // Sync to high-capacity server storage
  try {
    fetch('/api/storage/streams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newStream),
    }).catch(() => null);
  } catch {
    // ignore
  }

  // Hook tab closing / navigation beacon so streams never get stuck "live"
  const unloadHandler = () => {
    try {
      navigator.sendBeacon(`/api/storage/streams/${streamId}/end`);
    } catch {
      // ignore
    }
  };
  window.addEventListener('beforeunload', unloadHandler);
  window.addEventListener('pagehide', unloadHandler);
  unloadCleanupHandler = () => {
    window.removeEventListener('beforeunload', unloadHandler);
    window.removeEventListener('pagehide', unloadHandler);
  };

  // Start periodic live snapshot updater (safe interval, quota-protected)
  startLiveSnapshotBroadcaster(streamId);

  // Listen for viewer join signals to establish WebRTC peer connections
  listenForViewersAsBroadcaster(streamId);

  return newStream;
}

/**
 * Take live snapshots from the local media stream to update previewFrame.
 * Uses ultra-compact 160x90 dimensions and 0.35 JPEG quality (~1.5KB).
 * Captures initial snapshot after 1.5s, then syncs to server storage.
 * Strictly prevents Firestore quota depletion and high document write frequencies.
 */
function startLiveSnapshotBroadcaster(streamId: string) {
  if (broadcastSnapshotInterval) {
    clearInterval(broadcastSnapshotInterval);
  }
  if (broadcastPingInterval) {
    clearInterval(broadcastPingInterval);
  }

  const video = document.createElement('video');
  video.muted = true;
  video.srcObject = activeLocalMediaStream;
  video.play().catch(() => null);

  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 90;
  const ctx = canvas.getContext('2d');

  // Initial snapshot to set stream thumbnail in Firestore
  setTimeout(async () => {
    if (!activeLocalMediaStream || !activeLocalMediaStream.active) return;
    if (video.videoWidth > 0 && ctx) {
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const previewUrl = canvas.toDataURL('image/jpeg', 0.35);
        const streamRef = doc(db, 'streams', streamId);
        await updateDoc(streamRef, { previewFrame: previewUrl }).catch(() => null);

        fetch(`/api/storage/streams/${streamId}/snapshot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ previewFrame: previewUrl }),
        }).catch(() => null);
      } catch {
        // ignore
      }
    }
  }, 1500);

  // Periodic server snapshot sync every 25 seconds (safe, zero Firestore quota cost)
  broadcastSnapshotInterval = setInterval(async () => {
    if (!activeLocalMediaStream || !activeLocalMediaStream.active) return;
    if (video.videoWidth > 0 && ctx) {
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const previewUrl = canvas.toDataURL('image/jpeg', 0.35);

        fetch(`/api/storage/streams/${streamId}/snapshot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ previewFrame: previewUrl }),
        }).catch(() => null);
      } catch {
        // ignore frame capture error
      }
    }
  }, 25000);

  // Lightweight server keep-alive ping every 10 seconds
  broadcastPingInterval = setInterval(() => {
    fetch(`/api/storage/streams/${streamId}/ping`, { method: 'POST' }).catch(() => null);
  }, 10000);
}

/**
 * End a live stream session and clean up all resources
 */
export async function endLiveStream(streamId: string): Promise<void> {
  currentBroadcastingStreamId = null;

  if (broadcastSnapshotInterval) {
    clearInterval(broadcastSnapshotInterval);
    broadcastSnapshotInterval = null;
  }
  if (broadcastPingInterval) {
    clearInterval(broadcastPingInterval);
    broadcastPingInterval = null;
  }

  if (unloadCleanupHandler) {
    unloadCleanupHandler();
    unloadCleanupHandler = null;
  }

  // Clean up all broadcaster Firestore listeners
  broadcasterUnsubs.forEach((unsub) => {
    try {
      unsub();
    } catch {
      // ignore
    }
  });
  broadcasterUnsubs.length = 0;

  if (stopWebsiteCaptureLoop) {
    stopWebsiteCaptureLoop();
    stopWebsiteCaptureLoop = null;
  }

  if (activeLocalMediaStream) {
    activeLocalMediaStream.getTracks().forEach((track) => track.stop());
    activeLocalMediaStream = null;
  }

  activeViewerPeerConnections.forEach((pc) => pc.close());
  activeViewerPeerConnections.clear();

  try {
    const streamRef = doc(db, 'streams', streamId);
    await updateDoc(streamRef, {
      status: 'ended',
      endedAt: new Date().toISOString(),
    });

    fetch(`/api/storage/streams/${streamId}`, {
      method: 'DELETE',
    }).catch(() => null);
  } catch (err) {
    console.warn('Error marking stream as ended:', err);
  }
}

/**
 * Broadcaster side: listens for viewers requesting WebRTC connection
 */
function listenForViewersAsBroadcaster(streamId: string) {
  const signalsCol = collection(db, 'streams', streamId, 'signals');
  const q = query(signalsCol, where('type', '==', 'viewer-join'));

  const unsub = onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        const data = change.doc.data();
        const viewerId = data.viewerId;

        if (viewerId && activeLocalMediaStream) {
          await handleViewerJoinOffer(streamId, viewerId);
        }
      }
    });
  });
  broadcasterUnsubs.push(unsub);
}

/**
 * Create WebRTC offer for a joined viewer
 */
async function handleViewerJoinOffer(streamId: string, viewerId: string) {
  if (!activeLocalMediaStream) return;

  const pc = new RTCPeerConnection(RTC_CONFIG);
  activeViewerPeerConnections.set(viewerId, pc);

  activeLocalMediaStream.getTracks().forEach((track) => {
    pc.addTrack(track, activeLocalMediaStream!);
  });

  // ICE candidates to viewer
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      const candidateRef = doc(
        db,
        'streams',
        streamId,
        'signals',
        `cand-host-${viewerId}-${Date.now()}`
      );
      setDoc(candidateRef, {
        type: 'candidate',
        target: viewerId,
        from: 'host',
        candidate: event.candidate.toJSON(),
      }).catch(() => null);
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const offerRef = doc(db, 'streams', streamId, 'signals', `offer-${viewerId}`);
  await setDoc(offerRef, {
    type: 'offer',
    target: viewerId,
    sdp: offer.sdp,
  });

  // Listen for viewer's answer
  const answerRef = doc(db, 'streams', streamId, 'signals', `answer-${viewerId}`);
  const unsubAnswer = onSnapshot(answerRef, async (snap) => {
    if (snap.exists()) {
      const answerData = snap.data();
      if (answerData?.sdp && pc.signalingState !== 'stable') {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answerData.sdp }));
        unsubAnswer();
      }
    }
  });
  broadcasterUnsubs.push(unsubAnswer);

  // Listen for viewer ICE candidates
  const candidatesCol = collection(db, 'streams', streamId, 'signals');
  const qCand = query(candidatesCol, where('target', '==', 'host'), where('from', '==', viewerId));
  const unsubCand = onSnapshot(qCand, (snap) => {
    snap.docChanges().forEach(async (c) => {
      if (c.type === 'added') {
        const candData = c.doc.data();
        if (candData?.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candData.candidate));
          } catch {
            // ignore
          }
        }
      }
    });
  });
  broadcasterUnsubs.push(unsubCand);
}

/**
 * Viewer side: Connect to WebRTC live stream
 */
export function connectViewerToStream(
  streamId: string,
  onRemoteStream: (stream: MediaStream) => void,
  onConnectionStatus?: (status: string) => void
): () => void {
  const viewerId = `viewer-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const pc = new RTCPeerConnection(RTC_CONFIG);

  pc.ontrack = (event) => {
    if (event.streams && event.streams[0]) {
      onRemoteStream(event.streams[0]);
    }
  };

  pc.onconnectionstatechange = () => {
    if (onConnectionStatus) {
      onConnectionStatus(pc.connectionState);
    }
  };

  // ICE Candidate to host
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      const candRef = doc(
        db,
        'streams',
        streamId,
        'signals',
        `cand-view-${viewerId}-${Date.now()}`
      );
      setDoc(candRef, {
        type: 'candidate',
        target: 'host',
        from: viewerId,
        candidate: event.candidate.toJSON(),
      }).catch(() => null);
    }
  };

  // Notify host that viewer joined
  const joinRef = doc(db, 'streams', streamId, 'signals', `join-${viewerId}`);
  setDoc(joinRef, {
    type: 'viewer-join',
    viewerId,
    timestamp: new Date().toISOString(),
  }).catch(() => null);

  // Listen for host offer
  const offerRef = doc(db, 'streams', streamId, 'signals', `offer-${viewerId}`);
  const unsubOffer = onSnapshot(offerRef, async (snap) => {
    if (snap.exists()) {
      const offerData = snap.data();
      if (offerData?.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: offerData.sdp }));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        const answerRef = doc(db, 'streams', streamId, 'signals', `answer-${viewerId}`);
        await setDoc(answerRef, {
          type: 'answer',
          from: viewerId,
          sdp: answer.sdp,
        });
      }
    }
  });

  // Listen for host candidates
  const signalsCol = collection(db, 'streams', streamId, 'signals');
  const qCand = query(signalsCol, where('target', '==', viewerId), where('from', '==', 'host'));
  const unsubCand = onSnapshot(qCand, (snap) => {
    snap.docChanges().forEach(async (c) => {
      if (c.type === 'added') {
        const candData = c.doc.data();
        if (candData?.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candData.candidate));
          } catch {
            // ignore
          }
        }
      }
    });
  });

  // Cleanup function
  return () => {
    unsubOffer();
    unsubCand();
    pc.close();
  };
}

/**
 * Subscribe to live streams matching visibility permissions
 */
export function subscribeToActiveStreams(
  currentUser: UserProfile | null,
  friends: Friend[],
  callback: (streams: LiveStream[]) => void
): () => void {
  const streamsCol = collection(db, 'streams');
  const q = query(streamsCol, where('status', '==', 'live'));

  const friendUsernames = new Set(friends.map((f) => f.username.toLowerCase()));
  const currentGamertag = currentUser?.gamertag.toLowerCase();

  return onSnapshot(
    q,
    (snapshot) => {
      const list: LiveStream[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as LiveStream;
        const cleanStream: LiveStream = {
          ...data,
          streamerPic: sanitizeAvatarUrl(data.streamerPic),
        };
        const streamerLower = cleanStream.streamer.toLowerCase();

        const startedTime = new Date(cleanStream.startedAt || 0).getTime();
        // Skip stale abandoned streams older than 4 hours
        if (Date.now() - startedTime > 4 * 60 * 60 * 1000) {
          return;
        }

        // If public: visible to everyone
        // If friends: visible if streamer is self OR streamer is in friends list
        if (cleanStream.visibility === 'public') {
          list.push(cleanStream);
        } else if (cleanStream.visibility === 'friends') {
          if (streamerLower === currentGamertag || friendUsernames.has(streamerLower)) {
            list.push(cleanStream);
          }
        }
      });

      // Sort by newest first
      list.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      callback(list);
    },
    (err) => {
      console.warn('subscribeToActiveStreams error:', err);
      callback([]);
    }
  );
}

/**
 * Subscribe to single stream doc
 */
export function subscribeToStream(
  streamId: string,
  callback: (stream: LiveStream | null) => void
): () => void {
  const streamRef = doc(db, 'streams', streamId);
  return onSnapshot(streamRef, (snap) => {
    if (snap.exists()) {
      callback(snap.data() as LiveStream);
    } else {
      callback(null);
    }
  });
}

/**
 * Subscribe to stream live chat messages with multi-layer resilience
 * (Firestore real-time listener + BroadcastChannel + Server storage fallback)
 */
export function subscribeToStreamChat(
  streamId: string,
  callback: (messages: StreamMessage[]) => void
): () => void {
  const messageMap = new Map<string, StreamMessage>();

  const emit = () => {
    const sorted = Array.from(messageMap.values()).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    callback(sorted);
  };

  // 1. Initial & periodic sync from server memory storage
  const syncFromServer = async () => {
    try {
      const res = await fetch(`/api/storage/streams/${streamId}/messages`);
      if (res.ok) {
        const serverMsgs: StreamMessage[] = await res.json();
        let changed = false;
        for (const m of serverMsgs) {
          if (!messageMap.has(m.id)) {
            messageMap.set(m.id, m);
            changed = true;
          }
        }
        if (changed) emit();
      }
    } catch {
      // ignore
    }
  };
  syncFromServer();
  const pollInterval = setInterval(syncFromServer, 4000);

  // 2. BroadcastChannel for zero-latency cross-tab communication
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(`atlas_chat_${streamId}`);
    channel.onmessage = (event) => {
      const msg = event.data as StreamMessage;
      if (msg && msg.id && !messageMap.has(msg.id)) {
        messageMap.set(msg.id, msg);
        emit();
      }
    };
  } catch {
    // BroadcastChannel unsupported
  }

  // 3. Firestore onSnapshot real-time subscription
  const messagesCol = collection(db, 'streams', streamId, 'messages');
  const q = query(messagesCol, orderBy('timestamp', 'asc'), limit(100));

  const unsubFirestore = onSnapshot(
    q,
    (snap) => {
      snap.forEach((d) => {
        const msg = d.data() as StreamMessage;
        messageMap.set(msg.id, msg);
      });
      emit();
    },
    (err) => {
      console.warn('subscribeToStreamChat Firestore notice:', err);
    }
  );

  return () => {
    unsubFirestore();
    clearInterval(pollInterval);
    if (channel) {
      channel.close();
    }
  };
}

/**
 * Send message to stream live chat
 */
export async function sendStreamChatMessage(
  streamId: string,
  user: UserProfile,
  text: string
): Promise<void> {
  const clean = text.trim();
  if (!clean) return;

  const msgId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const msgRef = doc(db, 'streams', streamId, 'messages', msgId);

  const newMsg: StreamMessage = {
    id: msgId,
    streamId,
    sender: user.gamertag,
    senderPic: user.gamerpic || MISSING_TEXTURE_DATA_URL,
    text: clean,
    timestamp: new Date().toISOString(),
  };

  // 1. Post to BroadcastChannel immediately for instant local reflection
  try {
    const channel = new BroadcastChannel(`atlas_chat_${streamId}`);
    channel.postMessage(newMsg);
    setTimeout(() => channel.close(), 100);
  } catch {
    // ignore
  }

  // 2. Post to server-side resilient storage
  try {
    fetch(`/api/storage/streams/${streamId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newMsg),
    }).catch(() => null);
  } catch {
    // ignore
  }

  // 3. Write to Firestore document
  await setDoc(msgRef, newMsg);
}

/**
 * Update viewer count
 */
export async function updateViewerCount(streamId: string, count: number): Promise<void> {
  const streamRef = doc(db, 'streams', streamId);
  await updateDoc(streamRef, { viewerCount: Math.max(1, count) }).catch(() => null);
}
