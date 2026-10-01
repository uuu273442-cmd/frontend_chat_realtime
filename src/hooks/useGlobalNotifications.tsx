import { useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export const useGlobalNotifications = (
  activeChatId: string | null, 
  onSelectChat?: (id: string) => void,
  onMention?: (id: string) => void
) => {
  const { socket } = useSocket();
  const { user } = useAuth();

  useEffect(() => {
    if (!socket || !user) return;

    const handleNewMessage = (data: any) => {
      const payload = data?.payload;
      if (!payload) return;
      const msg = payload.message || payload;
      const conversationId = msg.conversationId?.toString() || msg.conversationId;
      const senderId = (msg.senderId?._id || msg.senderId)?.toString();

      // only show notification if
      if (senderId !== user.sub && conversationId !== activeChatId) {
        const senderName = msg.senderId?.name || 'Ai đó';
        const content = msg.type === 'text' ? msg.content : `Đã gửi một ${msg.type}`;
        
        toast((t) => (
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="font-bold text-sm">{senderName}</span>
              <span className="text-xs text-gray-500 truncate max-w-[200px]">{content}</span>
            </div>
            <button 
              onClick={() => {
                toast.dismiss(t.id);
                if (onSelectChat) onSelectChat(conversationId);
              }}
              className="ml-auto text-blue-500 text-xs font-bold hover:underline"
            >
              Xem
            </button>
          </div>
        ), {
          duration: 4000,
          position: 'top-right',
        });
      }
    };

    const handleMention = (payload: any) => {
      const msg = payload.message || payload;
      const conversationId = msg.conversationId?.toString() || msg.conversationId;
      
      // notify listeners about the mention
      if (onMention) onMention(conversationId);

      // if we are already in this chat, we might not want a toast
      if (conversationId !== activeChatId) {
        const senderName = msg.senderId?.name || 'Ai đó';
        toast((t) => (
          <div className="flex items-center gap-3 border-l-4 border-yellow-400 pl-2">
            <div className="flex flex-col">
              <span className="font-bold text-sm text-yellow-700">@ Bạn được nhắc tên bởi {senderName}</span>
              <span className="text-xs text-gray-500 truncate max-w-[200px]">{msg.content}</span>
            </div>
            <button 
              onClick={() => {
                toast.dismiss(t.id);
                if (onSelectChat) onSelectChat(conversationId);
              }}
              className="ml-auto bg-yellow-500 text-white px-2 py-1 rounded text-[10px] font-bold hover:bg-yellow-600 transition-colors"
            >
              Xem
            </button>
          </div>
        ), {
          duration: 6000,
          position: 'top-right',
        });
      }
    };

    socket.on('conversation_updated', handleNewMessage);
    socket.on('mention_received', handleMention);

    return () => {
      socket.off('conversation_updated', handleNewMessage);
      socket.off('mention_received', handleMention);
    };
  }, [socket, user, activeChatId]);
};
