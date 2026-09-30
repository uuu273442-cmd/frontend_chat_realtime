import api from './authService';

// STUN mặc định — dùng khi chưa gọi được API hoặc API lỗi, để cuộc gọi trong
// cùng mạng (không cần TURN) vẫn hoạt động ngay cả khi backend đang gặp sự cố.
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

let cachedIceServers: RTCIceServer[] | null = null;

export const callService = {
  // Lấy danh sách STUN/TURN từ backend. Kết quả được lưu lại trong bộ nhớ
  // của tab hiện tại (không phải localStorage) vì danh sách này không đổi
  // trong một phiên làm việc — tránh gọi API lại mỗi lần bấm gọi.
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
      // Bỏ qua — dùng STUN mặc định bên dưới
    }
    return FALLBACK_ICE_SERVERS;
  },
};
