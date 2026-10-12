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

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

// Global active local stream reference for the current tab
let activeLocalMediaStream: MediaStream | null = null;
let broadcastSnapshotInterval: any = null;

// Track peer connections on the broadcaster side: viewerId -> RTCPeerConnection
const activeViewerPeerConnections: Map<string, RTCPeerConnection> = new Map();

export function getActiveLocalStream(): MediaStream | null {
  return activeLocalMediaStream;
}

/**
 * Capture player's screen, browser tab, or game window with audio
 */
export async function startScreenCapture(): Promise<MediaStream> {
  if (activeLocalMediaStream) {
    activeLocalMediaStream.getTracks().forEach((t) => t.stop());
  }

  const mediaStream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      frameRate: { ideal: 30, max: 60 },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: true,
  });

  activeLocalMediaStream = mediaStream;
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
  const streamRef = doc(db, 'streams', streamId);

  const newStream: LiveStream = {
    id: streamId,
    streamer: user.gamertag,
    streamerPic: user.gamerpic || MISSING_TEXTURE_DATA_URL,
    title: title.trim() || `${user.gamertag}'s ${gameTitle} Stream`,
    gameTitle: gameTitle || 'Atlas Arcade',
    visibility,
    status: 'live',
    startedAt: new Date().toISOString(),
    viewerCount: 1,
  };

  await setDoc(streamRef, newStream);

  // Start periodic live snapshot updater (provides 1-2s fallback live preview)
  startLiveSnapshotBroadcaster(streamId);

  // Listen for viewer join signals to establish WebRTC peer connections
  listenForViewersAsBroadcaster(streamId);

  return newStream;
}

/**
 * Take live snapshots from the local media stream to update previewFrame
 */
function startLiveSnapshotBroadcaster(streamId: string) {
  if (broadcastSnapshotInterval) {
    clearInterval(broadcastSnapshotInterval);
  }

  const video = document.createElement('video');
  video.muted = true;
  video.srcObject = activeLocalMediaStream;
  video.play().catch(() => null);

  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 270;
  const ctx = canvas.getContext('2d');

  broadcastSnapshotInterval = setInterval(async () => {
    if (!activeLocalMediaStream || !activeLocalMediaStream.active) return;
    if (video.videoWidth > 0 && ctx) {
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const previewUrl = canvas.toDataURL('image/jpeg', 0.55);
        const streamRef = doc(db, 'streams', streamId);
        await updateDoc(streamRef, { previewFrame: previewUrl }).catch(() => null);
      } catch {
        // ignore frame capture error
      }
    }
  }, 3500);
}

/**
 * End a live stream session
 */
export async function endLiveStream(streamId: string): Promise<void> {
  if (broadcastSnapshotInterval) {
    clearInterval(broadcastSnapshotInterval);
    broadcastSnapshotInterval = null;
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

  onSnapshot(q, (snapshot) => {
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
  const unsub = onSnapshot(answerRef, async (snap) => {
    if (snap.exists()) {
      const answerData = snap.data();
      if (answerData?.sdp && pc.signalingState !== 'stable') {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answerData.sdp }));
        unsub();
      }
    }
  });

  // Listen for viewer ICE candidates
  const candidatesCol = collection(db, 'streams', streamId, 'signals');
  const qCand = query(candidatesCol, where('target', '==', 'host'), where('from', '==', viewerId));
  onSnapshot(qCand, (snap) => {
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
        const streamerLower = data.streamer.toLowerCase();

        // If public: visible to everyone
        // If friends: visible if streamer is self OR streamer is in friends list
        if (data.visibility === 'public') {
          list.push(data);
        } else if (data.visibility === 'friends') {
          if (streamerLower === currentGamertag || friendUsernames.has(streamerLower)) {
            list.push(data);
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
 * Subscribe to stream live chat messages
 */
export function subscribeToStreamChat(
  streamId: string,
  callback: (messages: StreamMessage[]) => void
): () => void {
  const messagesCol = collection(db, 'streams', streamId, 'messages');
  const q = query(messagesCol, orderBy('timestamp', 'asc'), limit(100));

  return onSnapshot(
    q,
    (snap) => {
      const list: StreamMessage[] = [];
      snap.forEach((d) => {
        list.push(d.data() as StreamMessage);
      });
      callback(list);
    },
    (err) => {
      console.warn('subscribeToStreamChat error:', err);
      callback([]);
    }
  );
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

  await setDoc(msgRef, newMsg);
}

/**
 * Update viewer count
 */
export async function updateViewerCount(streamId: string, count: number): Promise<void> {
  const streamRef = doc(db, 'streams', streamId);
  await updateDoc(streamRef, { viewerCount: Math.max(1, count) }).catch(() => null);
}
