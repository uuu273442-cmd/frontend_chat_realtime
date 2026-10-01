// một kết nối webrtc giữa 2 người, dùng chung cho gọi 1-1 và gọi nhóm

interface PeerHandlers {
  onIce: (candidate: RTCIceCandidateInit) => void;
  onTrack: (stream: MediaStream) => void;
  onState: (state: RTCPeerConnectionState) => void;
}

// để kiểm tra turn: chạy localStorage.setItem('ice_transport_policy', 'relay') rồi tải lại trang
const forceRelay = (): boolean => {
  try {
    return window.localStorage.getItem('ice_transport_policy') === 'relay';
  } catch {
    return false;
  }
};

export class PeerConnection {
  readonly pc: RTCPeerConnection;
  private remoteSet = false;
  private pending: RTCIceCandidateInit[] = [];

  constructor(iceServers: RTCIceServer[], stream: MediaStream, handlers: PeerHandlers) {
    this.pc = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 2,
      iceTransportPolicy: forceRelay() ? 'relay' : 'all',
    });

    stream.getTracks().forEach((track) => this.pc.addTrack(track, stream));

    this.pc.onicecandidate = (e) => {
      if (e.candidate) handlers.onIce(e.candidate.toJSON());
    };

    this.pc.ontrack = (e) => {
      handlers.onTrack(e.streams[0] ?? new MediaStream([e.track]));
    };

    this.pc.onconnectionstatechange = () => handlers.onState(this.pc.connectionState);
  }

  // bên gọi tạo offer (iceRestart = true để thử lại đường truyền khi mạng chập chờn)
  async createOffer(iceRestart = false): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer({ iceRestart });
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  // bên nhận nhận offer và trả lời bằng answer
  async acceptOffer(sdp: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    await this.pc.setRemoteDescription(sdp);
    await this.flushPending();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async acceptAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    // bỏ qua answer thừa khi không còn chờ answer
    if (this.pc.signalingState !== 'have-local-offer') return;
    await this.pc.setRemoteDescription(sdp);
    await this.flushPending();
  }

  // candidate đến sớm hơn remote description thì giữ lại, thêm vào sau
  async addCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.remoteSet && !this.pc.remoteDescription) {
      this.pending.push(candidate);
      return;
    }
    await this.pc.addIceCandidate(candidate).catch(() => {});
  }

  private async flushPending(): Promise<void> {
    this.remoteSet = true;
    const list = this.pending;
    this.pending = [];
    for (const c of list) {
      await this.pc.addIceCandidate(c).catch(() => {});
    }
  }

  get state(): RTCPeerConnectionState {
    return this.pc.connectionState;
  }

  close(): void {
    this.pc.onicecandidate = null;
    this.pc.ontrack = null;
    this.pc.onconnectionstatechange = null;
    this.pc.close();
  }
}

// xin quyền micro (chỉ âm thanh)
export const getMicStream = async (): Promise<MediaStream | null> => {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    return null;
  }
};

export const stopStream = (stream: MediaStream | null): void => {
  stream?.getTracks().forEach((t) => t.stop());
};

export const formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};
