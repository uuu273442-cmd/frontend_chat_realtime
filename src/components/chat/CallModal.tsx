import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Phone, PhoneOff, PhoneMissed, Video, VideoOff,
  Mic, MicOff, Volume2, VolumeX, Loader2,
} from 'lucide-react';
import { useCallSocket } from '../../hooks/useCallSocket';
import type { CallType } from '../../hooks/useCallSocket';
import { callService } from '../../services/callService';
import toast from 'react-hot-toast';

// Nếu không kết nối được sau chừng này thì coi như thất bại thay vì để màn
// hình "Đang kết nối..." quay mãi. Đây là nguyên nhân của lỗi "gọi giữa hai
// mạng khác nhau cứ quay rồi treo": khi chỉ có STUN mà không có TURN, hai máy
// ở hai mạng khác nhau (ví dụ 2 nhà mạng 4G khác nhau) nhiều khi không thể tự
// kết nối trực tiếp được, và trình duyệt không phải lúc nào cũng tự chuyển
// trạng thái sang "failed" — nó có thể đứng ở "checking" vô thời hạn.
const CONNECT_TIMEOUT_MS = 20_000;

interface IncomingInfo {
  callId: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string | null;
  callType: CallType;
  conversationId: string;
}

interface CallModalProps {
  outgoing?: {
    calleId: string;
    calleeName: string;
    calleeAvatar?: string | null;
    conversationId: string;
    callType: CallType;
  };
  incoming?: IncomingInfo;
  onClose: () => void;
}

type Phase = 'calling' | 'incoming' | 'connecting' | 'connected' | 'ended';

// ─── WebRTC Manager ──────────────────────────────────────────────────────────
// Tách riêng ra ngoài component để tránh stale closure hoàn toàn
class RTCManager {
  private pc: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteDescSet = false;
  private onTrackCb: ((s: MediaStream) => void) | null = null;

  // Danh sách STUN/TURN được nạp từ backend trước khi tạo peer connection —
  // xem setIceServers(). Có một danh sách STUN mặc định phòng khi chưa nạp kịp.
  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  setIceServers(servers: RTCIceServer[]) {
    if (servers.length) this.iceServers = servers;
  }

  async getStream(callType: CallType): Promise<MediaStream | null> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video',
      });
      return this.stream;
    } catch {
      return null;
    }
  }

  createPeer(
    onIce: (c: RTCIceCandidateInit) => void,
    onTrack: (stream: MediaStream) => void,
    onStateChange: (state: RTCPeerConnectionState) => void,
  ): RTCPeerConnection {
    // Cờ debug bật bằng tay trong console trình duyệt:
    //   localStorage.setItem('ice_transport_policy', 'relay')
    // để ép mọi kết nối đi qua TURN (không cho thử kết nối trực tiếp qua
    // STUN nữa) — dùng khi cần xác định chắc chắn lỗi có phải do thiếu TURN
    // hay không. Xoá key này (hoặc set về 'all') để quay lại bình thường.
    let iceTransportPolicy: RTCIceTransportPolicy = 'all';
    try {
      if (window.localStorage.getItem('ice_transport_policy') === 'relay') {
        iceTransportPolicy = 'relay';
      }
    } catch {
      // localStorage có thể bị chặn (chế độ ẩn danh) — bỏ qua, dùng mặc định
    }

    this.pc = new RTCPeerConnection({ iceServers: this.iceServers, iceTransportPolicy });

    this.stream?.getTracks().forEach(t => this.pc!.addTrack(t, this.stream!));

    this.onTrackCb = onTrack;
    this.pc.ontrack = (e) => {
      if (e.streams?.[0]) {
        this.remoteStream = e.streams[0];
        this.onTrackCb?.(e.streams[0]);
      }
    };

    this.pc.onicecandidate = (e) => {
      if (e.candidate) onIce(e.candidate.toJSON());
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc) onStateChange(this.pc.connectionState);
    };

    return this.pc;
  }

  async setRemoteDesc(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    this.remoteDescSet = true;
    // Flush tất cả candidates đã buffer
    for (const c of this.pendingCandidates) {
      await this.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
    }
    this.pendingCandidates = [];
  }

  async addCandidate(c: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) return;
    if (!this.remoteDescSet) {
      // Buffer lại — remote desc chưa sẵn
      this.pendingCandidates.push(c);
      return;
    }
    await this.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
  }

  async createOffer(): Promise<RTCSessionDescriptionInit | null> {
    if (!this.pc) return null;
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit | null> {
    if (!this.pc) return null;
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  getLocalStream(): MediaStream | null { return this.stream; }
  getRemoteStream(): MediaStream | null { return this.remoteStream; }
  // Retry attach remote stream nếu ref chưa sẵn lúc onTrack chạy
  retryRemoteStream(): void {
    if (this.remoteStream && this.onTrackCb) {
      this.onTrackCb(this.remoteStream);
    }
  }

  toggleAudio(muted: boolean) {
    this.stream?.getAudioTracks().forEach(t => { t.enabled = !muted; });
  }

  toggleVideo(off: boolean) {
    this.stream?.getVideoTracks().forEach(t => { t.enabled = !off; });
  }

  destroy() {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.remoteStream = null;
    this.onTrackCb = null;
    this.pc?.close();
    this.pc = null;
    this.pendingCandidates = [];
    this.remoteDescSet = false;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────
const CallModal: React.FC<CallModalProps> = ({ outgoing, incoming, onClose }) => {
  const [phase, setPhase] = useState<Phase>(outgoing ? 'calling' : 'incoming');
  const [callType] = useState<CallType>(outgoing?.callType ?? incoming?.callType ?? 'voice');
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted]     = useState(false);
  const [isCamOff, setIsCamOff]   = useState(false);
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);

  const localVideoRef  = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null); // audio riêng cho voice call
  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);

  // Dùng ref để giữ state không bị stale trong socket callbacks
  const rtc           = useRef(new RTCManager());
  const callIdRef     = useRef('');
  const remoteUserRef = useRef(outgoing?.calleId ?? incoming?.callerId ?? '');
  const phaseRef      = useRef<Phase>(outgoing ? 'calling' : 'incoming');
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tải danh sách STUN/TURN ngay khi modal mở — xong trước khi cần tạo peer
  // connection (lúc bắt máy/nhận offer) nên không làm chậm thời điểm đó.
  useEffect(() => {
    callService.getIceServers().then((servers) => rtc.current.setIceServers(servers));
  }, []);

  const clearConnectTimeout = () => {
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
  };

  // Bắt đầu đếm ngược khi vào trạng thái "connecting" — nếu WebRTC không bao
  // giờ báo "failed" (một số trình duyệt/tình huống mạng không tự báo), hết
  // giờ này thì tự coi là thất bại, dọn dẹp và đóng modal thay vì treo mãi.
  const startConnectTimeout = () => {
    clearConnectTimeout();
    connectTimeoutRef.current = setTimeout(() => {
      if (phaseRef.current !== 'connected') {
        toast.error('Không thể kết nối cuộc gọi — vui lòng thử lại');
        const cid = callIdRef.current;
        if (cid) endCall(cid);
        cleanup();
        setPhaseSync('ended');
        setTimeout(onClose, 1200);
      }
    }, CONNECT_TIMEOUT_MS);
  };

  const setPhaseSync = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  const startTimer = () => {
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
  };

  // Khi phase chuyển sang connected: attach stream vào elements
  // Audio tự play qua remoteVideoRef (autoPlay), video call cần set srcObject
  useEffect(() => {
    if (phase !== 'connected') return;
    // Small delay để đảm bảo video elements đã mount
    const t = setTimeout(() => {
      const rs = rtc.current.getRemoteStream();
      const ls = rtc.current.getLocalStream();
      if (rs) {
        // Video call: dùng video element
        if (callType === 'video' && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = rs;
        }
        // Voice call & video call: audio element riêng để đảm bảo audio play
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = rs;
          remoteAudioRef.current.play().catch(() => {});
        }
      }
      if (ls && callType === 'video' && localVideoRef.current) {
        localVideoRef.current.srcObject = ls;
      }
    }, 150);
    return () => clearTimeout(t);
  }, [phase]);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    clearConnectTimeout();
    rtc.current.destroy();
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const formatDur = (s: number) =>
    `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

  // ─── Socket ─────────────────────────────────────────────────────────────
  const { initiateCall, acceptCall, rejectCall, endCall, cancelCall,
    sendOffer, sendAnswer, sendIceCandidate } = useCallSocket({

    onStarted: ({ callId: cid }) => {
      callIdRef.current = cid;
    },

    onIncoming: () => {}, // handled by ChatPage

    onAccepted: async ({ callId: cid }) => {
      if (phaseRef.current !== 'calling') return;
      callIdRef.current = cid;
      setPhaseSync('connecting');
      startConnectTimeout();

      // Chờ danh sách STUN/TURN nạp xong TRƯỚC khi tạo peer connection.
      // Trước đây danh sách này chỉ được nạp "cho có" lúc mở modal (không
      // chờ), nên nếu mạng chậm hoặc backend đang cold-start, bên gọi có
      // thể tạo peer connection ngay khi callee bắt máy — tức là TRƯỚC khi
      // danh sách TURN kịp tải về — và cuộc gọi rơi vào cảnh chỉ có STUN,
      // dễ thất bại khi 2 máy ở 2 mạng khác nhau. await ở đây đảm bảo luôn
      // dùng đúng danh sách đầy đủ, dù có phải chờ thêm một chút.
      rtc.current.setIceServers(await callService.getIceServers());

      const stream = await rtc.current.getStream(callType);
      if (!stream) {
        toast.error('Không thể truy cập micro/camera');
        // Báo cho phía callee biết cuộc gọi không thể tiếp tục thay vì im
        // lặng bỏ cuộc — nếu không, bên kia sẽ phải tự chờ hết 20 giây
        // connect-timeout mới biết cuộc gọi thất bại.
        endCall(cid);
        cleanup(); setPhaseSync('ended'); setTimeout(onClose, 1200);
        return;
      }
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      rtc.current.createPeer(
        (c) => sendIceCandidate(cid, remoteUserRef.current, c),
        (s) => {
          // Dùng ref trực tiếp, nếu chưa mount thì rtc lưu lại để retry
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = s;
        },
        (state) => {
          if (state === 'connected') {
            clearConnectTimeout();
            setPhaseSync('connected');
            startTimer();
            // Retry attach stream sau khi video element render
            setTimeout(() => {
              rtc.current.retryRemoteStream();
            }, 100);
          }
          if (state === 'failed' || state === 'disconnected') {
            clearConnectTimeout();
            toast.error('Kết nối bị ngắt');
            cleanup(); setPhaseSync('ended'); setTimeout(onClose, 1500);
          }
        },
      );

      const ls = rtc.current.getLocalStream();
      if (ls && localVideoRef.current) localVideoRef.current.srcObject = ls;

      const offer = await rtc.current.createOffer();
      if (offer) sendOffer(cid, remoteUserRef.current, offer);
    },

    onRejected: ({ reasons }) => {
      toast(reasons ? `Bị từ chối: ${reasons}` : 'Cuộc gọi bị từ chối', { icon: '📵' });
      cleanup(); setPhaseSync('ended'); setTimeout(onClose, 1200);
    },

    onEnded: () => {
      cleanup(); setPhaseSync('ended'); setTimeout(onClose, 1200);
    },

    onCancelled: () => {
      toast('Cuộc gọi bị huỷ', { icon: '📵' });
      cleanup(); onClose();
    },

    onBusy: () => {
      toast.error('Người dùng đang bận');
      cleanup(); onClose();
    },

    onOffer: async ({ callId: cid, fromUserId, sdp }) => {
      if (phaseRef.current !== 'incoming' && phaseRef.current !== 'connecting') return;
      callIdRef.current = cid;
      remoteUserRef.current = fromUserId;
      setPhaseSync('connecting');
      startConnectTimeout();

      // Xem chú thích ở onAccepted phía trên — cùng lý do phải chờ (await)
      // danh sách ICE server trước khi tạo peer connection.
      rtc.current.setIceServers(await callService.getIceServers());

      const stream = await rtc.current.getStream(callType);
      if (!stream) {
        toast.error('Không thể truy cập micro/camera');
        endCall(cid);
        cleanup(); setPhaseSync('ended'); setTimeout(onClose, 1200);
        return;
      }
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      rtc.current.createPeer(
        (c) => sendIceCandidate(cid, fromUserId, c),
        (s) => {
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = s;
        },
        (state) => {
          if (state === 'connected') {
            clearConnectTimeout();
            setPhaseSync('connected');
            startTimer();
            setTimeout(() => {
              rtc.current.retryRemoteStream();
            }, 100);
          }
          if (state === 'failed' || state === 'disconnected') {
            clearConnectTimeout();
            toast.error('Kết nối bị ngắt');
            cleanup(); setPhaseSync('ended'); setTimeout(onClose, 1500);
          }
        },
      );

      const ls2 = rtc.current.getLocalStream();
      if (ls2 && localVideoRef.current) localVideoRef.current.srcObject = ls2;

      await rtc.current.setRemoteDesc(sdp);
      const answer = await rtc.current.createAnswer();
      if (answer) sendAnswer(cid, fromUserId, answer);
    },

    onAnswer: async ({ sdp }) => {
      await rtc.current.setRemoteDesc(sdp);
      // connectionState change sẽ handle setPhase('connected')
    },

    onIceCandidate: async ({ candidate }) => {
      await rtc.current.addCandidate(candidate);
    },
  });

  // ─── Mount ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (outgoing) {
      initiateCall(outgoing.calleId, outgoing.conversationId, outgoing.callType);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Actions ─────────────────────────────────────────────────────────────
  const handleAccept = () => {
    const cid = incoming?.callId ?? '';
    if (!cid) return;
    acceptCall(cid);
    callIdRef.current = cid;
    remoteUserRef.current = incoming?.callerId ?? '';
    setPhaseSync('connecting');
  };

  const handleReject = () => {
    const cid = callIdRef.current || incoming?.callId || '';
    if (cid) rejectCall(cid);
    cleanup(); onClose();
  };

  const handleEnd = () => {
    const cid = callIdRef.current;
    if (phaseRef.current === 'calling') { if (cid) cancelCall(cid); }
    else { if (cid) endCall(cid); }
    cleanup(); setPhaseSync('ended'); setTimeout(onClose, 800);
  };

  // ─── Toggles ─────────────────────────────────────────────────────────────
  const toggleMute = () => {
    rtc.current.toggleAudio(!isMuted);
    setIsMuted(m => !m);
  };
  const toggleCam = () => {
    rtc.current.toggleVideo(!isCamOff);
    setIsCamOff(c => !c);
  };
  const toggleSpeaker = () => {
    if (remoteVideoRef.current) remoteVideoRef.current.muted = !isSpeakerOff;
    setIsSpeakerOff(s => !s);
  };

  // ─── Display ─────────────────────────────────────────────────────────────
  const displayName   = outgoing?.calleeName ?? incoming?.callerName ?? 'Người dùng';
  const displayAvatar = outgoing?.calleeAvatar ?? incoming?.callerAvatar;

  const phaseLabel: Record<Phase, string> = {
    calling:    'Đang gọi...',
    incoming:   `Cuộc gọi ${callType === 'video' ? 'video' : 'thoại'} đến`,
    connecting: 'Đang kết nối...',
    connected:  formatDur(duration),
    ended:      'Cuộc gọi kết thúc',
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Hidden audio element — đảm bảo remote audio luôn play */}
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="relative w-full max-w-sm mx-4 rounded-3xl overflow-hidden shadow-2xl bg-gradient-to-b from-gray-900 to-gray-800 text-white">

        {callType === 'video' && phase === 'connected' && (
          <video ref={remoteVideoRef} autoPlay playsInline
            className="absolute inset-0 w-full h-full object-cover opacity-80" />
        )}

        <div className="relative z-10 flex flex-col items-center px-6 pt-12 pb-8 min-h-[420px]">

          {/* Avatar lớn — chỉ hiện khi CHƯA có video để nhìn (gọi thoại, hoặc
              gọi video nhưng chưa kết nối). Khi video đã kết nối, khuôn mặt
              thật đã hiện trên toàn màn hình rồi nên avatar tròn không cần
              nữa — trước đây avatar này vẫn hiện đè lên giữa video, che mất
              một phần khuôn mặt người gọi và góc video nhỏ (PIP). */}
          {!(callType === 'video' && phase === 'connected') && (
            <div className="relative mb-4">
              {displayAvatar ? (
                <img src={displayAvatar} alt={displayName}
                  className="w-24 h-24 rounded-full object-cover border-4 border-white/20 shadow-xl" />
              ) : (
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-3xl font-bold shadow-xl border-4 border-white/20">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              {(phase === 'calling' || phase === 'incoming') && (
                <>
                  <div className="absolute inset-0 rounded-full border-2 border-white/30 animate-ping" />
                  <div className="absolute -inset-3 rounded-full border border-white/15 animate-ping [animation-delay:300ms]" />
                </>
              )}
            </div>
          )}

          {/* Khi video đã kết nối: thay avatar to bằng 1 thanh nhãn nhỏ ở góc
              trên bên trái, không che khuôn mặt trong video */}
          {callType === 'video' && phase === 'connected' ? (
            <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1.5 flex items-center gap-1.5">
              <span className="text-sm font-semibold">{displayName}</span>
              <span className="text-xs text-white/70">{phaseLabel[phase]}</span>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold mb-1">{displayName}</h2>
              <p className="text-sm text-white/60 mb-2 flex items-center gap-1.5">
                {callType === 'video' ? <Video size={14} /> : <Phone size={14} />}
                {phaseLabel[phase]}
                {phase === 'connecting' && <Loader2 size={14} className="animate-spin ml-1" />}
              </p>
            </>
          )}

          {callType === 'video' && phase === 'connected' && (
            <div className="absolute bottom-28 right-4 w-24 h-32 rounded-xl overflow-hidden border-2 border-white/20 shadow-lg bg-black z-20">
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            </div>
          )}

          <div className="flex-1" />

          {/* Controls */}
          {phase === 'incoming' && (
            <div className="flex items-center justify-center gap-12 mt-4">
              <div className="flex flex-col items-center gap-2">
                <button onClick={handleReject}
                  className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg transition-all active:scale-95">
                  <PhoneMissed size={26} />
                </button>
                <span className="text-xs text-white/60">Từ chối</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <button onClick={handleAccept}
                  className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center shadow-lg transition-all active:scale-95 animate-bounce">
                  <Phone size={26} />
                </button>
                <span className="text-xs text-white/60">Chấp nhận</span>
              </div>
            </div>
          )}

          {(phase === 'calling' || phase === 'connecting') && (
            <div className="flex flex-col items-center gap-2 mt-4">
              <button onClick={handleEnd}
                className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg transition-all active:scale-95">
                <PhoneOff size={26} />
              </button>
              <span className="text-xs text-white/60">{phase === 'calling' ? 'Huỷ' : 'Kết thúc'}</span>
            </div>
          )}

          {phase === 'connected' && (
            <div className="mt-6 w-full">
              <div className="flex justify-center gap-4 mb-6">
                <button onClick={toggleMute}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-red-500/80' : 'bg-white/15 hover:bg-white/25'}`}>
                  {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                <button onClick={toggleSpeaker}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isSpeakerOff ? 'bg-red-500/80' : 'bg-white/15 hover:bg-white/25'}`}>
                  {isSpeakerOff ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>
                {callType === 'video' && (
                  <button onClick={toggleCam}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isCamOff ? 'bg-red-500/80' : 'bg-white/15 hover:bg-white/25'}`}>
                    {isCamOff ? <VideoOff size={20} /> : <Video size={20} />}
                  </button>
                )}
              </div>
              <div className="flex justify-center">
                <div className="flex flex-col items-center gap-2">
                  <button onClick={handleEnd}
                    className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg transition-all active:scale-95">
                    <PhoneOff size={26} />
                  </button>
                  <span className="text-xs text-white/60">Kết thúc</span>
                </div>
              </div>
            </div>
          )}

          {phase === 'ended' && (
            <p className="text-center text-white/50 text-sm mt-4">Cuộc gọi kết thúc</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CallModal;