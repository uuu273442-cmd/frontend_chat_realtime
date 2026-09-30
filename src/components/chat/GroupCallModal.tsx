import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PhoneOff, Mic, MicOff, Volume2, VolumeX, Users } from 'lucide-react';
import { useGroupCallSocket } from '../../hooks/useGroupCallSocket';
import { callService } from '../../services/callService';
import Avatar from '../ui/Avatar';
import toast from 'react-hot-toast';

// Gọi nhóm chỉ hỗ trợ THOẠI (không có camera).
//
// Gọi video nhóm cần mỗi người gửi luồng video trực tiếp cho TẤT CẢ người
// còn lại (mô hình "mesh" — n người thì mỗi người mở n-1 kết nối video).
// Với server miễn phí và nhiều người dùng cùng lúc, việc này rất nặng, dễ
// làm treo trình duyệt và rớt kết nối. Voice-only vẫn dùng mesh nhưng nhẹ
// hơn nhiều lần vì không phải mã hoá/giải mã video.
const CALL_TYPE = 'voice' as const;

// Một peer không kết nối được sau chừng này thì coi như thất bại và dọn dẹp,
// tránh treo mãi ở trạng thái "kết nối..." khi hai máy ở hai mạng khác nhau
// không tự bắt được nhau qua STUN.
const PEER_CONNECT_TIMEOUT_MS = 20_000;

// ─── PeerConnection wrapper ───────────────────────────────────────────────────
class PeerConn {
  pc: RTCPeerConnection;
  private remoteSet = false;
  private pending: RTCIceCandidateInit[] = [];

  constructor(
    stream: MediaStream,
    iceServers: RTCIceServer[],
    onIce: (c: RTCIceCandidateInit) => void,
    onTrack: (s: MediaStream) => void,
    onState: (s: RTCPeerConnectionState) => void,
  ) {
    // Cùng cờ debug với CallModal.tsx — xem chú thích ở đó.
    let iceTransportPolicy: RTCIceTransportPolicy = 'all';
    try {
      if (window.localStorage.getItem('ice_transport_policy') === 'relay') {
        iceTransportPolicy = 'relay';
      }
    } catch {
      // bỏ qua nếu localStorage bị chặn
    }

    this.pc = new RTCPeerConnection({ iceServers, iceTransportPolicy });
    stream.getTracks().forEach(t => this.pc.addTrack(t, stream));
    this.pc.onicecandidate = e => { if (e.candidate) onIce(e.candidate.toJSON()); };
    this.pc.ontrack = e => { if (e.streams?.[0]) onTrack(e.streams[0]); };
    this.pc.onconnectionstatechange = () => onState(this.pc.connectionState);
  }

  async setRemote(sdp: RTCSessionDescriptionInit) {
    if (this.remoteSet) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    this.remoteSet = true;
    for (const c of this.pending) {
      await this.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
    }
    this.pending = [];
  }

  async addCandidate(c: RTCIceCandidateInit) {
    if (!this.remoteSet) { this.pending.push(c); return; }
    await this.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
  }

  async offer() {
    const o = await this.pc.createOffer();
    await this.pc.setLocalDescription(o);
    return o;
  }

  async answer() {
    const a = await this.pc.createAnswer();
    await this.pc.setLocalDescription(a);
    return a;
  }

  destroy() { this.pc.close(); }
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface ParticipantState {
  userId: string;
  name: string;
  avatar?: string;
  connected: boolean;
}

interface GroupCallModalProps {
  conversationId: string;
  conversationName: string;
  currentUserId: string;
  currentUserName: string;
  incoming?: { callId: string; hostId: string; callType?: string };
  outgoing?: { callType?: string };
  onClose: () => void;
}

// ─── Participant tile — luôn hiện avatar vì gọi nhóm chỉ có thoại ─────────────
const ParticipantTile = React.memo(({ participant }: { participant: ParticipantState }) => (
  <div className="relative rounded-xl overflow-hidden bg-gray-800 flex items-center justify-center aspect-video min-h-[120px]">
    <div className="flex flex-col items-center gap-2 py-4">
      <Avatar name={participant.name} size="lg" />
      <span className="text-white text-xs font-medium">{participant.name}</span>
    </div>
    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
      <span className="bg-black/70 backdrop-blur-sm rounded-md px-2 py-1 text-white text-[11px] font-semibold shadow-sm truncate max-w-[80%]">
        {participant.name}
      </span>
      {!participant.connected && (
        <span className="bg-yellow-500/70 rounded px-1 py-0.5 text-white text-[9px]">kết nối...</span>
      )}
    </div>
  </div>
));

const LocalTile = React.memo(({ name, isMuted }: { name: string; isMuted: boolean }) => (
  <div className="relative rounded-xl overflow-hidden bg-gray-700 flex items-center justify-center aspect-video min-h-[120px]">
    <div className="flex flex-col items-center gap-2 py-4">
      <Avatar name={name} size="lg" />
      <span className="text-white text-xs font-medium">{name} (Bạn)</span>
    </div>
    <div className="absolute bottom-2 left-2 flex items-center gap-1">
      <span className="bg-black/70 backdrop-blur-sm rounded-md px-2 py-1 text-white text-[11px] font-semibold shadow-sm">
        {name} (Bạn)
      </span>
      {isMuted && <MicOff size={11} className="text-red-400" />}
    </div>
  </div>
));

// ─── Main Component ───────────────────────────────────────────────────────────
const GroupCallModal: React.FC<GroupCallModalProps> = ({
  conversationId,
  conversationName,
  currentUserId,
  currentUserName,
  incoming,
  outgoing,
  onClose,
}) => {
  // isHost là STATE (không phải const) vì có thể đổi khi bị redirect vào call đã có
  const [isHost, setIsHost] = useState(!!outgoing || incoming?.hostId === currentUserId);

  const [callId, setCallId]       = useState(incoming?.callId ?? '');
  const [phase, setPhase]         = useState<'waiting' | 'active' | 'ended'>(incoming ? 'waiting' : 'active');
  const [participants, setParticipants] = useState<ParticipantState[]>([]);
  const [isMuted, setIsMuted]     = useState(false);
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);
  const [duration, setDuration]   = useState(0);

  // Refs để tránh stale closure trong socket callbacks
  const callIdRef      = useRef(incoming?.callId ?? '');
  const phaseRef        = useRef<'waiting' | 'active' | 'ended'>(incoming ? 'waiting' : 'active');
  const localStream     = useRef<MediaStream | null>(null);
  const iceServersRef   = useRef<RTCIceServer[]>([{ urls: 'stun:stun.l.google.com:19302' }]);
  const peers           = useRef<Map<string, PeerConn>>(new Map());
  const audioEls        = useRef<Map<string, HTMLAudioElement>>(new Map());
  const peerTimeouts    = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);

  const setCallIdSync = (id: string) => { callIdRef.current = id; setCallId(id); };
  const setPhaseSync  = (p: typeof phase) => { phaseRef.current = p; setPhase(p); };

  const formatDur = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // ─── Peer connect timeout — tránh một người mãi kẹt ở "kết nối..." ─────────
  const clearPeerTimeout = (userId: string) => {
    const t = peerTimeouts.current.get(userId);
    if (t) { clearTimeout(t); peerTimeouts.current.delete(userId); }
  };

  const startPeerTimeout = (userId: string) => {
    clearPeerTimeout(userId);
    const t = setTimeout(() => {
      peerTimeouts.current.delete(userId);
      peers.current.get(userId)?.destroy();
      peers.current.delete(userId);
      setParticipants(prev => prev.map(p =>
        p.userId === userId ? { ...p, connected: false } : p
      ));
    }, PEER_CONNECT_TIMEOUT_MS);
    peerTimeouts.current.set(userId, t);
  };

  // ─── Cleanup ─────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    peerTimeouts.current.forEach(t => clearTimeout(t));
    peerTimeouts.current.clear();
    localStream.current?.getTracks().forEach(t => t.stop());
    localStream.current = null;
    peers.current.forEach(p => p.destroy());
    peers.current.clear();
    audioEls.current.forEach(a => { a.pause(); a.srcObject = null; });
    audioEls.current.clear();
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  // ─── Get media stream — chỉ audio, gọi nhóm không dùng camera ─────────────
  const getStream = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStream.current = s;
      return s;
    } catch {
      toast.error('Không thể truy cập micro');
      return null;
    }
  }, []);

  // ─── Create peer ──────────────────────────────────────────────────────────
  const createPeer = useCallback((targetId: string): PeerConn | null => {
    if (!localStream.current) return null;
    if (peers.current.has(targetId)) return peers.current.get(targetId)!;

    startPeerTimeout(targetId);

    const peer = new PeerConn(
      localStream.current,
      iceServersRef.current,
      (c) => sendIceCandidate(callIdRef.current, targetId, c),
      (stream) => {
        clearPeerTimeout(targetId);
        setParticipants(prev => prev.map(p =>
          p.userId === targetId ? { ...p, connected: true } : p
        ));
        if (!audioEls.current.has(targetId)) {
          const audio = new Audio();
          audio.autoplay = true;
          audioEls.current.set(targetId, audio);
        }
        const audio = audioEls.current.get(targetId)!;
        audio.srcObject = stream;
        if (!isSpeakerOff) audio.play().catch(() => {});
      },
      (state) => {
        if (state === 'connected') {
          clearPeerTimeout(targetId);
          setParticipants(prev => prev.map(p =>
            p.userId === targetId ? { ...p, connected: true } : p
          ));
        }
        if (state === 'failed') {
          clearPeerTimeout(targetId);
          peers.current.get(targetId)?.destroy();
          peers.current.delete(targetId);
        }
      },
    );

    peers.current.set(targetId, peer);
    return peer;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpeakerOff]);

  const startTimer = () => {
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
  };

  // ─── Socket ───────────────────────────────────────────────────────────────
  const { startGroupCall, joinGroupCall, leaveGroupCall, endGroupCall,
    sendOffer, sendAnswer, sendIceCandidate } = useGroupCallSocket({

    onStarted: ({ callId: cid, hostId }) => {
      // Chỉ xử lý nếu không phải host (host đã handle rồi)
      if (hostId === currentUserId) return;
      setCallIdSync(cid);
      setPhaseSync('waiting');
    },

    // Conversation đã có call đang chạy — mình bị redirect vào call đó
    // thay vì được là host của call mới (fix rejoin tạo call trùng)
    onRedirect: ({ callId: cid, hostId }) => {
      setCallIdSync(cid);
      setIsHost(hostId === currentUserId);
      // BE đã tự động join giúp mình (gọi onGroupCallJoin phía server) nên
      // mình chuyển thẳng sang active — không cần bấm "Tham gia" lại
      setPhaseSync('active');
      if (!timerRef.current) startTimer();
    },

    onJoined: ({ userId, userInfo }) => {
      if (userId === currentUserId) return;

      // Thêm vào danh sách nếu chưa có — CHỜ offer từ user mới, không tự gửi offer
      // (tránh "glare" — cả 2 phía cùng gửi offer sẽ phá WebRTC negotiation)
      setParticipants(prev => {
        if (prev.find(p => p.userId === userId)) return prev;
        return [...prev, {
          userId,
          name: userInfo.name,
          avatar: userInfo.avatar,
          connected: false,
        }];
      });
    },

    onLeft: ({ userId }) => {
      clearPeerTimeout(userId);
      setParticipants(prev => prev.filter(p => p.userId !== userId));
      peers.current.get(userId)?.destroy();
      peers.current.delete(userId);
      const audio = audioEls.current.get(userId);
      if (audio) { audio.pause(); audio.srcObject = null; }
      audioEls.current.delete(userId);
      toast(`Một thành viên đã rời cuộc gọi`, { icon: '👋', duration: 2000 });
    },

    onParticipants: async ({ callId: cid, existingParticipants }) => {
      // User mới join nhận danh sách người đang có mặt (kèm tên) → thêm vào UI + tạo offer
      if (!localStream.current) return;

      setParticipants(prev => {
        const next = [...prev];
        for (const ep of existingParticipants) {
          if (ep.userId === currentUserId) continue;
          const idx = next.findIndex(p => p.userId === ep.userId);
          if (idx === -1) {
            next.push({ userId: ep.userId, name: ep.name, avatar: ep.avatar, connected: false });
          } else {
            next[idx] = { ...next[idx], name: ep.name, avatar: ep.avatar };
          }
        }
        return next;
      });

      for (const ep of existingParticipants) {
        if (ep.userId === currentUserId) continue;
        const peer = createPeer(ep.userId);
        if (peer) {
          const offer = await peer.offer();
          sendOffer(cid, ep.userId, offer);
        }
      }
    },

    onEnded: () => {
      toast('Cuộc gọi nhóm đã kết thúc', { icon: '📵' });
      cleanup();
      setPhaseSync('ended');
      setTimeout(onClose, 1000);
    },

    onOffer: async ({ callId: cid, fromUserId, sdp }) => {
      if (!localStream.current) return;
      // Đảm bảo participant đã có trong danh sách
      setParticipants(prev => {
        if (prev.find(p => p.userId === fromUserId)) return prev;
        return [...prev, { userId: fromUserId, name: '...', connected: false }];
      });
      const peer = createPeer(fromUserId);
      if (!peer) return;
      await peer.setRemote(sdp);
      const ans = await peer.answer();
      sendAnswer(cid, fromUserId, ans);
    },

    onAnswer: async ({ fromUserId, sdp }) => {
      const peer = peers.current.get(fromUserId);
      if (peer) await peer.setRemote(sdp);
    },

    onIceCandidate: async ({ fromUserId, candidate }) => {
      const peer = peers.current.get(fromUserId);
      if (peer) await peer.addCandidate(candidate);
    },
  });

  // ─── Mount ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      // Nạp danh sách STUN/TURN trước khi tạo peer connection đầu tiên
      iceServersRef.current = await callService.getIceServers();

      const stream = await getStream();
      if (!stream) { onClose(); return; }

      if (outgoing) {
        startGroupCall(conversationId, CALL_TYPE);
        setPhaseSync('active');
        startTimer();
      }
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Actions ──────────────────────────────────────────────────────────────
  const handleJoin = async () => {
    if (!callId || !localStream.current) return;
    joinGroupCall(callId);
    setPhaseSync('active');
    startTimer();
  };

  const handleLeave = () => {
    if (callIdRef.current) leaveGroupCall(callIdRef.current);
    cleanup();
    onClose();
  };

  const handleEnd = () => {
    if (callIdRef.current) endGroupCall(callIdRef.current);
    cleanup();
    onClose();
  };

  const toggleMute = () => {
    localStream.current?.getAudioTracks().forEach(t => { t.enabled = isMuted; });
    setIsMuted(m => !m);
  };
  const toggleSpeaker = () => {
    audioEls.current.forEach(a => { a.muted = !isSpeakerOff; });
    setIsSpeakerOff(s => !s);
  };

  // ─── Grid layout ─────────────────────────────────────────────────────────
  const total = participants.length + 1;
  const gridCols = total === 1 ? 'grid-cols-1 max-w-xs mx-auto' :
                   total <= 4 ? 'grid-cols-2' : 'grid-cols-3';

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div className="relative w-full max-w-2xl mx-4 rounded-2xl overflow-hidden shadow-2xl bg-gray-900 text-white flex flex-col"
           style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 flex-shrink-0">
          <div>
            <h2 className="font-bold text-sm leading-tight">{conversationName}</h2>
            <p className="text-xs text-white/50 flex items-center gap-1 mt-0.5">
              <Users size={11} />
              {total} người tham gia
              {phase === 'active' && (
                <span className="ml-2 text-green-400 font-mono text-[11px]">{formatDur(duration)}</span>
              )}
            </p>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
            phase === 'waiting' ? 'bg-yellow-500/20 text-yellow-300' :
            phase === 'active'  ? 'bg-green-500/20 text-green-300' :
            'bg-white/10 text-white/50'
          }`}>
            {phase === 'waiting' ? 'Đang chờ' : phase === 'active' ? 'Đang gọi' : 'Kết thúc'}
          </span>
        </div>

        {/* Grid người tham gia — chỉ render khi call đang active */}
        {phase !== 'ended' ? (
          <div className={`flex-1 overflow-y-auto p-3 grid ${gridCols} gap-2`}>
            <LocalTile name={currentUserName} isMuted={isMuted} />
            {participants.map(p => (
              <ParticipantTile key={p.userId} participant={p} />
            ))}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-10">
            <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center">
              <PhoneOff size={24} className="text-red-400" />
            </div>
            <p className="text-white/60 text-sm">Cuộc gọi đã kết thúc</p>
          </div>
        )}

        {/* Controls */}
        <div className="px-4 py-3 border-t border-white/10 flex-shrink-0">

          {/* WAITING: chờ tham gia */}
          {phase === 'waiting' && (
            <div className="flex items-center justify-center gap-8">
              <div className="flex flex-col items-center gap-1.5">
                <button onClick={handleLeave}
                  className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all active:scale-95 shadow-lg">
                  <PhoneOff size={20} />
                </button>
                <span className="text-[11px] text-white/50">Bỏ qua</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <button onClick={handleJoin}
                  className="w-12 h-12 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-all active:scale-95 shadow-lg animate-pulse">
                  <Users size={20} />
                </button>
                <span className="text-[11px] text-white/50">Tham gia</span>
              </div>
            </div>
          )}

          {/* ACTIVE: đang gọi */}
          {phase === 'active' && (
            <div className="flex items-center justify-between">
              {/* Toggles bên trái */}
              <div className="flex gap-2">
                <button onClick={toggleMute}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all text-sm ${isMuted ? 'bg-red-500/80' : 'bg-white/15 hover:bg-white/25'}`}
                  title={isMuted ? 'Bật micro' : 'Tắt micro'}>
                  {isMuted ? <MicOff size={17} /> : <Mic size={17} />}
                </button>
                <button onClick={toggleSpeaker}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isSpeakerOff ? 'bg-red-500/80' : 'bg-white/15 hover:bg-white/25'}`}
                  title={isSpeakerOff ? 'Bật loa' : 'Tắt loa'}>
                  {isSpeakerOff ? <VolumeX size={17} /> : <Volume2 size={17} />}
                </button>
              </div>

              {/* Actions bên phải — tùy role */}
              <div className="flex gap-2">
                {/* Tất cả đều có nút Rời */}
                <div className="flex flex-col items-center gap-1">
                  <button onClick={handleLeave}
                    className="w-10 h-10 rounded-full bg-orange-500 hover:bg-orange-600 flex items-center justify-center transition-all active:scale-95"
                    title="Rời cuộc gọi (người khác vẫn tiếp tục)">
                    <PhoneOff size={17} />
                  </button>
                  <span className="text-[9px] text-white/40">Rời</span>
                </div>

                {/* Chỉ HOST mới có nút Kết thúc */}
                {isHost && (
                  <div className="flex flex-col items-center gap-1">
                    <button onClick={handleEnd}
                      className="w-10 h-10 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-all active:scale-95"
                      title="Kết thúc cuộc gọi cho tất cả mọi người">
                      <PhoneOff size={17} />
                    </button>
                    <span className="text-[9px] text-white/40">Kết thúc</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {phase === 'ended' && (
            <p className="text-center text-white/40 text-sm py-1">Cuộc gọi đã kết thúc</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default GroupCallModal;
