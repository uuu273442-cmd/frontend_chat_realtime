import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PhoneOff, Phone, Mic, MicOff, Volume2, VolumeX, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { useGroupCallSocket } from '../../hooks/useGroupCallSocket';
import { callService } from '../../services/callService';
import { PeerConnection, getMicStream, stopStream, formatDuration } from '../../utils/webrtc';
import { CallBackground, CallButton } from './CallParts';

// một người quá thời gian này chưa nghe được thì thử nối lại
const PEER_CONNECT_TIMEOUT_MS = 20_000;
// mạng chập chờn: chờ chừng này rồi mới thử nối lại
const DISCONNECT_GRACE_MS = 4_000;
// số lần thử nối lại cho mỗi người
const MAX_ICE_RESTART = 2;

interface ParticipantState {
  userId: string;
  name: string;
  avatar?: string | null;
  connected: boolean;
}

// một kết nối tới một người trong nhóm
interface PeerEntry {
  peer: PeerConnection;
  // true nếu mình là bên tạo offer (chỉ bên này được thử nối lại)
  initiator: boolean;
  restarts: number;
  timer: ReturnType<typeof setTimeout> | null;
  audio: HTMLAudioElement | null;
}

interface GroupCallModalProps {
  conversationId: string;
  conversationName: string;
  currentUserId: string;
  currentUserName: string;
  incoming?: { callId: string; hostId: string };
  outgoing?: boolean;
  onClose: () => void;
}

type Phase = 'waiting' | 'active' | 'ended';

const GroupCallModal: React.FC<GroupCallModalProps> = ({
  conversationId,
  conversationName,
  currentUserId,
  incoming,
  outgoing,
  onClose,
}) => {
  const [isHost, setIsHost] = useState(!!outgoing || incoming?.hostId === currentUserId);
  const [phase, setPhase] = useState<Phase>(incoming ? 'waiting' : 'active');
  const [participants, setParticipants] = useState<ParticipantState[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);
  const [duration, setDuration] = useState(0);

  const phaseRef = useRef<Phase>(incoming ? 'waiting' : 'active');
  const callIdRef = useRef(incoming?.callId ?? '');
  const localStream = useRef<MediaStream | null>(null);
  const iceServers = useRef<RTCIceServer[]>([]);
  const peers = useRef<Map<string, PeerEntry>>(new Map());
  // candidate đến trước khi tạo kết nối với người đó
  const earlyCandidates = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const speakerOffRef = useRef(false);
  const durationTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const closedRef = useRef(false);
  const startedRef = useRef(false);
  const mountedRef = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => { onCloseRef.current = onClose; });

  const setPhaseSync = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  const startTimer = () => {
    if (durationTimer.current) return;
    durationTimer.current = setInterval(() => setDuration((d) => d + 1), 1000);
  };

  const markConnected = (userId: string, connected: boolean) =>
    setParticipants((prev) => prev.map((p) => (p.userId === userId ? { ...p, connected } : p)));

  // ─── dọn dẹp ───────────────────────────────────────────────────────────
  const closePeer = (userId: string) => {
    const entry = peers.current.get(userId);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    entry.audio?.pause();
    if (entry.audio) entry.audio.srcObject = null;
    entry.peer.close();
    peers.current.delete(userId);
    earlyCandidates.current.delete(userId);
  };

  const teardown = useCallback(() => {
    if (durationTimer.current) clearInterval(durationTimer.current);
    durationTimer.current = null;
    [...peers.current.keys()].forEach(closePeer);
    stopStream(localStream.current);
    localStream.current = null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = (delay = 800) => {
    if (closedRef.current) return;
    closedRef.current = true;
    teardown();
    setPhaseSync('ended');
    setTimeout(() => onCloseRef.current(), delay);
  };

  // chỉ dọn khi thật sự bị gỡ (StrictMode giả lập gỡ rồi gắn lại ngay)
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      setTimeout(() => { if (!mountedRef.current) teardown(); }, 0);
    };
  }, [teardown]);

  // ─── kết nối với từng người ────────────────────────────────────────────
  // bên tạo offer thử nối lại đường truyền cho người đó
  const restartPeer = async (userId: string) => {
    const entry = peers.current.get(userId);
    if (!entry || closedRef.current) return;

    if (!entry.initiator) return; // chờ bên kia gửi offer mới

    if (entry.restarts >= MAX_ICE_RESTART) {
      closePeer(userId);
      markConnected(userId, false);
      return;
    }
    entry.restarts += 1;
    armTimer(userId);
    const offer = await entry.peer.createOffer(true);
    sendOffer(callIdRef.current, userId, offer);
  };

  // đếm ngược: chưa nghe được nhau thì thử nối lại
  const armTimer = (userId: string, ms = PEER_CONNECT_TIMEOUT_MS) => {
    const entry = peers.current.get(userId);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => restartPeer(userId), ms);
  };

  const createPeer = (userId: string, initiator: boolean): PeerEntry | null => {
    const stream = localStream.current;
    if (!stream) return null;

    const audio = new Audio();
    audio.autoplay = true;
    audio.muted = speakerOffRef.current;

    const peer = new PeerConnection(iceServers.current, stream, {
      onIce: (c) => sendIceCandidate(callIdRef.current, userId, c),
      onTrack: (s) => {
        audio.srcObject = s;
        audio.play().catch(() => {});
      },
      onState: (state) => {
        const entry = peers.current.get(userId);
        if (!entry) return;
        if (state === 'connected') {
          if (entry.timer) clearTimeout(entry.timer);
          entry.restarts = 0;
          markConnected(userId, true);
        } else if (state === 'disconnected') {
          markConnected(userId, false);
          armTimer(userId, DISCONNECT_GRACE_MS);
        } else if (state === 'failed') {
          markConnected(userId, false);
          restartPeer(userId);
        }
      },
    });

    const entry: PeerEntry = { peer, initiator, restarts: 0, timer: null, audio };
    peers.current.set(userId, entry);
    armTimer(userId);

    const early = earlyCandidates.current.get(userId) ?? [];
    earlyCandidates.current.delete(userId);
    early.forEach((c) => peer.addCandidate(c));
    return entry;
  };

  const upsertParticipant = (userId: string, info?: { name?: string; avatar?: string | null }) =>
    setParticipants((prev) => {
      const idx = prev.findIndex((p) => p.userId === userId);
      if (idx === -1) {
        return [...prev, { userId, name: info?.name ?? '...', avatar: info?.avatar, connected: false }];
      }
      if (!info?.name) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], name: info.name, avatar: info.avatar ?? next[idx].avatar };
      return next;
    });

  // ─── socket ────────────────────────────────────────────────────────────
  const { startGroupCall, joinGroupCall, leaveGroupCall, endGroupCall,
    sendOffer, sendAnswer, sendIceCandidate } = useGroupCallSocket({

    // người khởi tạo cũng cần biết callId để gửi candidate và kết thúc
    onStarted: ({ callId, hostId }) => {
      if (hostId === currentUserId) {
        callIdRef.current = callId;
        return;
      }
      if (!callIdRef.current) {
        callIdRef.current = callId;
        setPhaseSync('waiting');
      }
    },

    // nhóm đã có cuộc gọi, server tự cho mình vào
    onRedirect: ({ callId, hostId }) => {
      callIdRef.current = callId;
      setIsHost(hostId === currentUserId);
      setPhaseSync('active');
      startTimer();
    },

    // có người mới vào: chờ họ gửi offer, không tự gửi để tránh gửi trùng
    onJoined: ({ userId, userInfo }) => {
      if (userId === currentUserId) return;
      upsertParticipant(userId, userInfo);
    },

    onLeft: ({ userId }) => {
      closePeer(userId);
      setParticipants((prev) => prev.filter((p) => p.userId !== userId));
    },

    // mình mới vào: tạo offer gửi cho từng người đang có mặt
    onParticipants: async ({ callId, existingParticipants }) => {
      if (!localStream.current) return;
      callIdRef.current = callId;

      for (const ep of existingParticipants) {
        if (ep.userId === currentUserId) continue;
        upsertParticipant(ep.userId, ep);
        closePeer(ep.userId);
        const entry = createPeer(ep.userId, true);
        if (!entry) continue;
        const offer = await entry.peer.createOffer();
        sendOffer(callId, ep.userId, offer);
      }
    },

    onEnded: () => {
      if (closedRef.current) return;
      toast('Cuộc gọi nhóm đã kết thúc', { icon: '📵' });
      finish(1000);
    },

    onOffer: async ({ callId, fromUserId, sdp }) => {
      if (!localStream.current) return;
      if (!callIdRef.current) callIdRef.current = callId;
      upsertParticipant(fromUserId);

      let entry = peers.current.get(fromUserId);
      if (!entry) {
        entry = createPeer(fromUserId, false) ?? undefined;
      } else if (entry.peer.pc.signalingState === 'have-local-offer') {
        // hai bên cùng gửi offer: bên có id lớn hơn giữ offer của mình
        if (currentUserId > fromUserId) return;
        entry.initiator = false;
      }
      if (!entry) return;

      const answer = await entry.peer.acceptOffer(sdp);
      sendAnswer(callId, fromUserId, answer);
    },

    onAnswer: async ({ fromUserId, sdp }) => {
      await peers.current.get(fromUserId)?.peer.acceptAnswer(sdp);
    },

    onIceCandidate: async ({ fromUserId, candidate }) => {
      const entry = peers.current.get(fromUserId);
      if (entry) {
        await entry.peer.addCandidate(candidate);
        return;
      }
      const list = earlyCandidates.current.get(fromUserId) ?? [];
      list.push(candidate);
      earlyCandidates.current.set(fromUserId, list);
    },
  });

  // ─── khởi tạo ──────────────────────────────────────────────────────────
  // xin micro và ice server trước, xong mới báo server để không lỡ offer đầu tiên
  const prepareMedia = async (): Promise<boolean> => {
    if (localStream.current) return true;
    const [stream, servers] = await Promise.all([getMicStream(), callService.getIceServers()]);
    if (closedRef.current) { stopStream(stream); return false; }
    if (!stream) {
      toast.error('Không truy cập được micro, hãy cấp quyền micro cho trình duyệt');
      return false;
    }
    localStream.current = stream;
    iceServers.current = servers;
    return true;
  };

  useEffect(() => {
    if (!outgoing || startedRef.current) return;
    startedRef.current = true;

    (async () => {
      if (!(await prepareMedia())) {
        finish(0);
        return;
      }
      startGroupCall(conversationId);
      startTimer();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── thao tác ──────────────────────────────────────────────────────────
  const handleJoin = async () => {
    const callId = callIdRef.current;
    if (!callId || !(await prepareMedia())) return;
    joinGroupCall(callId);
    setPhaseSync('active');
    startTimer();
  };

  const handleLeave = () => {
    if (callIdRef.current) leaveGroupCall(callIdRef.current);
    finish(0);
  };

  const handleEnd = () => {
    if (callIdRef.current) endGroupCall(callIdRef.current);
    finish(0);
  };

  const toggleMute = () => {
    localStream.current?.getAudioTracks().forEach((t) => { t.enabled = isMuted; });
    setIsMuted((m) => !m);
  };

  const toggleSpeaker = () => {
    const off = !isSpeakerOff;
    speakerOffRef.current = off;
    peers.current.forEach((e) => { if (e.audio) e.audio.muted = off; });
    setIsSpeakerOff(off);
  };

  // ─── giao diện ─────────────────────────────────────────────────────────
  const total = participants.length + 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm sm:p-4">
      <div className="relative flex h-full w-full flex-col overflow-hidden text-white shadow-2xl sm:h-[620px] sm:max-w-[460px] sm:rounded-3xl">
        <CallBackground />

        {/* tiêu đề */}
        <div className="relative z-10 px-6 pb-3 pt-8 text-center">
          <h2 className="truncate text-xl font-semibold">{conversationName}</h2>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-white/80">
            <Users size={14} />
            {phase === 'waiting' && 'Cuộc gọi nhóm đang diễn ra'}
            {phase === 'active' && `${total} người · ${formatDuration(duration)}`}
            {phase === 'ended' && 'Cuộc gọi đã kết thúc'}
          </p>
        </div>

        {/* danh sách người tham gia */}
        <div className="relative z-10 flex-1 overflow-y-auto px-4 py-4">
          {phase !== 'ended' && (
            <div className="grid grid-cols-3 gap-x-2 gap-y-5">
              <MemberTile name="Bạn" muted={isMuted} connected />
              {participants.map((p) => (
                <MemberTile key={p.userId} name={p.name} avatar={p.avatar} connected={p.connected} />
              ))}
            </div>
          )}
        </div>

        {/* nút điều khiển */}
        <div className="relative z-10 px-6 pb-10 pt-3">
          {phase === 'waiting' && (
            <div className="flex items-start justify-center gap-16">
              <CallButton label="Bỏ qua" onClick={handleLeave} className="bg-red-500 hover:bg-red-600">
                <PhoneOff size={26} />
              </CallButton>
              <CallButton label="Tham gia" onClick={handleJoin} className="animate-bounce bg-green-500 hover:bg-green-600">
                <Phone size={26} />
              </CallButton>
            </div>
          )}

          {phase === 'active' && (
            <div className="flex items-start justify-center gap-5">
              <CallButton
                size="md"
                label={isMuted ? 'Bật mic' : 'Tắt mic'}
                onClick={toggleMute}
                className={isMuted ? 'bg-white text-[#0068ff]' : 'bg-white/20 hover:bg-white/30'}
              >
                {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
              </CallButton>
              <CallButton
                size="md"
                label={isSpeakerOff ? 'Bật loa' : 'Tắt loa'}
                onClick={toggleSpeaker}
                className={isSpeakerOff ? 'bg-white text-[#0068ff]' : 'bg-white/20 hover:bg-white/30'}
              >
                {isSpeakerOff ? <VolumeX size={22} /> : <Volume2 size={22} />}
              </CallButton>
              <CallButton size="md" label="Rời" onClick={handleLeave} className="bg-orange-500 hover:bg-orange-600">
                <PhoneOff size={22} />
              </CallButton>
              {isHost && (
                <CallButton size="md" label="Kết thúc" onClick={handleEnd} className="bg-red-500 hover:bg-red-600">
                  <PhoneOff size={22} />
                </CallButton>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// avatar tròn kèm tên của một thành viên
const MemberTile = React.memo(
  ({ name, avatar, muted, connected }: {
    name: string;
    avatar?: string | null;
    muted?: boolean;
    connected: boolean;
  }) => (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        {avatar ? (
          <img src={avatar} alt={name} className="h-16 w-16 rounded-full border-2 border-white/40 object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/40 bg-white/20 text-xl font-bold">
            {name.charAt(0).toUpperCase()}
          </div>
        )}
        {muted && (
          <span className="absolute -bottom-1 -right-1 rounded-full bg-red-500 p-1">
            <MicOff size={12} />
          </span>
        )}
      </div>
      <span className="max-w-full truncate text-xs">{name}</span>
      {!connected && <span className="-mt-1.5 text-[10px] text-white/70">Đang kết nối...</span>}
    </div>
  ),
);

export default GroupCallModal;
