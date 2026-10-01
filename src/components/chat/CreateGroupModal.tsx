import React, { useEffect, useState } from 'react';
import { Search, Loader2, X, Check } from 'lucide-react';
import Modal from '../ui/Modal';
import Avatar from '../ui/Avatar';
import { friendService } from '../../services/friendService';
import { conversationService } from '../../services/conversationService';
import toast from 'react-hot-toast';

interface CreateGroupModalProps {
  onClose: () => void;
  onSuccess: (newConversationId: string) => void;
}

const CreateGroupModal: React.FC<CreateGroupModalProps> = ({ onClose, onSuccess }) => {
  const [groupName, setGroupName] = useState('');
  const [friends, setFriends] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

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

  const filteredFriends = friends.filter(friend =>
    friend.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleUserSelection = (user: any) => {
    if (selectedUsers.find(u => u._id === user._id)) {
      setSelectedUsers(selectedUsers.filter(u => u._id !== user._id));
    } else {
      setSelectedUsers([...selectedUsers, user]);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedUsers.length === 0) {
      return toast.error('Vui lòng nhập tên nhóm và chọn ít nhất 1 thành viên');
    }

    setIsCreating(true);
    try {
      const userIds = selectedUsers.map(u => u._id);
      const newGroup = await conversationService.createGroupConversation(groupName, userIds);
      toast.success('Tạo nhóm thành công!');
      onSuccess(newGroup._id);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không thể tạo nhóm');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title="Tạo nhóm trò chuyện" maxWidth="max-w-[460px]">
      <div className="p-6">
        {/* group Name Input */}
        <div className="mb-6">
          <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider ml-1 mb-1.5 block">Tên nhóm</label>
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Nhập tên nhóm..."
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all text-sm font-medium"
          />
        </div>

        {/* search Members */}
        <div className="mb-4">
          <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider ml-1 mb-1.5 block">Thêm thành viên</label>
          <div className="relative group">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors">
              <Search size={16} />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm tên thành viên..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 rounded-xl border border-transparent focus:border-blue-500 focus:bg-white outline-none transition-all text-sm"
            />
          </div>
        </div>

        {/* selected Users Badges */}
        {selectedUsers.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
            {selectedUsers.map(user => (
              <div key={user._id} className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg shadow-sm border border-blue-100 text-xs font-bold text-blue-700">
                <Avatar name={user.name} size="xs" />
                {user.name}
                <button onClick={() => toggleUserSelection(user)} className="text-gray-400 hover:text-red-500 ml-1">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* friends List */}
        <div className="max-h-[200px] overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50 mb-6 shadow-inner bg-gray-50/30">
          {isLoading ? (
            <div className="py-8 flex justify-center text-blue-500">
              <Loader2 className="animate-spin" size={20} />
            </div>
          ) : filteredFriends.length > 0 ? (
            filteredFriends.map(user => {
              const isSelected = !!selectedUsers.find(u => u._id === user._id);
              return (
                <div
                  key={user._id}
                  onClick={() => toggleUserSelection(user)}
                  className="flex items-center justify-between p-3 hover:bg-white cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Avatar name={user.name} size="sm" />
                    <div className="font-medium text-sm text-gray-800">{user.name}</div>
                  </div>
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300'}`}>
                    {isSelected && <Check size={14} strokeWidth={3} />}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-6 text-center text-gray-400 text-xs italic">
              {searchQuery ? 'Không tìm thấy kết quả' : 'Bạn chưa có bạn bè'}
            </div>
          )}
        </div>

        {/* action Button */}
        <button
          onClick={handleCreateGroup}
          disabled={isCreating || !groupName.trim() || selectedUsers.length === 0}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold rounded-xl shadow-lg shadow-blue-200 transition-all flex justify-center items-center gap-2"
        >
          {isCreating && <Loader2 className="animate-spin" size={18} />}
          Tạo nhóm ({selectedUsers.length})
        </button>
      </div>
    </Modal>
  );
};

export default CreateGroupModal;
