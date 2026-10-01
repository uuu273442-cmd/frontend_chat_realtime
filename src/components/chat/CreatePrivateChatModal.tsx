import React, { useState, useEffect } from 'react';
import { Search, Loader2, MessageSquare } from 'lucide-react';
import Modal from '../ui/Modal';
import Avatar from '../ui/Avatar';
import { friendService } from '../../services/friendService';
import { conversationService } from '../../services/conversationService';
import toast from 'react-hot-toast';

interface CreatePrivateChatModalProps {
  onClose: () => void;
  onSuccess: (newConversationId: string) => void;
}

const CreatePrivateChatModal: React.FC<CreatePrivateChatModalProps> = ({ onClose, onSuccess }) => {
  const [friends, setFriends] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState<string | null>(null);

  useEffect(() => {
    const loadFriends = async () => {
      try {
        const data = await friendService.getFriends();
        setFriends(data);
      } catch (error) {
        toast.error('Không thể tải danh sách bạn bè');
      } finally {
        setIsLoading(false);
      }
    };
    loadFriends();
  }, []);

  const handleCreateChat = async (userId: string) => {
    setIsCreating(userId);
    try {
      const newConv = await conversationService.createPrivateConversation(userId);
      toast.success('Đã tạo trò chuyện');
      onSuccess(newConv._id);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không thể tạo trò chuyện');
    } finally {
      setIsCreating(null);
    }
  };

  const filteredFriends = friends.filter(friend => 
    friend.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Modal isOpen={true} onClose={onClose} title="Tạo trò chuyện mới" maxWidth="max-w-[400px]">
      <div className="p-6">
        {/* search Input */}
        <div className="mb-4">
          <div className="relative group">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors">
              <Search size={16} />
            </div>
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm bạn bè..." 
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 rounded-xl border border-transparent focus:border-blue-500 focus:bg-white outline-none transition-all text-sm"
            />
          </div>
        </div>

        {/* friends List */}
        <div className="max-h-[300px] overflow-y-auto divide-y divide-gray-50 pr-2">
          {isLoading ? (
            <div className="py-10 flex justify-center text-blue-500">
              <Loader2 className="animate-spin" size={24} />
            </div>
          ) : filteredFriends.length > 0 ? (
            filteredFriends.map(friend => (
              <div key={friend._id} className="flex items-center justify-between p-3 hover:bg-blue-50/50 rounded-xl transition-colors group">
                <div className="flex items-center gap-3">
                  <Avatar name={friend.name} size="md" />
                  <div className="font-bold text-sm text-gray-800">{friend.name}</div>
                </div>
                <button 
                  onClick={() => handleCreateChat(friend._id)}
                  disabled={isCreating !== null}
                  className="w-8 h-8 rounded-full bg-white border border-gray-200 text-gray-500 flex items-center justify-center hover:bg-blue-500 hover:text-white hover:border-blue-500 transition-all shadow-sm group-hover:scale-105 disabled:opacity-50"
                >
                  {isCreating === friend._id ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : (
                    <MessageSquare size={14} />
                  )}
                </button>
              </div>
            ))
          ) : (
            <div className="py-8 text-center text-gray-400 text-xs italic">
              {searchQuery ? 'Không tìm thấy bạn bè nào' : 'Bạn chưa có bạn bè'}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default CreatePrivateChatModal;
