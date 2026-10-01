import React, { useState, useEffect, useRef, useCallback } from "react";
import {
    Search,
    Send,
    Phone,
    Video,
    MoreVertical,
    Loader2,
    Image,
    File as FileIcon,
    Mic,
    MicOff,
    Smile,
    Reply,
    Edit2,
    Trash2,
    Forward,
    Pin,
    PinOff,
    X,
    Check,
    Info,
    ExternalLink,
    ChevronLeft,
    ChevronRight,
    PhoneOff,
    PhoneMissed,
    Users,
} from "lucide-react";
import { messageService } from "../../services/messageService";
import { useSocket } from "../../context/SocketContext";
import VoiceMessagePlayer from "./VoiceMessagePlayer";
import MessageErrorBoundary from "./MessageErrorBoundary";
import UserProfileModal from "./UserProfileModal";
import { conversationService } from "../../services/conversationService";
import { useAuth } from "../../context/AuthContext";
import Avatar from "../ui/Avatar";
import toast from "react-hot-toast";
import { useMessageSocket } from "../../hooks/useMessageSocket";
import type { Message, Conversation, Attachment } from "../../types";

interface ChatAreaProps {
    activeChat: string | null;
    onClose?: () => void;
    onOpenInfo?: () => void;
    onStartCall?: () => void;
    onStartGroupCall?: () => void;
    isPrivateChat?: boolean;
    isGroupChat?: boolean;
}

const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "😡"];

const formatTime = (d: string) =>
    d
        ? new Date(d).toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
          })
        : "";

const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const formatCallDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
};

// format "hoạt động lần cuối" kiểu tương đối
const formatLastSeen = (dateStr: string | null | undefined): string | null => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Vừa mới truy cập";
    if (diffMin < 60) return `Hoạt động ${diffMin} phút trước`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `Hoạt động ${diffHour} giờ trước`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 30) return `Hoạt động ${diffDay} ngày trước`;
    return `Hoạt động lúc ${date.toLocaleDateString("vi-VN")}`;
};

const renderCallMessage = (
    msg: any,
    isMine: boolean,
    onStartCall?: () => void,
    onStartGroupCall?: () => void,
) => {
    const status = msg.callInfo?.status as 'ended' | 'missed' | 'cancelled' | 'started' | undefined;
    const duration = msg.callInfo?.duration as number | undefined;

    const isMissed = status === 'missed';
    const isCancelled = status === 'cancelled';
    const isEnded = status === 'ended';
    const isStarted = status === 'started';

    const Icon = isMissed
        ? PhoneMissed
        : isCancelled
        ? PhoneOff
        : Phone;

    const statusText = {
        ended: 'Cuộc gọi thoại',
        missed: 'Cuộc gọi thoại nhỡ',
        cancelled: 'Cuộc gọi thoại đã huỷ',
        started: 'Cuộc gọi thoại nhóm đang diễn ra',
    }[status ?? 'ended'] ?? msg.content;

    const iconBg = isMine
        ? isMissed || isCancelled ? 'bg-red-400/20' : isStarted ? 'bg-green-400/20' : 'bg-white/15'
        : isMissed || isCancelled ? 'bg-red-50' : isStarted ? 'bg-green-50' : 'bg-green-50';

    const iconColor = isMine
        ? isMissed || isCancelled ? 'text-red-200' : isStarted ? 'text-green-300' : 'text-white'
        : isMissed || isCancelled ? 'text-red-500' : isStarted ? 'text-green-600' : 'text-green-600';

    return (
        <div className="flex flex-col gap-2 py-0.5 min-w-[180px]">
            <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-full ${iconBg} flex-shrink-0`}>
                    <Icon size={15} className={iconColor} />
                </div>
                <div className="flex flex-col min-w-0">
                    <span className="text-sm font-semibold leading-tight">{statusText}</span>
                    {isEnded && duration != null && duration > 0 ? (
                        <span className="text-xs opacity-60 leading-tight mt-0.5">
                            {formatCallDuration(duration)}
                        </span>
                    ) : isStarted ? (
                        <span className="text-xs text-green-500 leading-tight mt-0.5 animate-pulse">
                            Nhấn để tham gia
                        </span>
                    ) : isMissed ? (
                        <span className={`text-xs leading-tight mt-0.5 ${isMine ? 'text-red-200' : 'text-red-400'}`}>
                            Không có người nghe máy
                        </span>
                    ) : isCancelled ? (
                        <span className="text-xs opacity-50 leading-tight mt-0.5">
                            Cuộc gọi đã bị huỷ
                        </span>
                    ) : null}
                </div>
            </div>
            {/* gọi lại (chat riêng) hoặc tham gia (nhóm đang gọi) */}
            {isStarted && onStartGroupCall ? (
                <button
                    onClick={() => onStartGroupCall()}
                    className={`w-full py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5
                        ${isMine
                            ? 'bg-green-500/30 hover:bg-green-500/50 text-green-200'
                            : 'bg-green-100 hover:bg-green-200 text-green-700'
                        }`}
                >
                    <Users size={12} />
                    Tham gia cuộc gọi
                </button>
            ) : !isStarted && onStartCall ? (
                <button
                    onClick={() => onStartCall()}
                    className={`w-full py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5
                        ${isMine
                            ? 'bg-white/15 hover:bg-white/25 text-white'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                        }`}
                >
                    <Phone size={12} />
                    Gọi lại
                </button>
            ) : null}
        </div>
    );
};

const renderMessageContent = (content: string, isMine: boolean) => {
    if (!content) return null;
    // regex to match @ followed by characters until space or end of string
    const parts = content.split(/(@[^\s@]+)/g);
    return (
        <>
            {parts.map((part, i) => {
                if (part.startsWith("@")) {
                    return (
                        <span
                            key={i}
                            className={`font-black underline decoration-2 underline-offset-2 ${isMine ? "text-white decoration-white/40" : "text-blue-600 decoration-blue-200"}`}
                        >
                            {part}
                        </span>
                    );
                }
                return <span key={i}>{part}</span>;
            })}
        </>
    );
};

const ChatArea: React.FC<ChatAreaProps> = ({
    activeChat,
    onClose,
    onOpenInfo,
    onStartCall,
    onStartGroupCall,
    isPrivateChat = false,
    isGroupChat = false,
}) => {
    const { user } = useAuth();
    const { presenceMap } = useSocket();
    const [viewProfileUserId, setViewProfileUserId] = useState<string | null>(
        null,
    );
    const [messages, setMessages] = useState<Message[]>([]);
    const [conversationInfo, setConversationInfo] =
        useState<Conversation | null>(null);
    const [newMessage, setNewMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [replyTo, setReplyTo] = useState<Message | null>(null);
    const [editingMsg, setEditingMsg] = useState<Message | null>(null);
    const [editContent, setEditContent] = useState("");
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        msg: Message;
    } | null>(null);
    const [emojiPickerMsg, setEmojiPickerMsg] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
    const [forwardTargets, setForwardTargets] = useState<string[]>([]);

    // search state
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<Message[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    const [allConversations, setAllConversations] = useState<Conversation[]>(
        [],
    );
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const recordingTimerRef = useRef<number | null>(null);
    const [imageViewer, setImageViewer] = useState<{
        images: Attachment[];
        startIndex: number;
    } | null>(null);
    const [filesQueue, setFilesQueue] = useState<
        { file: File; type: "file" | "media" }[]
    >([]);
    const [mentionSearch, setMentionSearch] = useState("");
    const [showMentionList, setShowMentionList] = useState(false);
    const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
    const [mentionIds, setMentionIds] = useState<Set<string>>(new Set());
    const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
    const [showPinnedBar, setShowPinnedBar] = useState(true);
    const [mentionIndices, setMentionIndices] = useState<number[]>([]);
    const [currentMentionPointer, setCurrentMentionPointer] = useState(-1);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    // lưu vị trí scroll TRƯỚC khi load tin nhắn cũ, để restore sau khi prepend
    const prevScrollHeightRef = useRef(0);
    const prevScrollTopRef = useRef(0);
    const shouldRestoreScrollRef = useRef(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const mediaInputRef = useRef<HTMLInputElement>(null);

    const handleNewMessage = useCallback(
        (payload: any) => {
            let msg = payload.message || payload;
            if (
                payload.attachments &&
                (!msg.attachments || msg.attachments.length === 0)
            ) {
                // chuẩn hóa thành mảng
                const normalizedAttachments = Array.isArray(payload.attachments)
                    ? payload.attachments
                    : [payload.attachments];
                msg = { ...msg, attachments: normalizedAttachments };
            }
            setMessages((prev) => [...prev, msg]);
            setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            }, 100);

            const senderId = (msg.senderId?._id || msg.senderId)?.toString();
            if (activeChat && senderId !== user?.sub) {
                messageService.markAsSeen(activeChat).catch(() => {});
            }
        },
        [activeChat, user?.sub],
    );

    // gộp linkPreviews vào message đã tồn tại theo messageId (không tạo message mới)
    const handleLinkPreview = useCallback((payload: any[]) => {
        if (!Array.isArray(payload) || payload.length === 0) return;

        // nhóm theo messageId
        const byMessageId = payload.reduce<Record<string, any[]>>((acc, lp) => {
            const mid = (lp.messageId?._id || lp.messageId)?.toString();
            if (!mid) return acc;
            if (!acc[mid]) acc[mid] = [];
            acc[mid].push(lp);
            return acc;
        }, {});

        setMessages((prev) =>
            prev.map((m) => {
                const links = byMessageId[m._id];
                if (!links) return m;
                // merge, tránh trùng theo url
                const existingUrls = new Set((m.linkPreviews || []).map((l: any) => l.url));
                const newLinks = links.filter((l) => !existingUrls.has(l.url));
                if (newLinks.length === 0) return m;
                return {
                    ...m,
                    linkPreviews: [...(m.linkPreviews || []), ...newLinks],
                };
            }),
        );
    }, []);

    const { isTyping, notifyTyping, stopTyping } = useMessageSocket({
        activeChat,
        currentUserId: user?.sub,
        onNewMessage: handleNewMessage,
        onLinkPreview: handleLinkPreview,
        onConversationUpdate: () => fetchChatData(),
        onMessageEdited: (payload: any) => {
            const edited = payload.message || payload;
            setMessages((prev) =>
                prev.map((m) =>
                    m._id === (edited._id || edited.id)
                        ? { ...m, ...edited, isEdited: true }
                        : m,
                ),
            );
        },
        onMessageDeleted: (payload: any) => {
            if (payload.scope === "everyone") {
                setMessages((prev) =>
                    prev.map((m) =>
                        m._id === payload.messageId
                            ? {
                                  ...m,
                                  isDeleted: true,
                                  content: "Tin nhắn đã bị thu hồi",
                              }
                            : m,
                    ),
                );
            } else if (payload.deletedBy === user?.sub) {
                setMessages((prev) =>
                    prev.filter((m) => m._id !== payload.messageId),
                );
            }
        },
        onMessageReacted: (payload: any) => {
            setMessages((prev) =>
                prev.map((m) => {
                    if (m._id !== payload.messageId) return m;
                    let reactions = [...(m.reactions || [])];
                    if (payload.action === "remove") {
                        reactions = reactions.filter(
                            (r: any) =>
                                (r.userId?._id || r.userId) !== payload.userId,
                        );
                    } else {
                        reactions = reactions.filter(
                            (r: any) =>
                                (r.userId?._id || r.userId) !== payload.userId,
                        );
                        reactions.push({
                            userId: payload.userId,
                            emoji: payload.emoji,
                        });
                    }
                    return { ...m, reactions };
                }),
            );
        },
        onMessageSeen: (payload: any) => {
            setMessages((prev) =>
                prev.map((m) => {
                    if (!m.seenBy) return m;
                    const already = m.seenBy.some(
                        (s: any) =>
                            (s._id || s) ===
                            (payload.seenBy?._id || payload.userId),
                    );
                    if (already) return m;
                    return {
                        ...m,
                        seenBy: [
                            ...m.seenBy,
                            payload.seenBy || { _id: payload.userId },
                        ],
                    };
                }),
            );
        },
        onMessagePinned: (payload: any) => {
            setMessages((prev) =>
                prev.map((m) =>
                    m._id === payload.messageId ? { ...m, isPinned: true } : m,
                ),
            );
            fetchPins();
        },
        onMessageUnpinned: (payload: any) => {
            setMessages((prev) =>
                prev.map((m) =>
                    m._id === payload.messageId ? { ...m, isPinned: false } : m,
                ),
            );
            fetchPins();
        },
    });

    const scrollToBottom = useCallback(
        (behavior: "auto" | "smooth" = "smooth") => {
            messagesEndRef.current?.scrollIntoView({ behavior });
        },
        [],
    );

    useEffect(() => {
        if (activeChat) {
            fetchChatData();
            setIsDropdownOpen(false);
            setReplyTo(null);
            setEditingMsg(null);
            setShowPinnedBar(true);
            setCurrentMentionPointer(-1);
        }
    }, [activeChat]);

    useEffect(() => {
        const indices = messages
            .map((msg, i) => {
                const isMentioned =
                    (msg.senderId?._id || msg.senderId) !== user?.sub &&
                    msg.mentions?.some((m: any) => (m._id || m) === user?.sub);
                return isMentioned ? i : -1;
            })
            .filter((i) => i !== -1);
        setMentionIndices(indices);
    }, [messages, user?.sub]);

    useEffect(() => {
        if (isTyping) scrollToBottom("smooth");
    }, [isTyping, scrollToBottom]);

    // mark as seen when opening chat
    useEffect(() => {
        if (activeChat) messageService.markAsSeen(activeChat).catch(() => {});
    }, [activeChat]);

    const fetchChatData = async () => {
        setIsLoading(true);
        try {
            const [info, data] = await Promise.all([
                conversationService.getConversationInfo(activeChat!),
                messageService.getMessages(activeChat!, 30),
            ]);
            setConversationInfo(info);
            setMessages(data.messages);
            setHasMore(data.hasMore);
            setNextCursor(data.nextCursor);
            fetchPins();
            setTimeout(() => scrollToBottom("auto"), 50);
        } catch {
            toast.error("Không thể tải cuộc trò chuyện");
        } finally {
            setIsLoading(false);
        }
    };

    const fetchPins = async () => {
        if (!activeChat) return;
        try {
            const pins = await conversationService.getPins(activeChat);
            setPinnedMessages(pins);
        } catch {}
    };

    const loadMore = useCallback(async () => {
        if (!hasMore || loadingMore || !nextCursor) return;

        // capture vị trí scroll TRƯỚC khi thêm tin nhắn cũ vào đầu danh sách
        const container = messagesContainerRef.current;
        if (container) {
            prevScrollHeightRef.current = container.scrollHeight;
            prevScrollTopRef.current = container.scrollTop;
            shouldRestoreScrollRef.current = true;
        }

        setLoadingMore(true);
        try {
            const data = await messageService.getMessages(
                activeChat!,
                30,
                nextCursor,
            );
            setMessages((prev) => [...data.messages, ...prev]);
            setHasMore(data.hasMore);
            setNextCursor(data.nextCursor);
        } catch {
        } finally {
            setLoadingMore(false);
        }
    }, [hasMore, loadingMore, nextCursor, activeChat]);

    // restore vị trí scroll sau khi DOM đã render tin nhắn cũ mới thêm vào
    useEffect(() => {
        if (shouldRestoreScrollRef.current && messagesContainerRef.current) {
            const container = messagesContainerRef.current;
            const newScrollHeight = container.scrollHeight;
            container.scrollTop =
                newScrollHeight - prevScrollHeightRef.current + prevScrollTopRef.current;
            shouldRestoreScrollRef.current = false;
        }
    }, [messages]);

    // auto-trigger load more khi scroll gần lên đầu danh sách (infinite scroll)
    const handleMessagesScroll = useCallback(
        (e: React.UIEvent<HTMLDivElement>) => {
            const el = e.currentTarget;
            // cách đầu 120px thì bắt đầu tải thêm
            if (el.scrollTop < 120 && hasMore && !loadingMore) {
                loadMore();
            }
        },
        [hasMore, loadingMore, loadMore],
    );

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        const text = editingMsg ? editContent : newMessage;

        if (filesQueue.length > 0) {
            await handleUploadQueue();
            return;
        }

        if (!text.trim() || !activeChat) return;
        stopTyping();

        if (editingMsg) {
            try {
                await messageService.editMessage(
                    activeChat,
                    editingMsg._id,
                    editContent,
                );
                setMessages((prev) =>
                    prev.map((m) =>
                        m._id === editingMsg._id
                            ? { ...m, content: editContent, isEdited: true }
                            : m,
                    ),
                );
                setEditingMsg(null);
                setEditContent("");
            } catch {
                toast.error("Không thể sửa");
            }
            return;
        }

        setIsSending(true);
        try {
            // extract mention IDs from the current message content to be safe
            const currentMentions = Array.from(mentionIds).filter((id) => {
                const p = conversationInfo?.participants?.find(
                    (p: any) => p.userId?._id === id,
                );
                return p && text.includes(`@${p.userId?.name}`);
            });

            await messageService.sendMessage(
                activeChat,
                text,
                replyTo?._id,
                currentMentions,
            );
            setNewMessage("");
            setReplyTo(null);
            setMentionIds(new Set());
        } catch (error: any) {
            if (error?.response?.status === 403) {
                toast.error(
                    "Không thể gửi tin nhắn — bạn hoặc người này đã chặn nhau",
                );
            } else {
                toast.error("Không thể gửi");
            }
        } finally {
            setIsSending(false);
        }
    };

    const handleUploadQueue = async () => {
        if (!filesQueue.length || !activeChat) return;
        setIsSending(true);
        try {
            const mediaFiles = filesQueue
                .filter((f) => f.type === "media")
                .map((f) => f.file);
            const regularFiles = filesQueue
                .filter((f) => f.type === "file")
                .map((f) => f.file);

            if (mediaFiles.length)
                await messageService.uploadMedia(
                    activeChat,
                    mediaFiles,
                    replyTo?._id,
                );
            if (regularFiles.length)
                await messageService.uploadFiles(
                    activeChat,
                    regularFiles,
                    replyTo?._id,
                );

            setFilesQueue([]);
            setReplyTo(null);
            setNewMessage("");
            toast.success("Đã gửi tệp");
        } catch {
            toast.error("Không thể tải lên một số tệp");
        } finally {
            setIsSending(false);
        }
    };

    const handleDelete = async (msg: any, scope: "everyone" | "self") => {
        try {
            await messageService.deleteMessage(activeChat!, msg._id, scope);
            if (scope === "everyone") {
                setMessages((prev) =>
                    prev.map((m) =>
                        m._id === msg._id
                            ? {
                                  ...m,
                                  isDeleted: true,
                                  content: "Tin nhắn đã bị thu hồi",
                              }
                            : m,
                    ),
                );
            } else {
                setMessages((prev) => prev.filter((m) => m._id !== msg._id));
            }
        } catch {
            toast.error("Không thể xóa");
        }
        setContextMenu(null);
    };

    const handleReact = async (msgId: string, emoji: string) => {
        try {
            await messageService.reactToMessage(activeChat!, msgId, emoji);
            setMessages((prev) =>
                prev.map((m) => {
                    if (m._id === msgId) {
                        const reactions = [...(m.reactions || [])];
                        const idx = reactions.findIndex((r) => {
                            const rUserId =
                                typeof r.userId === "object"
                                    ? r.userId._id
                                    : r.userId;
                            return rUserId === user?.sub;
                        });
                        if (idx > -1) reactions[idx].emoji = emoji;
                        else reactions.push({ userId: user!.sub, emoji });
                        return { ...m, reactions };
                    }
                    return m;
                }),
            );
        } catch {
            toast.error("Không thể thả cảm xúc");
        }
        setEmojiPickerMsg(null);
    };

    const handleUnreact = async (msgId: string) => {
        try {
            await messageService.unreactFromMessage(activeChat!, msgId);
            setMessages((prev) =>
                prev.map((m) => {
                    if (m._id === msgId) {
                        return {
                            ...m,
                            reactions: m.reactions?.filter((r) => {
                                const rUserId =
                                    typeof r.userId === "object"
                                        ? r.userId._id
                                        : r.userId;
                                return rUserId !== user?.sub;
                            }),
                        };
                    }
                    return m;
                }),
            );
        } catch {
            toast.error("Không thể bỏ cảm xúc");
        }
    };

    const handlePin = async (msg: Message) => {
        try {
            await messageService.pinMessage(activeChat!, msg._id);
            setMessages((prev) =>
                prev.map((m) =>
                    m._id === msg._id ? { ...m, isPinned: true } : m,
                ),
            );
            toast.success("Đã ghim tin nhắn");
        } catch {
            toast.error("Không thể ghim");
        }
        setContextMenu(null);
    };

    const handleUnpin = async (msg: Message) => {
        try {
            await messageService.unpinMessage(activeChat!, msg._id);
            setMessages((prev) =>
                prev.map((m) =>
                    m._id === msg._id ? { ...m, isPinned: false } : m,
                ),
            );
            toast.success("Đã bỏ ghim");
        } catch {
            toast.error("Không thể bỏ ghim");
        }
        setContextMenu(null);
    };

    const handleForward = async () => {
        if (!forwardMsg || !forwardTargets.length || !activeChat) return;
        try {
            await messageService.forwardMessage(
                activeChat,
                forwardMsg._id,
                forwardTargets,
            );
            toast.success(
                `Đã chuyển tiếp đến ${forwardTargets.length} cuộc trò chuyện`,
            );
        } catch {
            toast.error("Không thể chuyển tiếp");
        }
        setForwardMsg(null);
        setForwardTargets([]);
    };

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim() || !activeChat) return;
        setIsSearching(true);
        try {
            const results = await messageService.searchMessages(
                activeChat,
                searchQuery,
            );
            setSearchResults(results);
            if (results.length === 0) {
                toast("Không tìm thấy tin nhắn nào", { icon: "🔍" });
            }
        } catch {
            toast.error("Lỗi khi tìm kiếm");
        } finally {
            setIsSearching(false);
        }
    };

    const scrollToMessage = (msgId: string) => {
        const el = document.getElementById(`msg-${msgId}`);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.classList.add("bg-blue-50/50");
            setTimeout(() => el.classList.remove("bg-blue-50/50"), 2000);
        } else {
            toast("Tin nhắn quá cũ, vui lòng cuộn lên để tải thêm");
        }
    };

    const openForwardModal = async (msg: Message) => {
        setForwardMsg(msg);
        setContextMenu(null);
        try {
            const convs = await conversationService.getConversations();
            setAllConversations(
                convs.filter((c: Conversation) => c._id !== activeChat),
            );
        } catch {}
    };

    const startVoiceRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
            });
            const recorder = new MediaRecorder(stream);
            const chunks: Blob[] = [];
            recorder.ondataavailable = (e) => chunks.push(e.data);
            recorder.onstop = async () => {
                stream.getTracks().forEach((t) => t.stop());
                if (recordingTimerRef.current)
                    clearInterval(recordingTimerRef.current);

                const blob = new Blob(chunks, { type: "audio/webm" });
                const file = new File([blob], `voice_${Date.now()}.webm`, {
                    type: "audio/webm",
                });
                try {
                    await messageService.uploadVoice(
                        activeChat!,
                        file,
                        replyTo?._id,
                    );
                    setReplyTo(null);
                } catch {
                    toast.error("Gửi voice thất bại");
                }
                setIsRecording(false);
                setRecordingDuration(0);
            };

            recorder.start();
            mediaRecorderRef.current = recorder;
            setIsRecording(true);

            setRecordingDuration(0);
            recordingTimerRef.current = window.setInterval(() => {
                setRecordingDuration((prev) => prev + 1);
            }, 1000);
        } catch {
            toast.error("Không thể truy cập micro");
        }
    };

    const stopVoiceRecording = () => {
        mediaRecorderRef.current?.stop();
        mediaRecorderRef.current = null;
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };

    const handleFileUpload = async (
        e: React.ChangeEvent<HTMLInputElement>,
        type: "file" | "media",
    ) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;

        const totalInQueue = filesQueue.length + files.length;
        if (totalInQueue > 10) {
            toast.error("Chỉ được phép tải lên tối đa 10 tệp cùng lúc");
            e.target.value = "";
            return;
        }

        const MAX_SIZE = 10 * 1024 * 1024; // 10MB
        const oversized = files.find((f) => f.size > MAX_SIZE);
        if (oversized) {
            toast.error("Kích thước mỗi tệp tối đa là 10MB");
            e.target.value = "";
            return;
        }

        if (type === "media") {
            const invalid = files.find(
                (f) =>
                    !f.type.startsWith("image/") &&
                    !f.type.startsWith("video/"),
            );
            if (invalid) {
                toast.error("Chỉ hỗ trợ tệp hình ảnh hoặc video");
                e.target.value = "";
                return;
            }
        }

        const newQueueItems = files.map((file) => ({ file, type }));
        setFilesQueue((prev) => [...prev, ...newQueueItems]);
        e.target.value = "";
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (editingMsg) {
            setEditContent(val);
        } else {
            setNewMessage(val);

            // mention logic
            const cursor = e.target.selectionStart || 0;
            const textBefore = val.slice(0, cursor);
            // support Vietnamese and characters other than space/@
            const mentionMatch = textBefore.match(/@([^@\s]*)$/);

            if (mentionMatch && conversationInfo?.type === "group") {
                setMentionSearch(mentionMatch[1]);
                setShowMentionList(true);
                setSelectedMentionIndex(0);
            } else {
                setShowMentionList(false);
            }
        }
        notifyTyping();
    };

    const insertMention = (p: any) => {
        const val = editingMsg ? editContent : newMessage;
        const cursor = val.lastIndexOf("@" + mentionSearch);
        if (cursor === -1) return;

        const before = val.slice(0, cursor);
        const after = val.slice(cursor + mentionSearch.length + 1);
        const updated = `${before}@${p.userId?.name} ${after}`;

        if (editingMsg) setEditContent(updated);
        else setNewMessage(updated);

        setMentionIds((prev) => new Set(prev).add(p.userId?._id));
        setShowMentionList(false);
    };

    const jumpToMention = () => {
        if (mentionIndices.length === 0) return;
        const nextPointer = (currentMentionPointer + 1) % mentionIndices.length;
        setCurrentMentionPointer(nextPointer);
        const msgIndex = mentionIndices[nextPointer];
        const msg = messages[msgIndex];
        if (msg) {
            const el = document.getElementById(`msg-${msg._id}`);
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
            el?.classList.add("bg-yellow-100/50");
            setTimeout(() => el?.classList.remove("bg-yellow-100/50"), 2000);
        }
    };

    const isPrivate = conversationInfo?.type === "private";
    const headerOther = isPrivate
        ? conversationInfo?.participants?.find(
              (p: any) => p.userId?._id !== user?.sub,
          )?.userId
        : null;
    const headerName = isPrivate
        ? headerOther?.name || "Người dùng"
        : conversationInfo?.name || "";
    const memberCount = conversationInfo?.participants?.length || 0;
    const currentUserRole = conversationInfo?.participants?.find(
        (p: any) => p.userId?._id === user?.sub,
    )?.role;

    // presence real-time
    const otherPresence = headerOther
        ? presenceMap[headerOther._id] ?? {
              status: headerOther.status ?? "offline",
              customStatusMessage: headerOther.customStatusMessage ?? null,
              lastSeen: headerOther.lastSeen ?? null,
          }
        : null;

    if (!activeChat)
        return (
            <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-white">
                <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center mb-6">
                    <svg
                        className="w-10 h-10 text-blue-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                        />
                    </svg>
                </div>
                <h2 className="text-xl font-black text-gray-900 mb-2">
                    Chào mừng đến Zalo Hybrid
                </h2>
                <p className="text-gray-400 text-sm">
                    Chọn một cuộc trò chuyện để bắt đầu
                </p>
            </div>
        );

    return (
        <div
            className="flex flex-col h-full relative"
            onClick={() => {
                setIsDropdownOpen(false);
                setContextMenu(null);
                setEmojiPickerMsg(null);
            }}
        >
            {/* header */}
            <header className="h-16 px-5 bg-white border-b border-gray-100 flex items-center justify-between flex-shrink-0 shadow-sm z-10">
                <div className="flex items-center gap-3">
                    {/* nút quay lại */}
                    <button
                        type="button"
                        onClick={() => onClose?.()}
                        className="md:hidden -ml-1 p-1.5 rounded-full hover:bg-gray-100 text-gray-600 flex-shrink-0"
                    >
                        <ChevronLeft size={22} />
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            if (isPrivate && headerOther?._id) {
                                setViewProfileUserId(headerOther._id);
                            }
                        }}
                        className={isPrivate ? "cursor-pointer" : "cursor-default"}
                    >
                        <Avatar
                            src={headerOther?.avatar}
                            name={headerName || "?"}
                            size="md"
                        />
                    </button>
                    <div>
                        <div className="font-bold text-gray-900 text-[15px]">
                            {headerName || "…"}
                        </div>
                        <div className="text-[11px] text-gray-400">
                            {isPrivate ? (
                                otherPresence?.status === "online" ? (
                                    <span className="text-green-500 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                                        {otherPresence.customStatusMessage ||
                                            "Đang hoạt động"}
                                    </span>
                                ) : otherPresence?.status === "away" ? (
                                    <span className="text-yellow-500 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />
                                        {otherPresence.customStatusMessage ||
                                            "Vắng mặt"}
                                    </span>
                                ) : otherPresence?.status === "busy" ? (
                                    <span className="text-red-500 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                                        {otherPresence.customStatusMessage ||
                                            "Bận"}
                                    </span>
                                ) : (
                                    formatLastSeen(otherPresence?.lastSeen) ||
                                    "Ngoại tuyến"
                                )
                            ) : (
                                `${memberCount} thành viên`
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => {
                            setIsSearchOpen(!isSearchOpen);
                            setSearchQuery("");
                            setSearchResults([]);
                        }}
                        className={`p-2 rounded-full transition-colors ${isSearchOpen ? "bg-blue-100 text-blue-600" : "text-gray-500 hover:bg-gray-100"}`}
                        title="Tìm kiếm tin nhắn"
                    >
                        <Search size={18} />
                    </button>
                    {/* gọi thoại 1-1 */}
                    {isPrivate && (
                        <button
                            onClick={() => onStartCall?.()}
                            className="p-2 text-gray-500 hover:bg-green-100 hover:text-green-600 rounded-full transition-colors"
                            title="Gọi thoại"
                        >
                            <Phone size={18} />
                        </button>
                    )}
                    {/* gọi thoại nhóm */}
                    {isGroupChat && (
                        <button
                            onClick={() => onStartGroupCall?.()}
                            className="p-2 text-gray-500 hover:bg-green-100 hover:text-green-600 rounded-full transition-colors"
                            title="Gọi thoại nhóm"
                        >
                            <Phone size={18} />
                        </button>
                    )}
                    <div className="w-px h-5 bg-gray-200 mx-1" />
                    <button
                        onClick={onOpenInfo}
                        className="p-2 text-gray-500 hover:bg-blue-100 hover:text-blue-600 rounded-full transition-colors"
                        title="Thông tin"
                    >
                        <Info size={18} />
                    </button>
                    <div className="relative">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsDropdownOpen(!isDropdownOpen);
                            }}
                            className="p-2 text-gray-500 hover:bg-gray-100 rounded-full"
                        >
                            <MoreVertical size={18} />
                        </button>
                        {isDropdownOpen && (
                            <div
                                className="absolute right-0 mt-1 w-52 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-50 animate-in fade-in zoom-in-95"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {conversationInfo?.type === "group" && (
                                    <>
                                        <button
                                            onClick={() => {
                                                setIsDropdownOpen(false);
                                                onOpenInfo?.();
                                            }}
                                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                        >
                                            Thêm thành viên
                                        </button>
                                        <button
                                            onClick={() => {
                                                onOpenInfo?.();
                                                setIsDropdownOpen(false);
                                            }}
                                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                        >
                                            Quản lý thành viên
                                        </button>
                                        <div className="h-px bg-gray-100 my-1" />
                                        <button
                                            onClick={async () => {
                                                await conversationService.leaveGroup(
                                                    activeChat!,
                                                );
                                                onClose?.();
                                            }}
                                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                        >
                                            Rời nhóm
                                        </button>
                                        {currentUserRole === "owner" && (
                                            <button
                                                onClick={async () => {
                                                    await conversationService.disbandGroup(
                                                        activeChat!,
                                                    );
                                                    onClose?.();
                                                }}
                                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 font-bold"
                                            >
                                                Giải tán nhóm
                                            </button>
                                        )}
                                    </>
                                )}
                                {isPrivate && (
                                    <button
                                        onClick={async () => {
                                            await conversationService.removeConversation(
                                                activeChat!,
                                            );
                                            onClose?.();
                                        }}
                                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                    >
                                        Xóa trò chuyện
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* search Bar */}
            {isSearchOpen && (
                <div className="bg-white border-b border-gray-100 p-3 animate-in slide-in-from-top-2 z-10 shadow-sm">
                    <form onSubmit={handleSearch} className="flex gap-2">
                        <div className="relative flex-1">
                            <Search
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                                size={14}
                            />
                            <input
                                type="text"
                                autoFocus
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Tìm kiếm nội dung tin nhắn..."
                                className="w-full pl-9 pr-4 py-2 bg-gray-100 rounded-xl text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 border border-transparent focus:border-blue-500/50 transition-all"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={isSearching}
                            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-2"
                        >
                            {isSearching ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : (
                                <Search size={14} />
                            )}{" "}
                            Tìm
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsSearchOpen(false)}
                            className="p-2 text-gray-500 hover:bg-gray-100 rounded-xl transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </form>

                    {searchResults.length > 0 && (
                        <div className="mt-3 max-h-48 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 mb-2">
                                Kết quả ({searchResults.length})
                            </div>
                            {searchResults.map((msg) => (
                                <button
                                    key={msg._id}
                                    onClick={() => scrollToMessage(msg._id)}
                                    className="w-full text-left p-2 hover:bg-blue-50 rounded-lg flex flex-col gap-0.5 group transition-colors border border-transparent hover:border-blue-100"
                                >
                                    <div className="flex justify-between items-center w-full">
                                        <span className="text-xs font-bold text-gray-800">
                                            {msg.senderId?.name}
                                        </span>
                                        <span className="text-[9px] text-gray-400">
                                            {formatTime(msg.createdAt)}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-gray-600 line-clamp-1 italic">
                                        "{msg.content}"
                                    </p>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* pinned Messages Bar */}
            {pinnedMessages.length > 0 && showPinnedBar && (
                <div className="bg-white border-b border-gray-100 px-4 py-2 flex items-center justify-between animate-in slide-in-from-top-1 z-0 shadow-sm">
                    <div
                        className="flex items-center gap-3 overflow-hidden flex-1 cursor-pointer hover:bg-gray-50 p-1 rounded-lg transition-colors"
                        onClick={() => {
                            const msg = messages.find(
                                (m) => m._id === pinnedMessages[0]._id,
                            );
                            if (msg) {
                                const el = document.getElementById(
                                    `msg-${msg._id}`,
                                );
                                el?.scrollIntoView({
                                    behavior: "smooth",
                                    block: "center",
                                });
                                el?.classList.add("bg-blue-50/50");
                                setTimeout(
                                    () => el?.classList.remove("bg-blue-50/50"),
                                    2000,
                                );
                            } else {
                                toast("Tin nhắn cũ hơn đang được tải...");
                            }
                        }}
                    >
                        <Pin
                            size={14}
                            className="text-blue-500 flex-shrink-0"
                        />
                        <div className="flex flex-col min-w-0">
                            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">
                                Tin nhắn đã ghim
                            </span>
                            <p className="text-xs text-gray-600 truncate">
                                {pinnedMessages[0].content || "File/Media"}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        {pinnedMessages.length > 1 && (
                            <span className="text-[10px] text-gray-400 font-medium bg-gray-100 px-1.5 py-0.5 rounded-full">
                                +{pinnedMessages.length - 1}
                            </span>
                        )}
                        <button
                            onClick={() => setShowPinnedBar(false)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* messages */}
            <div
                ref={messagesContainerRef}
                onScroll={handleMessagesScroll}
                className="flex-1 overflow-y-auto px-4 py-4 space-y-1 bg-[#f0f4ff]/30"
            >
                {/* spinner nhỏ khi đang tải tin nhắn cũ */}
                {hasMore && (
                    <div className="flex justify-center py-2">
                        {loadingMore ? (
                            <div className="flex items-center gap-1.5 text-xs text-gray-400">
                                <Loader2 size={12} className="animate-spin" />
                                Đang tải tin nhắn cũ...
                            </div>
                        ) : (
                            <button
                                onClick={loadMore}
                                className="text-xs text-blue-400 hover:text-blue-600 hover:underline"
                            >
                                Tải thêm tin nhắn cũ
                            </button>
                        )}
                    </div>
                )}
                {isLoading ? (
                    <div className="h-full flex items-center justify-center">
                        <Loader2
                            className="animate-spin text-blue-500"
                            size={28}
                        />
                    </div>
                ) : (
                    messages.map((msg, i) => {
                        const isMine =
                            (msg.senderId?._id || msg.senderId) === user?.sub;
                        const prev = messages[i - 1];
                        const sameAuthor =
                            prev &&
                            (prev.senderId?._id || prev.senderId) ===
                                (msg.senderId?._id || msg.senderId);
                        const isSystem = msg.type === "system";
                        const isMentioned =
                            !isMine &&
                            msg.mentions?.some(
                                (m: any) => (m._id || m) === user?.sub,
                            );

                        if (isSystem)
                            return (
                                <div
                                    key={(msg._id && msg._id.toString()) || `tmp-${i}`}
                                    className="flex justify-center py-1"
                                >
                                    <span className="text-[11px] text-gray-400 bg-gray-100/80 px-3 py-1 rounded-full">
                                        {msg.content}
                                    </span>
                                </div>
                            );

                        const reactions = msg.reactions || [];
                        const grouped = reactions.reduce(
                            (acc: Record<string, number>, r) => {
                                acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                                return acc;
                            },
                            {},
                        );

                        return (
                            <div
                                id={`msg-${msg._id}`}
                                key={(msg._id && msg._id.toString()) || `tmp-${i}`}
                                className={`flex ${isMine ? "justify-end" : "justify-start"} group transition-colors duration-500`}
                            >
                                <div
                                    className={`flex gap-2 max-w-[72%] ${isMine ? "flex-row-reverse" : "flex-row"}`}
                                >
                                    {!isMine && (
                                        <div className="self-end flex-shrink-0 w-7">
                                            {!sameAuthor ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const sid =
                                                            msg.senderId?._id;
                                                        if (sid)
                                                            setViewProfileUserId(
                                                                sid,
                                                            );
                                                    }}
                                                >
                                                    <Avatar
                                                        src={
                                                            msg.senderId
                                                                ?.avatar
                                                        }
                                                        name={
                                                            msg.senderId
                                                                ?.name || "U"
                                                        }
                                                        size="sm"
                                                    />
                                                </button>
                                            ) : null}
                                        </div>
                                    )}
                                    <div
                                        className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}
                                    >
                                        {!isMine &&
                                            !isPrivate &&
                                            !sameAuthor && (
                                                <span className="text-[10px] text-gray-500 ml-1 mb-0.5 font-medium">
                                                    {msg.senderId?.name}
                                                </span>
                                            )}
                                        {/* reply preview */}
                                        {msg.replyTo && (
                                            <div
                                                className={`mb-1 px-3 py-1.5 rounded-lg border-l-2 border-blue-400 bg-blue-50/80 text-xs text-gray-500 max-w-xs`}
                                            >
                                                <div className="font-medium text-blue-600">
                                                    {msg.replyTo.senderId?.name}
                                                </div>
                                                <div className="truncate">
                                                    {msg.replyTo.content}
                                                </div>
                                            </div>
                                        )}
                                        {/* bubble */}
                                        <div
                                            className={`relative px-4 py-2.5 rounded-2xl shadow-sm transition-all ${
                                                isMine
                                                    ? "bg-blue-600 text-white rounded-tr-none"
                                                    : isMentioned
                                                      ? "bg-yellow-50 text-gray-800 rounded-tl-none border border-yellow-200"
                                                      : "bg-white text-gray-800 rounded-tl-none border border-gray-100"
                                            }`}
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                if (!msg.isDeleted)
                                                    setContextMenu({
                                                        x: e.clientX,
                                                        y: e.clientY,
                                                        msg,
                                                    });
                                            }}
                                        >
                                            {msg.type === "file" &&
                                            !msg.isDeleted ? (
                                                <div className="flex flex-col gap-2">
                                                    {msg.attachments?.map(
                                                        (
                                                            a: any,
                                                            ai: number,
                                                        ) => (
                                                            <a
                                                                key={ai}
                                                                href={a.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="flex items-center gap-3 p-2 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors border border-gray-100 group/file"
                                                            >
                                                                <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center flex-shrink-0 group-hover/file:bg-blue-600 group-hover/file:text-white transition-colors">
                                                                    <FileIcon
                                                                        size={
                                                                            20
                                                                        }
                                                                    />
                                                                </div>
                                                                <div className="flex flex-col min-w-0">
                                                                    <span className="text-sm font-medium text-gray-800 truncate pr-2">
                                                                        {a.filename ||
                                                                            a.originalName ||
                                                                            "Tệp đính kèm"}
                                                                    </span>
                                                                    <span className="text-[10px] text-gray-500 uppercase flex items-center gap-1">
                                                                        {a.filename
                                                                            ?.split(
                                                                                ".",
                                                                            )
                                                                            .pop() ||
                                                                            "FILE"}{" "}
                                                                        •{" "}
                                                                        {formatFileSize(
                                                                            a.size ||
                                                                                0,
                                                                        )}
                                                                    </span>
                                                                </div>
                                                                <div className="ml-auto opacity-0 group-hover/file:opacity-100 transition-opacity">
                                                                    <ExternalLink
                                                                        size={
                                                                            14
                                                                        }
                                                                        className="text-gray-400"
                                                                    />
                                                                </div>
                                                            </a>
                                                        ),
                                                    )}
                                                </div>
                                            ) : msg.type === "media" &&
                                              !msg.isDeleted ? (
                                                <div className="grid grid-cols-2 gap-1.5 max-w-[320px]">
                                                    {msg.attachments?.map(
                                                        (
                                                            a: any,
                                                            ai: number,
                                                        ) => {
                                                            const attachments =
                                                                msg.attachments ||
                                                                [];
                                                            const isSingle =
                                                                attachments.length ===
                                                                1;
                                                            return (
                                                                <div
                                                                    key={ai}
                                                                    className={`relative group/media overflow-hidden rounded-xl border border-gray-100 bg-black shadow-inner ${isSingle ? "col-span-2" : "col-span-1"}`}
                                                                >
                                                                    {a.type ===
                                                                        "video" ||
                                                                    a.mimetype?.startsWith(
                                                                        "video/",
                                                                    ) ||
                                                                    a.mimeType?.startsWith(
                                                                        "video/",
                                                                    ) ? (
                                                                        <video
                                                                            src={
                                                                                a.url
                                                                            }
                                                                            controls
                                                                            preload="metadata"
                                                                            className="w-full h-full max-h-80 object-contain mx-auto"
                                                                        />
                                                                    ) : (
                                                                        <img
                                                                            src={
                                                                                a.url
                                                                            }
                                                                            alt="media"
                                                                            className="w-full h-full max-h-80 object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                                                                            onClick={() =>
                                                                                setImageViewer(
                                                                                    {
                                                                                        images:
                                                                                            msg.attachments ||
                                                                                            [],
                                                                                        startIndex:
                                                                                            ai,
                                                                                    },
                                                                                )
                                                                            }
                                                                        />
                                                                    )}
                                                                    <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-black/40 translate-y-full group-hover/media:translate-y-0 transition-transform flex justify-between items-center">
                                                                        <span className="text-[9px] text-white font-medium truncate pr-2">
                                                                            {a.filename ||
                                                                                a.originalName ||
                                                                                "Image"}
                                                                        </span>
                                                                        <span className="text-[9px] text-white/80 flex-shrink-0">
                                                                            {formatFileSize(
                                                                                a.size ||
                                                                                    0,
                                                                            )}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        },
                                                    )}
                                                    {msg.content && (
                                                        <p className="col-span-2 text-xs mt-1 opacity-80">
                                                            {msg.content}
                                                        </p>
                                                    )}
                                                </div>
                                            ) : msg.type === "voice" &&
                                              !msg.isDeleted &&
                                              msg.attachments?.[0]?.url ? (
                                                <MessageErrorBoundary isMine={isMine}>
                                                    <VoiceMessagePlayer
                                                        src={msg.attachments[0].url}
                                                        isMine={isMine}
                                                        initialDuration={
                                                            msg.attachments[0].duration ?? 0
                                                        }
                                                    />
                                                </MessageErrorBoundary>
                                            ) : msg.type === "call" &&
                                              !msg.isDeleted ? (
                                                <MessageErrorBoundary isMine={isMine}>
                                                    {renderCallMessage(
                                                        msg,
                                                        isMine,
                                                        isPrivateChat ? onStartCall : undefined,
                                                        isGroupChat ? onStartGroupCall : undefined,
                                                    )}
                                                </MessageErrorBoundary>
                                            ) : (
                                                <div className="flex flex-col gap-2">
                                                    <span className="break-words">
                                                        {renderMessageContent(
                                                            msg.content,
                                                            isMine,
                                                        )}
                                                    </span>
                                                    {/* link Previews */}
                                                    {!msg.isDeleted &&
                                                        msg.linkPreviews &&
                                                        msg.linkPreviews
                                                            .length > 0 && (
                                                            <div className="mt-2 space-y-2">
                                                                {msg.linkPreviews.map(
                                                                    (
                                                                        lp: any,
                                                                        lpi: number,
                                                                    ) => (
                                                                        <a
                                                                            key={
                                                                                lpi
                                                                            }
                                                                            href={
                                                                                lp.url
                                                                            }
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className={`block overflow-hidden rounded-xl border ${isMine ? "bg-white/10 border-white/20" : "bg-gray-50 border-gray-100"} hover:opacity-90 transition-opacity`}
                                                                        >
                                                                            {lp.image && (
                                                                                <img
                                                                                    src={
                                                                                        lp.image
                                                                                    }
                                                                                    alt={
                                                                                        lp.title
                                                                                    }
                                                                                    className="w-full h-32 object-cover"
                                                                                />
                                                                            )}
                                                                            <div className="p-2.5">
                                                                                <div
                                                                                    className={`text-[9px] font-black uppercase tracking-wider mb-1 ${isMine ? "text-white/70" : "text-blue-600"}`}
                                                                                >
                                                                                    {lp.siteName ||
                                                                                        (() => {
                                                                                            try {
                                                                                                return new URL(lp.url).hostname.replace(/^www\./, "");
                                                                                            } catch {
                                                                                                return "";
                                                                                            }
                                                                                        })()}
                                                                                </div>
                                                                                <div
                                                                                    className={`text-xs font-bold line-clamp-2 mb-1 ${isMine ? "text-white" : "text-gray-900"}`}
                                                                                >
                                                                                    {
                                                                                        lp.title
                                                                                    }
                                                                                </div>
                                                                                {lp.description && (
                                                                                    <div
                                                                                        className={`text-[10px] line-clamp-2 ${isMine ? "text-white/70" : "text-gray-500"}`}
                                                                                    >
                                                                                        {
                                                                                            lp.description
                                                                                        }
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </a>
                                                                    ),
                                                                )}
                                                            </div>
                                                        )}
                                                </div>
                                            )}
                                            {msg.isEdited && !msg.isDeleted && (
                                                <span className="text-[9px] ml-1 opacity-60">
                                                    (đã sửa)
                                                </span>
                                            )}
                                            {msg.isPinned && (
                                                <span className="ml-1 text-[9px] opacity-60">
                                                    📌
                                                </span>
                                            )}

                                            {/* hover action bar */}
                                            {!msg.isDeleted && (
                                                <div
                                                    className={`absolute -top-7 ${isMine ? "right-0" : "left-0"} hidden group-hover:flex bg-white rounded-full shadow-md border border-gray-100 px-1 py-0.5 gap-0.5 z-20`}
                                                >
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setEmojiPickerMsg(
                                                                msg._id,
                                                            );
                                                        }}
                                                        className="p-1 hover:bg-gray-100 rounded-full text-gray-500"
                                                        title="Cảm xúc"
                                                    >
                                                        <Smile size={13} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setReplyTo(msg);
                                                        }}
                                                        className="p-1 hover:bg-gray-100 rounded-full text-gray-500"
                                                        title="Trả lời"
                                                    >
                                                        <Reply size={13} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openForwardModal(
                                                                msg,
                                                            );
                                                        }}
                                                        className="p-1 hover:bg-gray-100 rounded-full text-gray-500"
                                                        title="Chuyển tiếp"
                                                    >
                                                        <Forward size={13} />
                                                    </button>
                                                    {isMine && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setEditingMsg(
                                                                    msg,
                                                                );
                                                                setEditContent(
                                                                    msg.content,
                                                                );
                                                            }}
                                                            className="p-1 hover:bg-gray-100 rounded-full text-gray-500"
                                                            title="Sửa"
                                                        >
                                                            <Edit2 size={13} />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setContextMenu({
                                                                x: e.clientX,
                                                                y: e.clientY,
                                                                msg,
                                                            });
                                                        }}
                                                        className="p-1 hover:bg-gray-100 rounded-full text-gray-500"
                                                        title="Thêm"
                                                    >
                                                        <MoreVertical
                                                            size={13}
                                                        />
                                                    </button>
                                                </div>
                                            )}

                                            {/* emoji picker */}
                                            {emojiPickerMsg === msg._id && (
                                                <div
                                                    className={`absolute z-40 ${isMine ? "right-0" : "left-0"} bottom-full mb-1 bg-white rounded-full shadow-xl border border-gray-100 px-2 py-1 flex gap-1`}
                                                    onClick={(e) =>
                                                        e.stopPropagation()
                                                    }
                                                >
                                                    {EMOJIS.map((em) => (
                                                        <button
                                                            key={em}
                                                            onClick={() =>
                                                                handleReact(
                                                                    msg._id,
                                                                    em,
                                                                )
                                                            }
                                                            className="text-lg hover:scale-125 transition-transform"
                                                        >
                                                            {em}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* reactions */}
                                        {Object.keys(grouped).length > 0 && (
                                            <div
                                                className={`flex flex-wrap gap-0.5 mt-0.5 ${isMine ? "justify-end" : "justify-start"}`}
                                            >
                                                {Object.entries(grouped).map(
                                                    ([em, cnt]) => {
                                                        const myReaction = (
                                                            msg.reactions || []
                                                        ).find((r) => {
                                                            const rUserId =
                                                                typeof r.userId ===
                                                                "object"
                                                                    ? r.userId
                                                                          ._id
                                                                    : r.userId;
                                                            return (
                                                                rUserId ===
                                                                    user?.sub &&
                                                                r.emoji === em
                                                            );
                                                        });
                                                        return (
                                                            <button
                                                                key={em}
                                                                onClick={() =>
                                                                    myReaction
                                                                        ? handleUnreact(
                                                                              msg._id,
                                                                          )
                                                                        : handleReact(
                                                                              msg._id,
                                                                              em,
                                                                          )
                                                                }
                                                                className={`text-xs border rounded-full px-1.5 py-0.5 shadow-sm transition-colors ${myReaction ? "bg-blue-50 border-blue-300" : "bg-white border-gray-200 hover:bg-gray-50"}`}
                                                            >
                                                                {em}{" "}
                                                                {String(cnt)}
                                                            </button>
                                                        );
                                                    },
                                                )}
                                            </div>
                                        )}

                                        {/* time + seen */}
                                        <div
                                            className={`flex items-center gap-1 mt-0.5 ${isMine ? "flex-row-reverse" : "flex-row"}`}
                                        >
                                            <span className="text-[10px] text-gray-400">
                                                {formatTime(msg.createdAt)}
                                            </span>
                                            {isMine &&
                                                msg.seenBy &&
                                                msg.seenBy.length > 0 && (
                                                    <div className="flex -space-x-1">
                                                        {msg.seenBy
                                                            .filter(
                                                                (s: any) =>
                                                                    s._id !==
                                                                    user?.sub,
                                                            )
                                                            .slice(0, 3)
                                                            .map(
                                                                (
                                                                    s: any,
                                                                    i: number,
                                                                ) => (
                                                                    <img
                                                                        key={i}
                                                                        src={
                                                                            s.avatar ||
                                                                            "https://ui-avatars.com/api/?name=" +
                                                                                encodeURIComponent(
                                                                                    s.name ||
                                                                                        "U",
                                                                                )
                                                                        }
                                                                        alt={
                                                                            s.name
                                                                        }
                                                                        title={`Đã xem bởi ${s.name}`}
                                                                        className="w-3.5 h-3.5 rounded-full border border-white"
                                                                    />
                                                                ),
                                                            )}
                                                    </div>
                                                )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}

                {/* typing indicator */}
                {isTyping && (
                    <div className="flex justify-start">
                        <div className="bg-white px-4 py-2.5 rounded-2xl shadow-sm border border-gray-100 flex gap-1 items-center rounded-bl-sm">
                            {[0, 0.15, 0.3].map((d, i) => (
                                <span
                                    key={i}
                                    className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                                    style={{ animationDelay: `${d}s` }}
                                />
                            ))}
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* mention Jump Button */}
            {mentionIndices.length > 0 && (
                <button
                    onClick={jumpToMention}
                    className="absolute bottom-32 right-6 p-3 bg-yellow-500 text-white rounded-full shadow-xl hover:bg-yellow-600 transition-all active:scale-95 flex items-center gap-2 z-30 animate-in fade-in slide-in-from-bottom-4"
                    title="Xem các lượt nhắc tên"
                >
                    <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center font-black text-sm">
                        @
                    </div>
                    <span className="text-xs font-black pr-1">
                        {mentionIndices.length} nhắc tên
                    </span>
                </button>
            )}

            {/* context menu */}
            {contextMenu && contextMenu.x > 0 && (
                <div
                    className="fixed bg-white border border-gray-100 shadow-xl rounded-xl py-1.5 w-48 z-50 animate-in fade-in zoom-in-95"
                    style={{
                        top: Math.min(contextMenu.y, window.innerHeight - 250),
                        left: Math.min(contextMenu.x, window.innerWidth - 200),
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        onClick={() => {
                            setEmojiPickerMsg(contextMenu.msg._id);
                            setContextMenu(null);
                        }}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                    >
                        <Smile size={14} /> Cảm xúc
                    </button>
                    <button
                        onClick={() => {
                            setReplyTo(contextMenu.msg);
                            setContextMenu(null);
                        }}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                    >
                        <Reply size={14} /> Trả lời
                    </button>
                    <button
                        onClick={() => {
                            openForwardModal(contextMenu.msg);
                        }}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                    >
                        <Forward size={14} /> Chuyển tiếp
                    </button>
                    {(contextMenu.msg.senderId?._id ||
                        contextMenu.msg.senderId) === user?.sub && (
                        <button
                            onClick={() => {
                                setEditingMsg(contextMenu.msg);
                                setEditContent(contextMenu.msg.content);
                                setContextMenu(null);
                            }}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                        >
                            <Edit2 size={14} /> Chỉnh sửa
                        </button>
                    )}
                    {contextMenu.msg.isPinned ? (
                        <button
                            onClick={() => handleUnpin(contextMenu.msg)}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                        >
                            <PinOff size={14} /> Bỏ ghim
                        </button>
                    ) : (
                        <button
                            onClick={() => handlePin(contextMenu.msg)}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                        >
                            <Pin size={14} /> Ghim
                        </button>
                    )}
                    <div className="h-px bg-gray-100 my-1" />
                    {(contextMenu.msg.senderId?._id ||
                        contextMenu.msg.senderId) === user?.sub && (
                        <button
                            onClick={() =>
                                handleDelete(contextMenu.msg, "everyone")
                            }
                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                        >
                            <Trash2 size={14} /> Thu hồi
                        </button>
                    )}
                    <button
                        onClick={() => handleDelete(contextMenu.msg, "self")}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                    >
                        <X size={14} /> Xóa phía tôi
                    </button>
                </div>
            )}

            {/* reply/Edit/Files Queue banner */}
            {(replyTo || editingMsg || filesQueue.length > 0) && (
                <div className="px-4 py-2 bg-blue-50 border-t border-blue-100 flex items-center justify-between animate-in slide-in-from-bottom-2">
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                        {replyTo || editingMsg ? (
                            <div className="text-xs text-blue-700">
                                <span className="font-bold">
                                    {editingMsg
                                        ? "✏️ Chỉnh sửa"
                                        : `↩ Trả lời ${replyTo?.senderId?.name}`}
                                </span>
                                <div className="truncate text-gray-500 max-w-sm">
                                    {editingMsg
                                        ? editContent
                                        : replyTo?.content}
                                </div>
                            </div>
                        ) : null}

                        {filesQueue.length > 0 && (
                            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                                {filesQueue.map((item, idx) => (
                                    <div
                                        key={idx}
                                        className="relative flex-shrink-0 group/q"
                                    >
                                        <div className="w-12 h-12 rounded-lg bg-white border border-blue-200 flex items-center justify-center overflow-hidden shadow-sm">
                                            {item.type === "media" &&
                                            item.file.type.startsWith(
                                                "image/",
                                            ) ? (
                                                <img
                                                    src={URL.createObjectURL(
                                                        item.file,
                                                    )}
                                                    className="w-full h-full object-cover"
                                                    alt="preview"
                                                />
                                            ) : item.type === "media" &&
                                              item.file.type.startsWith(
                                                  "video/",
                                              ) ? (
                                                <div className="relative w-full h-full bg-black flex items-center justify-center">
                                                    <video
                                                        src={URL.createObjectURL(
                                                            item.file,
                                                        )}
                                                        className="w-full h-full object-cover opacity-60"
                                                    />
                                                    <Video
                                                        size={16}
                                                        className="absolute text-white"
                                                    />
                                                </div>
                                            ) : (
                                                <FileIcon
                                                    size={20}
                                                    className="text-blue-500"
                                                />
                                            )}
                                        </div>
                                        <button
                                            onClick={() =>
                                                setFilesQueue((prev) =>
                                                    prev.filter(
                                                        (_, i) => i !== idx,
                                                    ),
                                                )
                                            }
                                            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow-md opacity-0 group-hover/q:opacity-100 transition-opacity"
                                        >
                                            <X size={10} />
                                        </button>
                                        <span className="absolute -bottom-1 left-0 right-0 text-[8px] bg-black/50 text-white text-center truncate px-0.5 rounded-b-lg">
                                            {formatFileSize(item.file.size)}
                                        </span>
                                    </div>
                                ))}
                                <span className="text-[10px] text-blue-600 font-bold ml-2 whitespace-nowrap">
                                    {filesQueue.length} tệp đã chọn
                                </span>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => {
                            setReplyTo(null);
                            setEditingMsg(null);
                            setEditContent("");
                            setFilesQueue([]);
                        }}
                        className="text-gray-400 hover:text-gray-600 ml-4"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* input */}
            <div className="px-4 py-3 bg-white border-t border-gray-100 flex-shrink-0 relative">
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, "file")}
                />
                <input
                    ref={mediaInputRef}
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, "media")}
                />

                {isRecording ? (
                    <div className="flex items-center gap-4 bg-red-50 p-2 rounded-xl border border-red-100 animate-in slide-in-from-bottom-2">
                        <div className="flex items-center gap-2 flex-1">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                            <span className="text-sm font-bold text-red-600">
                                Đang ghi âm...
                            </span>
                            <div className="flex-1 h-1 bg-red-200 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-red-500 animate-progress"
                                    style={{
                                        width: `${(recordingDuration % 10) * 10}%`,
                                    }}
                                />
                            </div>
                            <span className="text-xs font-mono text-red-500">
                                {Math.floor(recordingDuration / 60)}:
                                {String(recordingDuration % 60).padStart(
                                    2,
                                    "0",
                                )}
                            </span>
                        </div>
                        <button
                            onClick={stopVoiceRecording}
                            className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-sm transition-all active:scale-95"
                        >
                            <MicOff size={18} />
                        </button>
                    </div>
                ) : (
                    <form
                        onSubmit={handleSend}
                        className="flex items-center gap-2"
                    >
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-colors"
                        >
                            <FileIcon size={18} />
                        </button>
                        <button
                            type="button"
                            onClick={() => mediaInputRef.current?.click()}
                            className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-colors"
                        >
                            <Image size={18} />
                        </button>
                        <input
                            type="text"
                            value={editingMsg ? editContent : newMessage}
                            onChange={handleInputChange}
                            onKeyDown={(e) => {
                                if (showMentionList) {
                                    const filtered =
                                        conversationInfo?.participants?.filter(
                                            (p: any) =>
                                                p.userId?._id !== user?.sub &&
                                                p.userId?.name
                                                    ?.toLowerCase()
                                                    .includes(
                                                        mentionSearch.toLowerCase(),
                                                    ),
                                        ) || [];

                                    if (e.key === "ArrowDown") {
                                        e.preventDefault();
                                        setSelectedMentionIndex(
                                            (prev) =>
                                                (prev + 1) % filtered.length,
                                        );
                                    } else if (e.key === "ArrowUp") {
                                        e.preventDefault();
                                        setSelectedMentionIndex(
                                            (prev) =>
                                                (prev - 1 + filtered.length) %
                                                filtered.length,
                                        );
                                    } else if (
                                        e.key === "Enter" &&
                                        filtered.length > 0
                                    ) {
                                        e.preventDefault();
                                        insertMention(
                                            filtered[selectedMentionIndex],
                                        );
                                    } else if (e.key === "Escape") {
                                        setShowMentionList(false);
                                    }
                                }
                            }}
                            placeholder={
                                editingMsg
                                    ? "Chỉnh sửa tin nhắn..."
                                    : filesQueue.length > 0
                                      ? "Nhấn gửi để tải lên các tệp..."
                                      : "Nhập tin nhắn..."
                            }
                            className="flex-1 px-4 py-2.5 bg-gray-100 focus:bg-white rounded-xl border border-transparent focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 outline-none text-sm transition-all"
                            disabled={isSending}
                        />
                        {/* voice recording button */}
                        <button
                            type="button"
                            onClick={startVoiceRecording}
                            className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-all"
                            title="Ghi âm giọng nói"
                        >
                            <Mic size={18} />
                        </button>
                        <button
                            type="submit"
                            disabled={
                                (!(
                                    editingMsg ? editContent : newMessage
                                ).trim() &&
                                    filesQueue.length === 0) ||
                                isSending
                            }
                            className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-xl transition-all shadow-md active:scale-95"
                        >
                            {isSending ? (
                                <Loader2 className="animate-spin" size={18} />
                            ) : (
                                <Send size={18} />
                            )}
                        </button>
                    </form>
                )}

                {/* mention List */}
                {showMentionList && conversationInfo?.type === "group" && (
                    <div className="absolute bottom-full left-4 mb-2 w-72 bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-gray-100 py-2 z-[60] animate-in slide-in-from-bottom-2">
                        <div className="px-4 py-2 text-[10px] font-black text-blue-600 uppercase tracking-widest border-b border-gray-50 mb-1">
                            Nhắc tên thành viên
                        </div>
                        <div className="max-h-64 overflow-y-auto custom-scrollbar">
                            {conversationInfo.participants
                                ?.filter(
                                    (p: any) =>
                                        p.userId?._id !== user?.sub &&
                                        (p.userId?.name
                                            ?.toLowerCase()
                                            .includes(
                                                mentionSearch.toLowerCase(),
                                            ) ||
                                            mentionSearch === ""),
                                )
                                .map((p: any, idx: number) => (
                                    <button
                                        key={p.userId?._id}
                                        type="button"
                                        onClick={() => insertMention(p)}
                                        className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${idx === selectedMentionIndex ? "bg-blue-50" : "hover:bg-gray-50"}`}
                                    >
                                        <Avatar
                                            src={p.userId?.avatar}
                                            name={p.userId?.name}
                                            size="xs"
                                        />
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium text-gray-700">
                                                {p.userId?.name}
                                            </span>
                                            <span className="text-[10px] text-gray-400">
                                                @{p.userId?.username || "user"}
                                            </span>
                                        </div>
                                    </button>
                                ))}
                            {conversationInfo.participants.filter(
                                (p: any) =>
                                    p.userId?._id !== user?.sub &&
                                    p.userId?.name
                                        ?.toLowerCase()
                                        .includes(mentionSearch.toLowerCase()),
                            ).length === 0 && (
                                <div className="px-4 py-3 text-sm text-gray-400 italic">
                                    Không tìm thấy thành viên
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* forward Modal */}
            {forwardMsg && (
                <div
                    className="absolute inset-0 bg-black/30 z-50 flex items-center justify-center"
                    onClick={() => {
                        setForwardMsg(null);
                        setForwardTargets([]);
                    }}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl w-96 max-h-[70vh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                            <span className="font-bold text-gray-800">
                                Chuyển tiếp tin nhắn
                            </span>
                            <button
                                onClick={() => {
                                    setForwardMsg(null);
                                    setForwardTargets([]);
                                }}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="px-4 py-2 text-xs bg-gray-50 border-b border-gray-100 truncate text-gray-500">
                            "{forwardMsg.content || "File/Media"}"
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-1">
                            {allConversations.map((c: any) => {
                                const isPriv = c.type === "private";
                                const name = isPriv
                                    ? c.participants?.find(
                                          (p: any) =>
                                              (p.userId?._id || p.userId) !==
                                              user?.sub,
                                      )?.userId?.name || "Người dùng"
                                    : c.name;
                                const selected = forwardTargets.includes(c._id);
                                return (
                                    <button
                                        key={c._id}
                                        onClick={() =>
                                            setForwardTargets((prev) =>
                                                selected
                                                    ? prev.filter(
                                                          (id) => id !== c._id,
                                                      )
                                                    : [...prev, c._id],
                                            )
                                        }
                                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${selected ? "bg-blue-50 border border-blue-200" : "hover:bg-gray-50 border border-transparent"}`}
                                    >
                                        <div
                                            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center text-xs ${selected ? "bg-blue-500 border-blue-500 text-white" : "border-gray-300"}`}
                                        >
                                            {selected && <Check size={12} />}
                                        </div>
                                        <span className="text-sm font-medium text-gray-700 truncate">
                                            {name}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    setForwardMsg(null);
                                    setForwardTargets([]);
                                }}
                                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl"
                            >
                                Hủy
                            </button>
                            <button
                                onClick={handleForward}
                                disabled={!forwardTargets.length}
                                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
                            >
                                Gửi ({forwardTargets.length})
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* image Viewer Modal */}
            {imageViewer && (
                <div
                    className="fixed inset-0 z-[100] bg-black/95 flex flex-col"
                    onClick={() => setImageViewer(null)}
                >
                    <div className="flex justify-between items-center p-4 text-white z-10">
                        <div className="flex flex-col">
                            <span className="font-medium">
                                {imageViewer.images[imageViewer.startIndex]
                                    ?.fileName || "Hình ảnh"}
                            </span>
                            <span className="text-xs text-white/70">
                                {formatFileSize(
                                    imageViewer.images[imageViewer.startIndex]
                                        ?.fileSize || 0,
                                )}{" "}
                                • {imageViewer.startIndex + 1} /{" "}
                                {imageViewer.images.length}
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(
                                        imageViewer.images[
                                            imageViewer.startIndex
                                        ]?.url ||
                                            imageViewer.images[
                                                imageViewer.startIndex
                                            ]?.fileUrl,
                                        "_blank",
                                    );
                                }}
                                title="Mở trong thẻ mới"
                            >
                                <ExternalLink size={20} />
                            </button>
                            <button
                                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                                onClick={() => setImageViewer(null)}
                            >
                                <X size={24} />
                            </button>
                        </div>
                    </div>
                    <div
                        className="flex-1 flex items-center justify-center p-4 relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            className="absolute left-6 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full disabled:opacity-0 transition-all"
                            disabled={imageViewer.startIndex === 0}
                            onClick={() =>
                                setImageViewer((prev) =>
                                    prev
                                        ? {
                                              ...prev,
                                              startIndex: prev.startIndex - 1,
                                          }
                                        : null,
                                )
                            }
                        >
                            <ChevronLeft size={28} />
                        </button>
                        {imageViewer.images[imageViewer.startIndex]?.type ===
                            "video" ||
                        imageViewer.images[
                            imageViewer.startIndex
                        ]?.mimetype?.startsWith("video/") ||
                        imageViewer.images[
                            imageViewer.startIndex
                        ]?.mimeType?.startsWith("video/") ? (
                            <video
                                src={
                                    imageViewer.images[imageViewer.startIndex]
                                        ?.url ||
                                    imageViewer.images[imageViewer.startIndex]
                                        ?.fileUrl
                                }
                                controls
                                autoPlay
                                className="max-w-full max-h-[85vh] object-contain rounded-sm shadow-2xl"
                            />
                        ) : (
                            <img
                                src={
                                    imageViewer.images[imageViewer.startIndex]
                                        ?.url ||
                                    imageViewer.images[imageViewer.startIndex]
                                        ?.fileUrl
                                }
                                alt="viewer"
                                className="max-w-full max-h-[85vh] object-contain rounded-sm shadow-2xl"
                            />
                        )}
                        <button
                            className="absolute right-6 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full disabled:opacity-0 transition-all"
                            disabled={
                                imageViewer.startIndex ===
                                imageViewer.images.length - 1
                            }
                            onClick={() =>
                                setImageViewer((prev) =>
                                    prev
                                        ? {
                                              ...prev,
                                              startIndex: prev.startIndex + 1,
                                          }
                                        : null,
                                )
                            }
                        >
                            <ChevronRight size={28} />
                        </button>
                    </div>
                </div>
            )}

            {viewProfileUserId && (
                <UserProfileModal
                    userId={viewProfileUserId}
                    onClose={() => setViewProfileUserId(null)}
                />
            )}
        </div>
    );
};

export default ChatArea;