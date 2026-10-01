import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import toast from 'react-hot-toast';
import { useCallSocket } from '../../hooks/useCallSocket';
import { callService } from '../../services/callService';
import { PeerConnection, getMicStream, stopStream, formatDuration } from '../../utils/webrtc';
import { CallBackground, CallButton } from './CallParts';

// quá thời gian này mà chưa nghe được nhau thì báo lỗi
const CONNECT_TIMEOUT_MS = 30_000;
// mạng chập chờn: chờ chừng này rồi mới thử nối lại
const DISCONNECT_GRACE_MS = 4_000;
// số lần thử nối lại đường truyền (ice restart)
const MAX_ICE_RESTART = 2;

type Phase = 'calling' | 'incoming' | 'connecting' | 'connected' | 'ended';

interface CallModalProps {
  outgoing?: {
    calleId: string;
    calleeName: string;
    calleeAvatar?: string | null;
    conversationId: string;
  };
  incoming?: {
    callId: string;
    callerId: string;
    callerName: string;
    callerAvatar?: string | null;
    conversationId: string;
  };
  onClose: () => void;
}

const CallModal: React.FC<CallModalProps> = ({ outgoing, incoming, onClose }) => {
  const isCaller = !!outgoing;

  const [phase, setPhase] = useState<Phase>(isCaller ? 'calling' : 'incoming');
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);

  // dùng ref để callback socket luôn đọc được giá trị mới nhất
  const phaseRef = useRef<Phase>(isCaller ? 'calling' : 'incoming');
  const callIdRef = useRef(incoming?.callId ?? '');
  const remoteUserRef = useRef(outgoing?.calleId ?? incoming?.callerId ?? '');
  const peerRef = useRef<PeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const speakerOffRef = useRef(false);
  const earlyCandidates = useRef<RTCIceCandidateInit[]>([]);
  const pendingOffer = useRef<RTCSessionDescriptionInit | null>(null);
  const restartCount = useRef(0);
  const cancelRequested = useRef(false);
  const closedRef = useRef(false);
  const startedRef = useRef(false);
  const mountedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const durationTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { onCloseRef.current = onClose; });

  const setPhaseSync = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  // bỏ qua sự kiện của cuộc gọi khác
  const isCurrent = (id?: string) => !id || !callIdRef.current || id === callIdRef.current;

  // ─── dọn dẹp ───────────────────────────────────────────────────────────
  const clearTimers = () => {
    if (durationTimer.current) clearInterval(durationTimer.current);
    if (connectTimer.current) clearTimeout(connectTimer.current);
    if (disconnectTimer.current) clearTimeout(disconnectTimer.current);
    durationTimer.current = connectTimer.current = disconnectTimer.current = null;
  };

  const teardown = useCallback(() => {
    clearTimers();
    peerRef.current?.close();
    peerRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
    }
  }, []);

  // dọn dẹp rồi đóng modal sau một lúc
  const finish = (delay = 1000) => {
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

  // ─── hẹn giờ ───────────────────────────────────────────────────────────
  const startConnectTimeout = () => {
    if (connectTimer.current) clearTimeout(connectTimer.current);
    connectTimer.current = setTimeout(() => {
      if (phaseRef.current === 'connected') return;
      toast.error('Không thể kết nối cuộc gọi, vui lòng thử lại');
      if (callIdRef.current) endCall(callIdRef.current);
      finish();
    }, CONNECT_TIMEOUT_MS);
  };

  const startDurationTimer = () => {
    if (durationTimer.current) return;
    durationTimer.current = setInterval(() => setDuration((d) => d + 1), 1000);
  };

  // ─── kết nối webrtc ────────────────────────────────────────────────────
  const attachRemote = (stream: MediaStream) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.srcObject = stream;
    audio.muted = speakerOffRef.current;
    audio.play().catch(() => {});
  };

  // bên gọi chủ động thử nối lại đường truyền, bên nghe chờ offer mới
  const tryRestart = async () => {
    if (closedRef.current || !isCaller) return;
    const cid = callIdRef.current;
    const peer = peerRef.current;
    if (!cid || !peer) return;

    if (restartCount.current >= MAX_ICE_RESTART) {
      toast.error('Mất kết nối cuộc gọi');
      endCall(cid);
      finish();
      return;
    }
    restartCount.current += 1;
    const offer = await peer.createOffer(true);
    sendOffer(cid, remoteUserRef.current, offer);
  };

  const handleState = (state: RTCPeerConnectionState) => {
    if (closedRef.current) return;

    if (state === 'connected') {
      if (disconnectTimer.current) clearTimeout(disconnectTimer.current);
      if (connectTimer.current) clearTimeout(connectTimer.current);
      restartCount.current = 0;
      setPhaseSync('connected');
      startDurationTimer();
      audioRef.current?.play().catch(() => {});
      return;
    }

    if (state === 'disconnected') {
      if (disconnectTimer.current) clearTimeout(disconnectTimer.current);
      disconnectTimer.current = setTimeout(() => { tryRestart(); }, DISCONNECT_GRACE_MS);
      return;
    }

    if (state === 'failed') {
      if (disconnectTimer.current) clearTimeout(disconnectTimer.current);
      tryRestart();
    }
  };

  const createPeer = (callId: string, targetId: string, iceServers: RTCIceServer[]) => {
    const stream = streamRef.current;
    if (!stream) return null;

    const peer = new PeerConnection(iceServers, stream, {
      onIce: (c) => sendIceCandidate(callId, targetId, c),
      onTrack: attachRemote,
      onState: handleState,
    });
    peerRef.current = peer;

    // candidate đến sớm hơn peer thì thêm vào bây giờ
    const early = earlyCandidates.current;
    earlyCandidates.current = [];
    early.forEach((c) => peer.addCandidate(c));
    return peer;
  };

  const answerOffer = async (callId: string, fromUserId: string, sdp: RTCSessionDescriptionInit) => {
    const peer = peerRef.current;
    if (!peer) {
      pendingOffer.current = sdp;
      return;
    }
    const answer = await peer.acceptOffer(sdp);
    sendAnswer(callId, fromUserId, answer);
  };

  // ─── socket ────────────────────────────────────────────────────────────
  const { initiateCall, acceptCall, rejectCall, endCall, cancelCall,
    sendOffer, sendAnswer, sendIceCandidate } = useCallSocket({

    onStarted: ({ callId }) => {
      callIdRef.current = callId;
      // người gọi đã bấm huỷ trước khi có callId
      if (cancelRequested.current) {
        cancelCall(callId);
        finish(0);
      }
    },

    onIncoming: () => {}, // chatpage xử lý

    // bên gọi: người nhận đã bắt máy, tạo offer
    onAccepted: async ({ callId }) => {
      if (phaseRef.current !== 'calling' || !isCurrent(callId)) return;
      callIdRef.current = callId;
      setPhaseSync('connecting');
      startConnectTimeout();

      const iceServers = await callService.getIceServers();
      const peer = createPeer(callId, remoteUserRef.current, iceServers);
      if (!peer) return;
      const offer = await peer.createOffer();
      sendOffer(callId, remoteUserRef.current, offer);
    },

    onRejected: ({ callId, reasons }) => {
      if (!isCurrent(callId)) return;
      toast(reasons ? `Cuộc gọi bị từ chối: ${reasons}` : 'Cuộc gọi bị từ chối', { icon: '📵' });
      finish();
    },

    onEnded: ({ callId }) => {
      if (!isCurrent(callId)) return;
      finish();
    },

    onCancelled: ({ callId }) => {
      if (!isCurrent(callId)) return;
      finish(0);
    },

    onBusy: () => {
      toast.error('Người dùng đang bận');
      finish(0);
    },

    // bên nghe: nhận offer rồi trả answer (cũng dùng khi bên gọi thử nối lại)
    onOffer: async ({ callId, fromUserId, sdp }) => {
      if (!isCurrent(callId)) return;
      callIdRef.current = callId;
      remoteUserRef.current = fromUserId;
      await answerOffer(callId, fromUserId, sdp);
    },

    onAnswer: async ({ callId, sdp }) => {
      if (!isCurrent(callId)) return;
      await peerRef.current?.acceptAnswer(sdp);
    },

    onIceCandidate: async ({ callId, candidate }) => {
      if (!isCurrent(callId)) return;
      if (peerRef.current) await peerRef.current.addCandidate(candidate);
      else earlyCandidates.current.push(candidate);
    },
  });

  // ─── bên gọi: xin micro rồi mới gọi ────────────────────────────────────
  useEffect(() => {
    if (!outgoing || startedRef.current) return;
    startedRef.current = true;

    (async () => {
      const [stream] = await Promise.all([getMicStream(), callService.getIceServers()]);
      if (closedRef.current) { stopStream(stream); return; }
      if (!stream) {
        toast.error('Không truy cập được micro, hãy cấp quyền micro cho trình duyệt');
        finish(0);
        return;
      }
      streamRef.current = stream;
      initiateCall(outgoing.calleId, outgoing.conversationId);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // bên nhận: tải sẵn ice server trong lúc đổ chuông
  useEffect(() => {
    if (!isCaller) callService.getIceServers();
  }, [isCaller]);

  // ─── thao tác ──────────────────────────────────────────────────────────
  // bên nhận: chuẩn bị xong micro và peer rồi mới báo đã bắt máy
  // để không bỏ lỡ offer và candidate đầu tiên của bên gọi
  const handleAccept = async () => {
    if (!incoming || phaseRef.current !== 'incoming') return;
    const cid = incoming.callId;
    setPhaseSync('connecting');

    const [iceServers, stream] = await Promise.all([callService.getIceServers(), getMicStream()]);
    if (closedRef.current) { stopStream(stream); return; }
    if (!stream) {
      toast.error('Không truy cập được micro, hãy cấp quyền micro cho trình duyệt');
      rejectCall(cid, 'Không có micro');
      finish(0);
      return;
    }

    streamRef.current = stream;
    createPeer(cid, incoming.callerId, iceServers);
    startConnectTimeout();
    acceptCall(cid);

    if (pendingOffer.current) {
      const sdp = pendingOffer.current;
      pendingOffer.current = null;
      await answerOffer(cid, incoming.callerId, sdp);
    }
  };

  const handleReject = () => {
    if (incoming) rejectCall(incoming.callId);
    finish(0);
  };

  const handleEnd = () => {
    const cid = callIdRef.current;
    if (phaseRef.current === 'calling') {
      if (cid) {
        cancelCall(cid);
      } else {
        // chưa có callId, chờ server trả về rồi huỷ
        cancelRequested.current = true;
        setTimeout(() => finish(0), 3000);
        return;
      }
    } else if (cid) {
      endCall(cid);
    }
    finish(300);
  };

  const toggleMute = () => {
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = isMuted; });
    setIsMuted((m) => !m);
  };

  const toggleSpeaker = () => {
    const off = !isSpeakerOff;
    speakerOffRef.current = off;
    if (audioRef.current) audioRef.current.muted = off;
    setIsSpeakerOff(off);
  };

  // ─── giao diện ─────────────────────────────────────────────────────────
  const name = outgoing?.calleeName ?? incoming?.callerName ?? 'Người dùng';
  const avatar = outgoing?.calleeAvatar ?? incoming?.callerAvatar ?? null;

  const statusText: Record<Phase, string> = {
    calling: 'Đang gọi...',
    incoming: 'Cuộc gọi thoại đến',
    connecting: 'Đang kết nối...',
    connected: formatDuration(duration),
    ended: 'Cuộc gọi đã kết thúc',
  };

  const ringing = phase === 'calling' || phase === 'incoming';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm sm:p-4">
      <audio ref={audioRef} autoPlay playsInline className="hidden" />

      <div className="relative flex h-full w-full flex-col overflow-hidden text-white shadow-2xl sm:h-[620px] sm:max-w-[380px] sm:rounded-3xl">
        <CallBackground avatar={avatar} />

        <p className="relative z-10 pt-8 text-center text-sm font-medium text-white/80">
          Cuộc gọi thoại
        </p>

        {/* avatar, tên, trạng thái */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6">
          <div className="relative mb-6">
            {ringing && (
              <>
                <span className="absolute inset-0 animate-ping rounded-full bg-white/25" />
                <span className="absolute -inset-4 animate-pulse rounded-full bg-white/10" />
              </>
            )}
            {avatar ? (
              <img
                src={avatar}
                alt={name}
                className="relative h-32 w-32 rounded-full border-4 border-white/40 object-cover shadow-xl"
              />
            ) : (
              <div className="relative flex h-32 w-32 items-center justify-center rounded-full border-4 border-white/40 bg-white/20 text-5xl font-bold shadow-xl">
                {name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <h2 className="max-w-full truncate text-2xl font-semibold">{name}</h2>
          <p className="mt-2 text-base text-white/80">{statusText[phase]}</p>
        </div>

        {/* nút điều khiển */}
        <div className="relative z-10 px-6 pb-10 pt-4">
          {phase === 'incoming' && (
            <div className="flex items-start justify-center gap-16">
              <CallButton label="Từ chối" onClick={handleReject} className="bg-red-500 hover:bg-red-600">
                <PhoneOff size={26} />
              </CallButton>
              <CallButton label="Trả lời" onClick={handleAccept} className="animate-bounce bg-green-500 hover:bg-green-600">
                <Phone size={26} />
              </CallButton>
            </div>
          )}

          {phase === 'calling' && (
            <div className="flex justify-center">
              <CallButton label="Huỷ" onClick={handleEnd} className="bg-red-500 hover:bg-red-600">
                <PhoneOff size={26} />
              </CallButton>
            </div>
          )}

          {(phase === 'connecting' || phase === 'connected') && (
            <div className="flex items-start justify-center gap-6">
              <CallButton
                label={isMuted ? 'Bật mic' : 'Tắt mic'}
                onClick={toggleMute}
                className={isMuted ? 'bg-white text-[#0068ff]' : 'bg-white/20 hover:bg-white/30'}
              >
                {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
              </CallButton>
              <CallButton
                label={isSpeakerOff ? 'Bật loa' : 'Tắt loa'}
                onClick={toggleSpeaker}
                className={isSpeakerOff ? 'bg-white text-[#0068ff]' : 'bg-white/20 hover:bg-white/30'}
              >
                {isSpeakerOff ? <VolumeX size={24} /> : <Volume2 size={24} />}
              </CallButton>
              <CallButton label="Kết thúc" onClick={handleEnd} className="bg-red-500 hover:bg-red-600">
                <PhoneOff size={24} />
              </CallButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CallModal;
