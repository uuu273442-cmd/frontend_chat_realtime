import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

export interface UserPresence {
  status: 'online' | 'away' | 'busy' | 'offline';
  customStatusMessage?: string | null;
  lastSeen?: string | null;
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  joinConversation: (conversationId: string) => void;
  leaveConversation: (conversationId: string) => void;
  emitTypingStart: (conversationId: string) => void;
  emitTypingStop: (conversationId: string) => void;
  // Presence real-time — cập nhật ngay khi bất kỳ user nào đổi trạng thái
  presenceMap: Record<string, UserPresence>;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  joinConversation: () => {},
  leaveConversation: () => {},
  emitTypingStart: () => {},
  emitTypingStop: () => {},
  presenceMap: {},
});

export const useSocket = () => useContext(SocketContext);

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [presenceMap, setPresenceMap] = useState<Record<string, UserPresence>>({});

  useEffect(() => {
    // Only connect if user is logged in
    if (!user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    const token = localStorage.getItem('accessToken');
    const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3000';

    // Cho phép bắt đầu bằng polling rồi nâng cấp lên websocket (mặc định của
    // Engine.IO), thay vì ép chỉ dùng websocket. Backend chạy trên Render free
    // tier có thể "ngủ" và mất 30-60 giây để khởi động lại (cold start) — khi
    // ép chỉ dùng websocket, lần kết nối đầu tiên trong lúc server đang khởi
    // động rất dễ bị đóng giữa chừng (cảnh báo vàng trong devtools), nhưng
    // polling vẫn hoạt động bình thường trong lúc chờ rồi mới nâng cấp lên
    // websocket. reconnection với thời gian chờ tăng dần giúp tự kết nối lại
    // mà không cần người dùng phải tự tải lại trang.
    const newSocket = io(SOCKET_URL, {
      auth: { token },
      withCredentials: true,
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    // Không throw ra ngoài, chỉ cập nhật trạng thái — UI dựa vào isConnected
    // để hiện chỉ báo "đang kết nối lại" thay vì im lặng treo.
    newSocket.on('connect_error', () => {
      setIsConnected(false);
    });

    // Lắng nghe presence real-time — BE broadcast toàn cục mỗi khi 1 user đổi
    // trạng thái (online/away/busy/offline) hoặc custom status message
    newSocket.on('user_status_changed', (payload: {
      userId: string;
      status: UserPresence['status'];
      customStatusMessage?: string | null;
      lastSeen?: string | null;
    }) => {
      setPresenceMap((prev) => ({
        ...prev,
        [payload.userId]: {
          status: payload.status,
          customStatusMessage: payload.customStatusMessage ?? null,
          lastSeen: payload.lastSeen ?? null,
        },
      }));
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [user]);

  // Expose easy methods for components
  const joinConversation = (conversationId: string) => {
    if (socket && isConnected) {
      socket.emit('join_conversation', { conversationId });
    }
  };

  const leaveConversation = (conversationId: string) => {
    if (socket && isConnected) {
      socket.emit('leave_conversation', { conversationId });
    }
  };

  const emitTypingStart = (conversationId: string) => {
    if (socket && isConnected) {
      socket.emit('typing_start', { conversationId });
    }
  };

  const emitTypingStop = (conversationId: string) => {
    if (socket && isConnected) {
      socket.emit('typing_stop', { conversationId });
    }
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        joinConversation,
        leaveConversation,
        emitTypingStart,
        emitTypingStop,
        presenceMap,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};