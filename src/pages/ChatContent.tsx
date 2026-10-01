import React from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import ChatArea from "../components/chat/ChatArea";
import ConversationPanel from "../components/chat/ConversationPanel";

const ChatContent: React.FC = () => {
    const {
        activeChat,
        activeChatInfo,
        isPanelOpen,
        setIsPanelOpen,
        currentUserId,
        fetchConversations,
        pendingGroupRequests = {},
        reloadPendingTrigger = 0,
        startCall,
        startGroupCall,
        clearPendingGroupRequests,
    } = useOutletContext<any>();
    const navigate = useNavigate();

    // lấy thông tin người nhận từ hội thoại (chỉ chat riêng)
    const handleStartCall = () => {
        if (!activeChatInfo || !activeChat || !startCall) return;
        const isPrivate = activeChatInfo.type === 'private';
        if (!isPrivate) return;

        const otherParticipant = activeChatInfo.participants?.find(
            (p: any) => p.userId?._id !== currentUserId
        );
        if (!otherParticipant) return;

        startCall({
            calleId: otherParticipant.userId._id,
            calleeName: otherParticipant.userId.name,
            calleeAvatar: otherParticipant.userId.avatar ?? null,
            conversationId: activeChat,
        });
    };

    const handleStartGroupCall = () => {
        if (!activeChatInfo || !activeChat || !startGroupCall) return;
        startGroupCall({
            conversationId: activeChat,
            conversationName: activeChatInfo.name ?? 'Cuộc gọi nhóm',
        });
    };

    return (
        <div className="flex-1 flex h-full overflow-hidden">
            <div className="flex-1 flex flex-col min-w-0">
                <ChatArea
                    activeChat={activeChat}
                    onClose={() => {
                        navigate("/chat");
                        setIsPanelOpen(false);
                    }}
                    onOpenInfo={() => {
                        if (activeChatInfo) setIsPanelOpen((p: boolean) => !p);
                    }}
                    onStartCall={handleStartCall}
                    onStartGroupCall={handleStartGroupCall}
                    isPrivateChat={activeChatInfo?.type === 'private'}
                    isGroupChat={activeChatInfo?.type === 'group'}
                />
            </div>
            {isPanelOpen && activeChatInfo && activeChat && (
                <ConversationPanel
                    conversationId={activeChat}
                    conversationInfo={activeChatInfo}
                    currentUserId={currentUserId}
                    onClose={() => setIsPanelOpen(false)}
                    onConversationAction={() => {
                        setIsPanelOpen(false);
                        navigate("/chat");
                        fetchConversations();
                    }}
                    onRefresh={fetchConversations}
                    pendingMemberRequests={pendingGroupRequests[activeChat] || 0}
                    reloadPendingTrigger={reloadPendingTrigger}
                    onMembersTabOpen={() => clearPendingGroupRequests?.(activeChat)}
                />
            )}
        </div>
    );
};

export default ChatContent;