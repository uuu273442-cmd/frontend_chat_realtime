import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
    Search,
    MessageCircle,
    Users as UsersIcon,
    LogOut,
    Trash2,
    Archive,
    ArchiveRestore,
    BellOff,
    Bell,
    Info,
    ChevronDown,
    ChevronRight,
    MoreHorizontal,
} from "lucide-react";
import Avatar from "../ui/Avatar";
import { conversationService } from "../../services/conversationService";
import { useSocket } from "../../context/SocketContext";
import toast from "react-hot-toast";


interface SidebarSecondaryProps {
    currentView: "chats" | "contacts";
    conversations: any[];
    isLoading: boolean;
    onSelectChat: (id: string) => void;
    activeChatId: string | null;
    onCreateGroup?: () => void;
    onCreatePrivate?: () => void;
    currentUserId: string;
    onOpenInfo?: (conv: any) => void;
    onRefresh?: () => void;
    unreadMentions?: Set<string>;
    pendingGroupRequests?: Record<string, number>;
}

const SidebarSecondary: React.FC<SidebarSecondaryProps> = ({
    currentView,
    conversations,
    isLoading,
    onSelectChat,
    activeChatId,
    onCreateGroup,
    onCreatePrivate,
    currentUserId,
    onOpenInfo,
    onRefresh,
    unreadMentions = new Set(),
    pendingGroupRequests = {},
}) => {
    const navigate = useNavigate();
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        conv: any;
        isArchived?: boolean;
    } | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [archivedConvs, setArchivedConvs] = useState<any[]>([]);
    const [isArchivedOpen, setIsArchivedOpen] = useState(false);
    const [isArchivedLoading, setIsArchivedLoading] = useState(false);
    const { presenceMap } = useSocket();

    // presence real-time
    const getPresence = (other: any) => {
        if (!other) return null;
        const otherId = other._id || other;
        return (
            presenceMap[otherId] ?? {
                status: other.status ?? "offline",
                customStatusMessage: other.customStatusMessage ?? null,
            }
        );
    };

    const statusDotColor: Record<string, string> = {
        online: "bg-green-500",
        away: "bg-yellow-500",
        busy: "bg-red-500",
        offline: "bg-gray-300",
    };

    const fetchArchived = async () => {
        setIsArchivedLoading(true);
        try {
            const data = await conversationService.getConversations(true);
            setArchivedConvs(data || []);
        } catch {
            /* silent */
        } finally {
            setIsArchivedLoading(false);
        }
    };

    useEffect(() => {
        if (isArchivedOpen && archivedConvs.length === 0) fetchArchived();
    }, [isArchivedOpen]);

    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        document.addEventListener("click", handleClick);
        return () => document.removeEventListener("click", handleClick);
    }, []);

    const handleContextMenu = (
        e: React.MouseEvent,
        conv: any,
        isArchived = false,
    ) => {
        e.preventDefault();
        e.stopPropagation();
        const x = Math.min(e.clientX, window.innerWidth - 200);
        const y = Math.min(e.clientY, window.innerHeight - 280);
        setContextMenu({ x, y, conv, isArchived });
    };

    const exec = async (fn: () => Promise<void>, successMsg: string, isDestructive = false) => {
        try {
            await fn();
            toast.success(successMsg);
            if (isDestructive && contextMenu?.conv._id === activeChatId) {
                navigate("/chat");
            }
            onRefresh?.();
        } catch {
            toast.error("Có lỗi xảy ra");
        }
        setContextMenu(null);
    };

    const isOwner = (conv: any) =>
        conv.participants?.find(
            (p: any) => (p.userId?._id || p.userId) === currentUserId,
        )?.role === "owner";

    const isMuted = (conv: any) => {
        const p = conv.participants?.find(
            (p: any) => (p.userId?._id || p.userId) === currentUserId,
        );
        return p?.muteUntil && new Date(p.muteUntil) > new Date();
    };

    const filtered = conversations.filter((c) => {
        const name =
            c.type === "private"
                ? c.participants?.find(
                      (p: any) => (p.userId?._id || p.userId) !== currentUserId,
                  )?.userId?.name || ""
                : c.name || "";
        return name.toLowerCase().includes(searchTerm.toLowerCase());
    });

    return (
        <aside className="w-full md:w-72 h-full bg-[#f7f7f7] border-r border-gray-200 flex flex-col min-w-0 relative">
            {/* search Header */}
            <div className="p-3 flex gap-2">
                <div className="flex-1 relative group">
                    <Search
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors"
                        size={14}
                    />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Tìm kiếm"
                        className="w-full pl-9 pr-3 py-1.5 bg-gray-200/60 rounded text-xs outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 transition-all border border-transparent focus:border-blue-200"
                    />
                </div>
                <div className="flex gap-1">
                    <button
                        onClick={onCreatePrivate}
                        className="p-1.5 hover:bg-blue-100 rounded text-blue-600 transition-all bg-white/50 border border-gray-200 shadow-sm"
                        title="Nhắn tin mới"
                    >
                        <MessageCircle size={15} />
                    </button>
                    <button
                        onClick={onCreateGroup}
                        className="p-1.5 hover:bg-blue-100 rounded text-blue-600 transition-all bg-white/50 border border-gray-200 shadow-sm"
                        title="Tạo nhóm"
                    >
                        <UsersIcon size={15} />
                    </button>
                </div>
            </div>

            {/* list Content */}
            <div className="flex-1 overflow-y-auto">
                {currentView === "chats" ? (
                    <div className="py-1">
                        <div className="px-5 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                            Trò chuyện gần đây
                        </div>
                        {isLoading ? (
                            <div className="p-10 text-center flex flex-col items-center gap-2">
                                <div className="w-6 h-6 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                                <span className="text-gray-400 text-[10px]">
                                    Đang tải...
                                </span>
                            </div>
                        ) : filtered.length > 0 ? (
                            filtered.map((conv) => {
                                const isPrivate = conv.type === "private";
                                let convName = conv.name;
                                let otherParticipant: any = null;
                                if (isPrivate && conv.participants) {
                                    otherParticipant = conv.participants.find(
                                        (p: any) =>
                                            (p.userId?._id || p.userId) !==
                                            currentUserId,
                                    )?.userId;
                                    convName =
                                        otherParticipant?.name || "Người dùng";
                                }
                                const presence = isPrivate
                                    ? getPresence(otherParticipant)
                                    : null;
                                const muted = isMuted(conv);
                                const isActive = activeChatId === conv._id;

                                return (
                                    <div
                                        key={conv._id}
                                        onClick={() => onSelectChat(conv._id)}
                                        onContextMenu={(e) =>
                                            handleContextMenu(e, conv)
                                        }
                                        className={`px-4 py-2.5 cursor-pointer flex gap-3 items-center transition-all group relative ${
                                            isActive
                                                ? "bg-[#e5efff]"
                                                : "hover:bg-gray-200/80"
                                        }`}
                                    >
                                        <div className="relative flex-shrink-0">
                                            <Avatar
                                                src={otherParticipant?.avatar}
                                                name={convName}
                                                size="md"
                                            />
                                            {/* chấm trạng thái */}
                                            {isPrivate && presence && (
                                                <div
                                                    className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${statusDotColor[presence.status] || statusDotColor.offline}`}
                                                    title={
                                                        presence.status ===
                                                        "online"
                                                            ? "Đang hoạt động"
                                                            : presence.status ===
                                                                "away"
                                                              ? "Vắng mặt"
                                                              : presence.status ===
                                                                  "busy"
                                                                ? "Bận"
                                                                : "Ngoại tuyến"
                                                    }
                                                />
                                            )}
                                            {/* bong bóng trạng thái tùy chỉnh */}
                                            {isPrivate &&
                                                presence?.status !==
                                                    "offline" &&
                                                presence?.customStatusMessage && (
                                                    <div
                                                        className="absolute -top-1.5 -right-1.5 max-w-[70px] px-1.5 py-0.5 bg-white rounded-full shadow-md border border-gray-100 text-[8px] font-medium text-gray-600 truncate leading-tight"
                                                        title={
                                                            presence.customStatusMessage
                                                        }
                                                    >
                                                        {
                                                            presence.customStatusMessage
                                                        }
                                                    </div>
                                                )}
                                            {muted && (
                                                <div className="absolute -bottom-0.5 -left-0.5 w-3.5 h-3.5 bg-gray-400 rounded-full flex items-center justify-center border-2 border-white">
                                                    <BellOff
                                                        size={7}
                                                        className="text-white"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 overflow-hidden">
                                            <div className="flex justify-between items-center mb-0.5">
                                                <div
                                                    className={`text-sm truncate ${isActive ? "font-bold text-blue-800" : "font-medium text-gray-800"}`}
                                                >
                                                    {convName}
                                                </div>
                                                <div className="flex items-center gap-1 flex-shrink-0">
                                                    {conv.lastMessage
                                                        ?.createdAt && (
                                                        <span className="text-[9px] text-gray-400">
                                                            {new Date(
                                                                conv.lastMessage
                                                                    .createdAt,
                                                            ).toLocaleTimeString(
                                                                "vi-VN",
                                                                {
                                                                    hour: "2-digit",
                                                                    minute: "2-digit",
                                                                },
                                                            )}
                                                        </span>
                                                    )}
                                                    {conv.unreadCount > 0 &&
                                                        !isActive && (
                                                            <div className="min-w-[16px] h-4 bg-red-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center px-1">
                                                                {conv.unreadCount >
                                                                99
                                                                    ? "99+"
                                                                    : conv.unreadCount}
                                                            </div>
                                                        )}
                                                    {unreadMentions.has(
                                                        conv._id,
                                                    ) && (
                                                        <div
                                                            className="w-4 h-4 bg-yellow-500 rounded-full text-white text-[10px] font-black flex items-center justify-center shadow-sm"
                                                            title="Bạn được nhắc tên"
                                                        >
                                                            @
                                                        </div>
                                                    )}
                                                    {(pendingGroupRequests[conv._id] || 0) > 0 && (
                                                        <div
                                                            className="min-w-[16px] h-4 px-0.5 bg-orange-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center shadow-sm"
                                                            title="Có thành viên chờ duyệt"
                                                        >
                                                            {pendingGroupRequests[conv._id] > 9 ? "9+" : pendingGroupRequests[conv._id]}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div
                                                className={`text-[11px] truncate ${conv.unreadCount > 0 ? "text-gray-800 font-semibold" : "text-gray-500"}`}
                                            >
                                                {conv.lastMessage?.content ||
                                                    "Chưa có tin nhắn"}
                                            </div>
                                        </div>

                                        {/* hover 3-dot */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleContextMenu(e, conv);
                                            }}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full bg-gray-200 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-300"
                                        >
                                            <MoreHorizontal size={13} />
                                        </button>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="p-8 text-center text-gray-400 text-xs italic">
                                {searchTerm
                                    ? "Không tìm thấy kết quả"
                                    : "Không có cuộc trò chuyện nào"}
                            </div>
                        )}

                        {/* archived Section */}
                        {!searchTerm && (
                            <div className="border-t border-gray-200 mt-1">
                                <button
                                    onClick={() => setIsArchivedOpen((o) => !o)}
                                    className="w-full flex items-center gap-2 px-5 py-2.5 text-[11px] font-bold text-gray-500 hover:bg-gray-200/60 transition-colors"
                                >
                                    <Archive
                                        size={13}
                                        className="text-gray-400"
                                    />
                                    <span className="flex-1 text-left">
                                        Tin nhắn đã lưu trữ
                                    </span>
                                    {archivedConvs.length > 0 && (
                                        <span className="min-w-[18px] h-[18px] bg-gray-300 text-gray-600 text-[9px] rounded-full flex items-center justify-center px-1 font-bold">
                                            {archivedConvs.length}
                                        </span>
                                    )}
                                    {isArchivedOpen ? (
                                        <ChevronDown size={13} />
                                    ) : (
                                        <ChevronRight size={13} />
                                    )}
                                </button>

                                {isArchivedOpen && (
                                    <div className="bg-gray-100/50">
                                        {isArchivedLoading ? (
                                            <div className="py-4 flex justify-center">
                                                <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                                            </div>
                                        ) : archivedConvs.length === 0 ? (
                                            <div className="py-4 text-center text-[11px] text-gray-400 italic">
                                                Không có tin nhắn lưu trữ
                                            </div>
                                        ) : (
                                            archivedConvs.map((conv) => {
                                                const isPrivate =
                                                    conv.type === "private";
                                                let convName = conv.name;
                                                let other: any = null;
                                                if (
                                                    isPrivate &&
                                                    conv.participants
                                                ) {
                                                    other =
                                                        conv.participants.find(
                                                            (p: any) =>
                                                                (p.userId
                                                                    ?._id ||
                                                                    p.userId) !==
                                                                currentUserId,
                                                        )?.userId;
                                                    convName =
                                                        other?.name ||
                                                        "Người dùng";
                                                }
                                                return (
                                                    <div
                                                        key={conv._id}
                                                        onClick={() =>
                                                            onSelectChat(
                                                                conv._id,
                                                            )
                                                        }
                                                        onContextMenu={(e) =>
                                                            handleContextMenu(
                                                                e,
                                                                conv,
                                                                true,
                                                            )
                                                        }
                                                        className={`px-4 py-2 cursor-pointer flex gap-3 items-center transition-all hover:bg-gray-200/80 opacity-75 hover:opacity-100 group relative ${
                                                            activeChatId ===
                                                            conv._id
                                                                ? "bg-[#e5efff] opacity-100"
                                                                : ""
                                                        }`}
                                                    >
                                                        <div className="relative flex-shrink-0">
                                                            <Avatar
                                                                src={
                                                                    other?.avatar
                                                                }
                                                                name={convName}
                                                                size="md"
                                                            />
                                                            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-gray-500 rounded-full flex items-center justify-center border-2 border-white">
                                                                <Archive
                                                                    size={7}
                                                                    className="text-white"
                                                                />
                                                            </div>
                                                            {/* chấm đỏ báo tin nhắn chưa đọc */}
                                                            {conv.unreadCount >
                                                                0 && (
                                                                <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
                                                            )}
                                                        </div>
                                                        <div className="flex-1 overflow-hidden">
                                                            <div
                                                                className={`text-sm truncate ${conv.unreadCount > 0 ? "font-bold text-gray-800" : "font-medium text-gray-600"}`}
                                                            >
                                                                {convName}
                                                            </div>
                                                            <div
                                                                className={`text-[11px] truncate ${conv.unreadCount > 0 ? "text-gray-600 font-medium" : "text-gray-400"}`}
                                                            >
                                                                {conv
                                                                    .lastMessage
                                                                    ?.content ||
                                                                    "Chưa có tin nhắn"}
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleContextMenu(
                                                                    e,
                                                                    conv,
                                                                    true,
                                                                );
                                                            }}
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full bg-gray-200 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-300"
                                                        >
                                                            <MoreHorizontal
                                                                size={13}
                                                            />
                                                        </button>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="py-2 space-y-0.5 px-2">
                        <div className="px-3 py-3 bg-[#e5efff] text-blue-600 cursor-pointer flex items-center gap-3 rounded-xl transition-all">
                            <div className="w-8 h-8 rounded-lg bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-200">
                                <UsersIcon size={16} />
                            </div>
                            <span className="font-bold text-xs">
                                Danh sách bạn bè
                            </span>
                        </div>
                        <div className="px-3 py-3 hover:bg-gray-200/60 cursor-pointer flex items-center gap-3 rounded-xl transition-all group">
                            <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                                <MessageCircle size={16} />
                            </div>
                            <span className="font-bold text-xs text-gray-600">
                                Danh sách nhóm
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* context Menu */}
            {contextMenu && (
                <div
                    className="fixed bg-white border border-gray-100 shadow-2xl rounded-2xl w-52 py-1.5 z-[100] animate-in fade-in zoom-in-95"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* info */}
                    <button
                        onClick={() => {
                            onOpenInfo?.(contextMenu.conv);
                            setContextMenu(null);
                        }}
                        className="w-full text-left px-4 py-2.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2.5 transition-colors"
                    >
                        <Info size={14} className="text-gray-400" /> Xem thông
                        tin
                    </button>

                    <div className="h-px bg-gray-100 my-1" />

                    {/* archive / Unarchive */}
                    {contextMenu.isArchived ? (
                        <button
                            onClick={() =>
                                exec(async () => {
                                    await conversationService.unarchiveConversation(
                                        contextMenu.conv._id,
                                    );
                                    await fetchArchived();
                                }, "Đã bỏ lưu trữ")
                            }
                            className="w-full text-left px-4 py-2.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2.5 transition-colors"
                        >
                            <ArchiveRestore
                                size={14}
                                className="text-gray-400"
                            />{" "}
                            Bỏ lưu trữ
                        </button>
                    ) : (
                        <button
                            onClick={() =>
                                exec(async () => {
                                    await conversationService.archiveConversation(
                                        contextMenu.conv._id,
                                    );
                                    await fetchArchived();
                                }, "Đã lưu trữ")
                            }
                            className="w-full text-left px-4 py-2.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2.5 transition-colors"
                        >
                            <Archive size={14} className="text-gray-400" /> Lưu
                            trữ trò chuyện
                        </button>
                    )}

                    {/* mute / Unmute */}
                    {isMuted(contextMenu.conv) ? (
                        <button
                            onClick={() =>
                                exec(
                                    () =>
                                        conversationService.unmuteConversation(
                                            contextMenu.conv._id,
                                        ),
                                    "Đã bật thông báo",
                                )
                            }
                            className="w-full text-left px-4 py-2.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2.5 transition-colors"
                        >
                            <Bell size={14} className="text-gray-400" /> Bật
                            thông báo
                        </button>
                    ) : (
                        <button
                            onClick={() =>
                                exec(
                                    () =>
                                        conversationService.muteConversation(
                                            contextMenu.conv._id,
                                            60,
                                        ),
                                    "Đã tắt thông báo",
                                )
                            }
                            className="w-full text-left px-4 py-2.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2.5 transition-colors"
                        >
                            <BellOff size={14} className="text-gray-400" /> Tắt
                            thông báo (1h)
                        </button>
                    )}

                    <div className="h-px bg-gray-100 my-1" />

                    {/* group-specific */}
                    {contextMenu.conv.type === "group" && (
                        <>
                            {/* member/Admin: rời nhóm. Owner: không có nút này */}
                            {!isOwner(contextMenu.conv) && (
                                <button
                                    onClick={() =>
                                        exec(
                                            () => conversationService.leaveGroup(contextMenu.conv._id),
                                            "Đã rời nhóm",
                                            true
                                        )
                                    }
                                    className="w-full text-left px-4 py-2.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2.5 transition-colors"
                                >
                                    <LogOut size={14} /> Rời nhóm
                                </button>
                            )}
                            {/* owner only: giải tán nhóm */}
                            {isOwner(contextMenu.conv) && (
                                <button
                                    onClick={() =>
                                        exec(
                                            () => conversationService.disbandGroup(contextMenu.conv._id),
                                            "Đã giải tán nhóm",
                                            true
                                        )
                                    }
                                    className="w-full text-left px-4 py-2.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2.5 transition-colors font-bold"
                                >
                                    <Trash2 size={14} /> Giải tán nhóm
                                </button>
                            )}
                        </>
                    )}

                    {/* private-specific */}
                    {contextMenu.conv.type === "private" && (
                        <button
                            onClick={() =>
                                exec(
                                    () =>
                                        conversationService.removeConversation(
                                            contextMenu.conv._id,
                                        ),
                                    "Đã xóa trò chuyện",
                                    true
                                )
                            }
                            className="w-full text-left px-4 py-2.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2.5 transition-colors"
                        >
                            <Trash2 size={14} /> Xóa trò chuyện
                        </button>
                    )}
                </div>
            )}
        </aside>
    );
};

export default SidebarSecondary;