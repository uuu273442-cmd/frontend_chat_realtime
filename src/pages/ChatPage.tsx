import React, { useState, useEffect, Suspense, lazy } from "react";
import { useParams, useLocation, useNavigate, Outlet } from "react-router-dom";
import { conversationService } from "../services/conversationService";
import { userService } from "../services/userService";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import SettingsModal from "../components/chat/SettingsModal";
import SidebarPrimary from "../components/chat/SidebarPrimary";
import { useGroupCallSocket } from "../hooks/useGroupCallSocket";
import { useCallSocket } from "../hooks/useCallSocket";
import SidebarSecondary from "../components/chat/SidebarSecondary";
import CreateGroupModal from "../components/chat/CreateGroupModal";
import CreatePrivateChatModal from "../components/chat/CreatePrivateChatModal";
import { ChatLayout } from "../layouts/ChatLayout";
import { useConversationSocket } from "../hooks/useConversationSocket";
import { useFriendSocket } from "../hooks/useFriendSocket";
import { useGlobalNotifications } from "../hooks/useGlobalNotifications";
import { useSocket } from "../context/SocketContext";
import { friendService } from "../services/friendService";

// tải CallModal/GroupCallModal theo yêu cầu (lazy) thay vì gộp luôn vào bundle
const CallModal = lazy(() => import("../components/chat/CallModal"));
const GroupCallModal = lazy(() => import("../components/chat/GroupCallModal"));

const ChatPage: React.FC = () => {
    const { logout, user } = useAuth();
    const { joinConversation } = useSocket();

    const { chatId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();

    const [conversations, setConversations] = useState<any[]>([]);

    const currentView = location.pathname.startsWith("/friends")
        ? "contacts"
        : "chats";
    const activeChat = chatId || null;
    // trên mobile, /friends cũng là trang chi tiết (ẩn danh sách bên trái)
    const showDetail = !!activeChat || location.pathname.startsWith("/friends");

    const [prevActiveChat, setPrevActiveChat] = useState<string | null>(null);
    const [unreadMentions, setUnreadMentions] = useState<Set<string>>(new Set());
    const [pendingFriendCount, setPendingFriendCount] = useState(0);
    // trạng thái cuộc gọi
    const [groupCallModal, setGroupCallModal] = useState<{
        conversationId: string;
        conversationName: string;
        incoming?: { callId: string; hostId: string };
        outgoing?: boolean;
    } | null>(null);

    const [callModal, setCallModal] = useState<{
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
    } | null>(null);

    // map conversationId -> số pending join requests chưa xem
    const [pendingGroupRequests, setPendingGroupRequests] = useState<Record<string, number>>({});
    // trigger reload ConversationPanel pending list khi socket fire
    const [reloadPendingTrigger, setReloadPendingTrigger] = useState(0);

    useGlobalNotifications(
        activeChat,
        (id) => {
            navigate("/chat/" + id);
        },
        (id) => {
            setUnreadMentions((prev) => new Set(prev).add(id));
        },
    );

    const [activeChatInfo, setActiveChatInfo] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
    const [isCreatePrivateOpen, setIsCreatePrivateOpen] = useState(false);
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    // avatar của chính mình
    const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);

    // fetch pending friend requests count on mount
    useEffect(() => {
        friendService.getFriendRequests()
            .then((data) => setPendingFriendCount(data?.length ?? 0))
            .catch(() => {});
    }, []);

    // fetch avatar của chính mình lúc mount
    const fetchMyAvatar = () => {
        if (!user?.sub) return;
        userService
            .getCurrentProfile(user.sub)
            .then((data) => setMyAvatarUrl(data?.avatar || null))
            .catch(() => {});
    };

    useEffect(() => {
        fetchMyAvatar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.sub]);

    // reset badge khi user vào tab contacts
    useEffect(() => {
        if (currentView === "contacts") {
            setPendingFriendCount(0);
        }
    }, [currentView]);

    const fetchConversations = async () => {
        try {
            const data = await conversationService.getConversations();
            setConversations(data);
            return data;
        } catch {
            toast.error("Không thể tải danh sách trò chuyện");
            return [];
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const init = async () => {
            // gộp 2 lần gọi getConversations() thành 1
            const data = await fetchConversations();
            const groups = (data || []).filter((c: any) => c.type === "group");
            if (groups.length === 0) return;

            const counts: Record<string, number> = {};
            // chạy tuần tự thay vì Promise.all để tránh burst request cùng lúc
            for (const g of groups) {
                try {
                    const requests = await conversationService.listJoinRequests(g._id);
                    if (requests?.length > 0) {
                        counts[g._id] = requests.length;
                    }
                } catch {
                    // bỏ qua nếu lỗi (không đủ quyền hoặc network)
                }
            }
            if (Object.keys(counts).length > 0) {
                setPendingGroupRequests(counts);
            }
        };
        init();
    }, []);

    const { isConnected } = useSocket();
    useEffect(() => {
        if (isConnected && conversations.length > 0) {
            conversations.forEach((conv: any) => {
                joinConversation(conv._id);
            });
        }
    }, [isConnected, conversations, joinConversation]);

    // nhóm bắt đầu gọi
    useGroupCallSocket({
        onStarted: (payload) => {
            // chỉ mở nếu mình chưa đang trong cuộc gọi nào
            if (payload.hostId === user?.sub) return;
            if (callModal === null && groupCallModal === null) {
                const conv = conversations.find((c: any) => c._id === payload.conversationId);
                setGroupCallModal({
                    conversationId: payload.conversationId,
                    conversationName: conv?.name ?? 'Cuộc gọi nhóm',
                    incoming: {
                        callId: payload.callId,
                        hostId: payload.hostId,
                    },
                });
            }
        },
        onJoined: () => {},
        onLeft: () => {},
        onEnded: () => { setGroupCallModal(null); },
        onOffer: () => {},
        onAnswer: () => {},
        onIceCandidate: () => {},
    });

    // có người gọi đến (chỉ mở khi mình chưa có cuộc gọi)
    useCallSocket({
        onIncoming: (payload) => {
            if (callModal === null) {
                setCallModal({
                    incoming: {
                        callId: payload.callId,
                        callerId: payload.callerId ?? '',
                        callerName: payload.callerInfo?.name ?? 'Người dùng',
                        callerAvatar: payload.callerInfo?.avatar ?? null,
                        conversationId: payload.conversationId ?? '',
                    },
                });
            }
        },
        onStarted: () => {},
        onAccepted: () => {},
        onRejected: () => {},
        onEnded: () => { setCallModal(null); },
        onCancelled: () => { setCallModal(null); },
        onBusy: () => {},
        onOffer: () => {},
        onAnswer: () => {},
        onIceCandidate: () => {},
    });

    useConversationSocket({
        onUpdate: fetchConversations,
        onJoinRequested: (payload) => {
            const cid = payload?.conversationId;
            if (!cid) return;
            setPendingGroupRequests(prev => ({
                ...prev,
                [cid]: (prev[cid] || 0) + 1,
            }));
            setReloadPendingTrigger(prev => prev + 1);
        },
        onRequestHandled: (payload) => {
            const cid = payload?.conversationId;
            if (!cid) return;
            // xóa badge pending cho conversation này
            setPendingGroupRequests(prev => {
                const next = { ...prev };
                delete next[cid];
                return next;
            });
            // trigger reload pending list trong ConversationPanel
            setReloadPendingTrigger(prev => prev + 1);
        },
        onForceLeave: (cid, reason) => {
            // nếu đang mở đúng hội thoại bị xóa/rời/giải tán thì thoát ra
            if (activeChat === cid || window.location.pathname.includes(cid)) {
                if (reason === 'dissolved') {
                    toast.error("Nhóm đã bị giải tán");
                } else if (reason === 'removed') {
                    toast.error("Bạn đã bị xóa khỏi nhóm");
                } else {
                    toast.success("Đã rời nhóm");
                }
                navigate("/chat");
            }
        },
    });

    useFriendSocket({
        onUpdate: fetchConversations,
        onReceived: () => {
            // chỉ tăng badge nếu user không đang ở tab contacts
            if (currentView !== "contacts") {
                setPendingFriendCount((prev) => prev + 1);
            }
        },
        onAccepted: async (conversationId) => {
            await fetchConversations();
            navigate("/chat/" + conversationId);
        },
    });

    useEffect(() => {
        if (activeChat) {
            const found = conversations.find((c) => c._id === activeChat);
            if (found) setActiveChatInfo(found);
        } else {
            setActiveChatInfo(null);
        }
    }, [activeChat, conversations]);

    useEffect(() => {
        if (activeChat !== prevActiveChat) {
            setIsPanelOpen(false);
            setPrevActiveChat(activeChat);
        }
    }, [activeChat, prevActiveChat]);

    const handleOpenInfo = (conv: any) => {
        setActiveChatInfo(conv);
        setIsPanelOpen(true);
        if (activeChat !== conv._id) {
            navigate("/chat/" + conv._id);
        }
    };

    const handleStartChat = async (userId: string) => {
        try {
            const newConv =
                await conversationService.createPrivateConversation(userId);
            await fetchConversations();
            navigate("/chat/" + newConv._id);
        } catch {
            toast.error("Không thể tạo cuộc trò chuyện");
        }
    };

    const handleGroupCreated = async (newConvId: string) => {
        setIsCreateGroupOpen(false);
        await fetchConversations();
        navigate("/chat/" + newConvId);
    };

    return (
        <>
        <ChatLayout
            showDetail={showDetail}
            primarySidebar={
                <SidebarPrimary
                    user={user}
                    avatarUrl={myAvatarUrl}
                    currentView={currentView}
                    setCurrentView={(view) =>
                        navigate(view === "contacts" ? "/friends" : "/chat")
                    }
                    onOpenSettings={() => setIsSettingsOpen(true)}
                    onLogout={logout}
                    isSettingsOpen={isSettingsOpen}
                    pendingFriendCount={pendingFriendCount}
                />
            }
            secondarySidebar={
                <SidebarSecondary
                    currentView={currentView}
                    conversations={conversations}
                    isLoading={isLoading}
                    onSelectChat={(id) => {
                        navigate("/chat/" + id);
                        setUnreadMentions((prev) => {
                            const next = new Set(prev);
                            next.delete(id);
                            return next;
                        });
                        // reset pending group request badge khi mở conversation đó
                        setPendingGroupRequests(prev => {
                            const next = { ...prev };
                            delete next[id];
                            return next;
                        });
                    }}
                    activeChatId={activeChat}
                    unreadMentions={unreadMentions}
                    pendingGroupRequests={pendingGroupRequests}
                    onCreateGroup={() => setIsCreateGroupOpen(true)}
                    onCreatePrivate={() => setIsCreatePrivateOpen(true)}
                    currentUserId={user?.sub || ""}
                    onOpenInfo={handleOpenInfo}
                    onRefresh={fetchConversations}
                />
            }
        >
            {/* sub-routing outlet */}
            <Outlet
                context={{
                    activeChat,
                    activeChatInfo,
                    isPanelOpen,
                    setIsPanelOpen,
                    currentUserId: user?.sub || "",
                    fetchConversations,
                    handleStartChat,
                    handleOpenInfo,
                    pendingGroupRequests,
                    reloadPendingTrigger,
                    startCall: (params: { calleId: string; calleeName: string; calleeAvatar?: string | null; conversationId: string }) => {
                        setCallModal({ outgoing: params });
                    },
                    startGroupCall: (params: { conversationId: string; conversationName: string }) => {
                        setGroupCallModal({ ...params, outgoing: true });
                    },
                    clearPendingGroupRequests: (cid: string) =>
                        setPendingGroupRequests(prev => {
                            const next = { ...prev };
                            delete next[cid];
                            return next;
                        }),
                }}
            />
        </ChatLayout>

        {/* modals */}
        {isSettingsOpen && (
            <SettingsModal
                onClose={() => {
                    setIsSettingsOpen(false);
                    // đóng modal xong thì refetch avatar
                    fetchMyAvatar();
                }}
            />
        )}
        {isCreateGroupOpen && (
            <CreateGroupModal
                onClose={() => setIsCreateGroupOpen(false)}
                onSuccess={handleGroupCreated}
            />
        )}
        {isCreatePrivateOpen && (
            <CreatePrivateChatModal
                onClose={() => setIsCreatePrivateOpen(false)}
                onSuccess={async (convId) => {
                    setIsCreatePrivateOpen(false);
                    await fetchConversations();
                    navigate("/chat/" + convId);
                }}
            />
        )}

        {/* cuộc gọi 1-1 */}
        {callModal !== null && (
            <Suspense fallback={null}>
                <CallModal
                    outgoing={callModal.outgoing}
                    incoming={callModal.incoming}
                    onClose={() => setCallModal(null)}
                />
            </Suspense>
        )}

        {/* cuộc gọi nhóm */}
        {groupCallModal !== null && (
            <Suspense fallback={null}>
                <GroupCallModal
                    conversationId={groupCallModal.conversationId}
                    conversationName={groupCallModal.conversationName}
                    currentUserId={user?.sub ?? ''}
                    currentUserName={user?.name ?? 'Bạn'}
                    incoming={groupCallModal.incoming}
                    outgoing={groupCallModal.outgoing}
                    onClose={() => setGroupCallModal(null)}
                />
            </Suspense>
        )}
        </>
    );
};

export default ChatPage;