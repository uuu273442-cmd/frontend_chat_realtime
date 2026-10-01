import api from './authService';

// STUN mặc định
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

let cachedIceServers: RTCIceServer[] | null = null;

export const callService = {
  // lấy danh sách STUN/TURN từ backend. Kết quả được lưu lại trong bộ nhớ
  async getIceServers(): Promise<RTCIceServer[]> {
    if (cachedIceServers) return cachedIceServers;
    try {
      const response = await api.get('/calls/ice-servers');
      const servers = response.data?.iceServers;
      if (Array.isArray(servers) && servers.length > 0) {
        cachedIceServers = servers;
        return servers;
      }
    } catch {
      // bỏ qua
    }
    return FALLBACK_ICE_SERVERS;
  },
};
