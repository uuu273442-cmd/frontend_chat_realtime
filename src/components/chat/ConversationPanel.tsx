import React, { useState, useEffect } from "react";
import {
    X,
    User,
    Image as ImageIcon,
    File,
    Link,
    Users,
    Pin,
    Download,
    ExternalLink,
    Loader2,
    BellOff,
    Shield,
    UserMinus,
    LogOut,
    Trash2,
    UserPlus,
    Clock,
} from "lucide-react";
import { conversationService } from "../../services/conversationService";
import Avatar from "../ui/Avatar";
import UserProfileModal from "./UserProfileModal";
import toast from "react-hot-toast";
import AddMemberModal from "./AddMemberModal";

type Tab =
    | "info"
    | "media"
    | "file"
    | "link"
    | "members"
    | "pins";

interface ConversationPanelProps {
    conversationId: string;
    conversationInfo: any;
    currentUserId: string;
    onClose: () => void;
    onConversationAction?: () => void;
    onRefresh?: () => void;
    pendingMemberRequests?: number;
    reloadPendingTrigger?: number;
    onMembersTabOpen?: () => void;
}

const ConversationPanel: React.FC<ConversationPanelProps> = ({
    conversationId,
    conversationInfo,
    currentUserId,
    onClose,
    onConversationAction,
    onRefresh,
    pendingMemberRequests = 0,
    reloadPendingTrigger = 0,
    onMembersTabOpen,
}) => {
    const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
    const [tab, setTab] = useState<Tab>("info");
    const [media, setMedia] = useState<any[]>([]);
    const [files, setFiles] = useState<any[]>([]);
    const [links, setLinks] = useState<any[]>([]);
    const [pins, setPins] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [viewProfileUserId, setViewProfileUserId] = useState<
        string | null
    >(null);
    const [pendingRequests, setPendingRequests] = useState<any[]>([]);
    const [isPendingLoading, setIsPendingLoading] = useState(false);

    // backend returns { year: { month: [items] } }
    const flattenHashTable = (data: any): any[] => {
        if (Array.isArray(data)) return data;
        if (!data || typeof data !== "object") return [];
        const result: any[] = [];
        for (const year of Object.values(data)) {
            if (year && typeof year === "object") {
                for (const monthItems of Object.values(
                    year as Record<string, any>,
                )) {
                    if (Array.isArray(monthItems)) result.push(...monthItems);
                }
            }
        }
        return result;
    };

    const isGroup = conversationInfo?.type === "group";
    const isPrivate = conversationInfo?.type === "private";
    const currentRole = conversationInfo?.participants?.find(
        (p: any) => (p.userId?._id || p.userId) === currentUserId,
    )?.role;
    const isOwner = currentRole === "owner";
    const isAdmin = currentRole === "admin" || isOwner;

    const otherUser = isPrivate
        ? conversationInfo?.participants?.find(
              (p: any) => (p.userId?._id || p.userId) !== currentUserId,
          )?.userId
        : null;
    const displayName = isPrivate
        ? otherUser?.name || "Người dùng"
        : conversationInfo?.name;

    useEffect(() => {
        if (tab === "media") loadMedia();
        else if (tab === "file") loadFiles();
        else if (tab === "link") loadLinks();
        else if (tab === "pins") loadPins();
        else if (tab === "members") loadPendingRequests();
    }, [tab, conversationId]);

    // khi socket fire group_join_requested → reload pending list ngay (kể cả khi panel đang mở)
    useEffect(() => {
        if (reloadPendingTrigger > 0 && isGroup) {
            loadPendingRequests();
        }
    }, [reloadPendingTrigger]);

    const loadMedia = async () => {
        setIsLoading(true);
        try {
            const data = await conversationService.getInfoMedia(conversationId);
            setMedia(flattenHashTable(data));
        } catch {
            toast.error("Không thể tải media");
        } finally {
            setIsLoading(false);
        }
    };

    const loadFiles = async () => {
        setIsLoading(true);
        try {
            const data = await conversationService.getInfoFile(conversationId);
            setFiles(flattenHashTable(data));
        } catch {
            toast.error("Không thể tải file");
        } finally {
            setIsLoading(false);
        }
    };

    const loadLinks = async () => {
        setIsLoading(true);
        try {
            const data =
                await conversationService.getInfoLinkPreview(conversationId);
            setLinks(flattenHashTable(data));
        } catch {
            toast.error("Không thể tải liên kết");
        } finally {
            setIsLoading(false);
        }
    };

    const loadPins = async () => {
        setIsLoading(true);
        try {
            const data = await conversationService.getPins(conversationId);
            setPins(data || []);
        } catch {
            toast.error("Không thể tải tin nhắn ghim");
        } finally {
            setIsLoading(false);
        }
    };

    const loadPendingRequests = async () => {
        setIsPendingLoading(true);
        try {
            const data = await conversationService.listJoinRequests(conversationId);
            setPendingRequests(data || []);
        } catch {
            // không toast
        } finally {
            setIsPendingLoading(false);
        }
    };

    const handleArchive = async () => {
        try {
            await conversationService.archiveConversation(conversationId);
            toast.success("Đã lưu trữ cuộc trò chuyện");
            onConversationAction?.();
        } catch {
            toast.error("Thao tác thất bại");
        }
    };

    const handleMute = async () => {
        try {
            await conversationService.muteConversation(conversationId, 60);
            toast.success("Đã tắt thông báo 1 giờ");
        } catch {
            toast.error("Thao tác thất bại");
        }
    };

    const handleLeave = async () => {
        if (!confirm("Bạn có chắc muốn rời nhóm?")) return;
        try {
            await conversationService.leaveGroup(conversationId);
            // socket group_left_self sẽ trigger navigate
        } catch (err: any) {
            const msg = err?.response?.data?.message;
            if (msg?.includes("owner")) {
                toast.error("Trưởng nhóm không thể rời nhóm. Hãy giải tán hoặc chuyển quyền trước.");
            } else {
                toast.error("Không thể rời nhóm");
            }
        }
    };

    const handleDisband = async () => {
        if (!confirm("Bạn có chắc muốn giải tán nhóm? Hành động này không thể hoàn tác.")) return;
        try {
            await conversationService.disbandGroup(conversationId);
            // socket group_dissolved sẽ trigger navigate cho tất cả members
        } catch {
            toast.error("Không thể giải tán nhóm");
        }
    };

    const handleRemoveMember = async (userId: string) => {
        try {
            await conversationService.removeMembers(conversationId, [userId]);
            toast.success("Đã xóa thành viên");
        } catch {
            toast.error("Thao tác thất bại");
        }
    };

    const handleChangeRole = async (
        userId: string,
        role: "admin" | "member",
    ) => {
        try {
            await conversationService.changeRole(conversationId, userId, role);
            toast.success("Đã thay đổi vai trò");
        } catch {
            toast.error("Thao tác thất bại");
        }
    };

    const TABS: { key: Tab; icon: React.ReactNode; label: string; badge?: number }[] = [
        { key: "info", icon: <User size={14} />, label: "Thông tin" },
        { key: "media", icon: <ImageIcon size={14} />, label: "Ảnh/Video" },
        { key: "file", icon: <File size={14} />, label: "File" },
        { key: "link", icon: <Link size={14} />, label: "Liên kết" },
        ...(isGroup
            ? [
                  {
                      key: "members" as Tab,
                      icon: <Users size={14} />,
                      label: "Thành viên",
                      badge: pendingMemberRequests,
                  },
              ]
            : []),
        { key: "pins", icon: <Pin size={14} />, label: "Ghim" },
    ];

    return (
        <div className="fixed inset-0 z-40 md:static md:inset-auto md:z-auto w-full md:w-80 h-full bg-white border-l border-gray-100 flex flex-col shadow-lg flex-shrink-0 animate-in slide-in-from-right duration-300">
            {/* header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span className="font-bold text-sm text-gray-800">
                    Thông tin hội thoại
                </span>
                <button
                    onClick={onClose}
                    className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"
                >
                    <X size={16} />
                </button>
            </div>

            {/* profile section */}
            <div className="flex flex-col items-center py-6 px-4 border-b border-gray-100 bg-gradient-to-b from-blue-50/50 to-white">
                <Avatar name={displayName || "?"} size="xl" />
                <div className="mt-3 font-bold text-gray-900 text-base text-center">
                    {displayName}
                </div>
                {isPrivate && otherUser?.status && (
                    <div className="mt-1 text-xs text-gray-400">
                        {otherUser.status}
                    </div>
                )}
                {isGroup && (
                    <div className="mt-1 text-xs text-gray-400">
                        {conversationInfo?.participants?.length} thành viên
                    </div>
                )}

                {/* quick actions */}
                <div className="flex gap-3 mt-4">
                    <button
                        onClick={handleMute}
                        className="flex flex-col items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                    >
                        <BellOff size={16} className="text-gray-600" />
                        <span className="text-[10px] text-gray-600 font-medium">
                            Tắt thông báo
                        </span>
                    </button>
                    <button
                        onClick={handleArchive}
                        className="flex flex-col items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                    >
                        <File size={16} className="text-gray-600" />
                        <span className="text-[10px] text-gray-600 font-medium">
                            Lưu trữ
                        </span>
                    </button>
                </div>
            </div>

            {/* tabs */}
            <div className="flex gap-0.5 p-2 bg-gray-50 border-b border-gray-100 overflow-x-auto flex-shrink-0">
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        onClick={() => {
                            setTab(t.key);
                            if (t.key === "members") onMembersTabOpen?.();
                        }}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all relative ${tab === t.key ? "bg-blue-500 text-white shadow-sm" : "text-gray-500 hover:bg-gray-200"}`}
                    >
                        {t.icon} {t.label}
                        {"badge" in t && (t as any).badge > 0 && (
                            <span className="ml-0.5 min-w-[14px] h-3.5 px-0.5 bg-orange-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                                {(t as any).badge > 9 ? "9+" : (t as any).badge}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* tab Content */}
            <div className="flex-1 overflow-y-auto">
                {isLoading ? (
                    <div className="flex justify-center py-10">
                        <Loader2
                            className="animate-spin text-blue-500"
                            size={22}
                        />
                    </div>
                ) : (
                    <>
                        {/* info tab */}
                        {tab === "info" && (
                            <div className="p-4 space-y-2">
                                {isPrivate && otherUser && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-xl">
                                            <span className="text-xs text-gray-500">
                                                Tên
                                            </span>
                                            <span className="text-xs font-semibold text-gray-800">
                                                {otherUser.name}
                                            </span>
                                        </div>
                                        {otherUser.phone && (
                                            <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-xl">
                                                <span className="text-xs text-gray-500">
                                                    Điện thoại
                                                </span>
                                                <span className="text-xs font-semibold text-gray-800">
                                                    {otherUser.phone}
                                                </span>
                                            </div>
                                        )}
                                        {otherUser.customStatusMessage && (
                                            <div className="px-3 py-2.5 bg-gray-50 rounded-xl">
                                                <div className="text-xs text-gray-500 mb-1">
                                                    Trạng thái
                                                </div>
                                                <div className="text-xs font-medium text-gray-800">
                                                    {
                                                        otherUser.customStatusMessage
                                                    }
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {isGroup && conversationInfo?.description && (
                                    <div className="px-3 py-2.5 bg-gray-50 rounded-xl">
                                        <div className="text-xs text-gray-500 mb-1">
                                            Mô tả nhóm
                                        </div>
                                        <div className="text-xs text-gray-700">
                                            {conversationInfo.description}
                                        </div>
                                    </div>
                                )}
                                {/* danger zone */}
                                <div className="mt-4 pt-4 border-t border-gray-100 space-y-1">
                                    {/* member và admin: rời nhóm. Owner: không có nút này */}
                                    {isGroup && !isOwner && (
                                        <button
                                            onClick={handleLeave}
                                            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                                        >
                                            <LogOut size={14} /> Rời nhóm
                                        </button>
                                    )}
                                    {/* owner only: giải tán nhóm */}
                                    {isGroup && isOwner && (
                                        <button
                                            onClick={handleDisband}
                                            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-red-600 hover:bg-red-50 rounded-xl transition-colors font-bold"
                                        >
                                            <Trash2 size={14} /> Giải tán nhóm
                                        </button>
                                    )}
                                    {isPrivate && (
                                        <button
                                            onClick={async () => {
                                                try {
                                                    await conversationService.removeConversation(conversationId);
                                                    onConversationAction?.();
                                                } catch {
                                                    toast.error("Không thể xóa trò chuyện");
                                                }
                                            }}
                                            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                                        >
                                            <Trash2 size={14} /> Xóa trò chuyện
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* media tab */}
                        {tab === "media" && (
                            <div className="p-3">
                                {media.length === 0 ? (
                                    <div className="py-10 text-center text-xs text-gray-400 italic">
                                        Chưa có ảnh hay video nào
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-3 gap-1">
                                        {media.map((item: any, i: number) => (
                                            <div
                                                key={i}
                                                className="aspect-square rounded-lg overflow-hidden bg-gray-100 group relative"
                                            >
                                                <img
                                                    src={
                                                        item.url || item.fileUrl
                                                    }
                                                    alt=""
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                                />
                                                <a
                                                    href={
                                                        item.url || item.fileUrl
                                                    }
                                                    download
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity text-white"
                                                >
                                                    <Download size={16} />
                                                </a>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* file tab */}
                        {tab === "file" && (
                            <div className="p-3 space-y-1">
                                {files.length === 0 ? (
                                    <div className="py-10 text-center text-xs text-gray-400 italic">
                                        Chưa có file nào
                                    </div>
                                ) : (
                                    files.map((item: any, i: number) => (
                                        <div
                                            key={i}
                                            className="flex items-center gap-2 p-2.5 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors group"
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                                                <File size={15} />
                                            </div>
                                            <div className="flex-1 overflow-hidden">
                                                <div className="text-xs font-semibold text-gray-800 truncate">
                                                    {item.fileName ||
                                                        item.name ||
                                                        "File"}
                                                </div>
                                                <div className="text-[10px] text-gray-400">
                                                    {item.fileSize
                                                        ? `${(item.fileSize / 1024).toFixed(1)} KB`
                                                        : ""}
                                                </div>
                                            </div>
                                            <a
                                                href={item.url || item.fileUrl}
                                                download
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-blue-100 rounded-lg text-blue-500 transition-all"
                                            >
                                                <Download size={13} />
                                            </a>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {/* link tab */}
                        {tab === "link" && (
                            <div className="p-3 space-y-2">
                                {links.length === 0 ? (
                                    <div className="py-10 text-center text-xs text-gray-400 italic">
                                        Chưa có liên kết nào
                                    </div>
                                ) : (
                                    links.map((item: any, i: number) => (
                                        <a
                                            key={i}
                                            href={item.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block p-3 bg-gray-50 hover:bg-blue-50 rounded-xl border border-gray-100 hover:border-blue-200 transition-all group"
                                        >
                                            {item.image && (
                                                <img
                                                    src={item.image}
                                                    alt=""
                                                    className="w-full h-24 object-cover rounded-lg mb-2"
                                                />
                                            )}
                                            <div className="text-xs font-bold text-gray-800 line-clamp-2 group-hover:text-blue-700">
                                                {item.title || item.url}
                                            </div>
                                            {item.description && (
                                                <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">
                                                    {item.description}
                                                </div>
                                            )}
                                            <div className="flex items-center gap-1 mt-1.5 text-[10px] text-blue-400">
                                                <ExternalLink size={10} />{" "}
                                                <span className="truncate">
                                                    {item.url}
                                                </span>
                                            </div>
                                        </a>
                                    ))
                                )}
                            </div>
                        )}

                        {/* members tab */}
                        {tab === "members" && isGroup && (
                            <div className="p-3 space-y-1">
                                {/* add member button */}
                                <button
                                    onClick={() => setIsAddMemberOpen(true)}
                                    className="w-full flex items-center justify-center gap-2 p-2.5 mb-3 bg-blue-50 hover:bg-blue-100/80 border border-dashed border-blue-300 hover:border-blue-400 rounded-xl text-xs font-bold text-blue-600 transition-all shadow-sm"
                                >
                                    <UserPlus size={14} />
                                    Thêm thành viên mới
                                </button>

                                {(conversationInfo?.participants || []).map(
                                    (p: any) => {
                                        const member = p.userId;
                                        const memberId = member?._id || member;
                                        const isSelf =
                                            memberId === currentUserId;
                                        return (
                                            <div
                                                key={memberId}
                                                className="flex items-center gap-2.5 p-2.5 hover:bg-gray-50 rounded-xl group"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (
                                                            memberId &&
                                                            !isSelf
                                                        )
                                                            setViewProfileUserId(
                                                                memberId,
                                                            );
                                                    }}
                                                >
                                                    <Avatar
                                                        src={member?.avatar}
                                                        name={
                                                            member?.name ||
                                                            "U"
                                                        }
                                                        size="sm"
                                                    />
                                                </button>
                                                <div className="flex-1 overflow-hidden">
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-sm font-semibold text-gray-800 truncate">
                                                            {member?.name}
                                                            {isSelf && " (Bạn)"}
                                                        </span>
                                                        {p.role === "owner" && (
                                                            <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-bold">
                                                                Trưởng nhóm
                                                            </span>
                                                        )}
                                                        {p.role === "admin" && (
                                                            <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">
                                                                Phó nhóm
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                {isAdmin &&
                                                    !isSelf &&
                                                    p.role !== "owner" && (
                                                        <div className="hidden group-hover:flex gap-1">
                                                            {isOwner && (
                                                                <button
                                                                    onClick={() =>
                                                                        handleChangeRole(
                                                                            memberId,
                                                                            p.role ===
                                                                                "admin"
                                                                                ? "member"
                                                                                : "admin",
                                                                        )
                                                                    }
                                                                    className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg"
                                                                    title={
                                                                        p.role ===
                                                                        "admin"
                                                                            ? "Hạ xuống thành viên"
                                                                            : "Phong làm phó nhóm"
                                                                    }
                                                                >
                                                                    <Shield
                                                                        size={
                                                                            13
                                                                        }
                                                                    />
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() =>
                                                                    handleRemoveMember(
                                                                        memberId,
                                                                    )
                                                                }
                                                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                                                title="Xóa khỏi nhóm"
                                                            >
                                                                <UserMinus
                                                                    size={13}
                                                                />
                                                            </button>
                                                        </div>
                                                    )}
                                            </div>
                                        );
                                    },
                                )}
                                {/* pending requests section */}
                                {isPendingLoading ? (
                                    <div className="flex justify-center py-4">
                                        <Loader2 className="animate-spin text-orange-400" size={16} />
                                    </div>
                                ) : pendingRequests.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-orange-100">
                                        <div className="flex items-center gap-1.5 px-1 mb-2">
                                            <Clock size={12} className="text-orange-400" />
                                            <span className="text-[11px] font-bold text-orange-500 uppercase tracking-wide">
                                                Chờ duyệt ({pendingRequests.length})
                                            </span>
                                        </div>
                                        <div className="space-y-1">
                                            {pendingRequests.map((req: any) => (
                                                <div
                                                    key={req._id}
                                                    className="flex items-center gap-2.5 p-2.5 bg-orange-50 border border-orange-100 rounded-xl"
                                                >
                                                    <Avatar name={req.userId?.name} size="sm" />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1">
                                                            <span className="text-sm font-semibold text-gray-800 truncate">
                                                                {req.userId?.name}
                                                            </span>
                                                            <span className="text-[9px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">
                                                                Chờ duyệt
                                                            </span>
                                                        </div>
                                                        <div className="text-[11px] text-gray-400 truncate">
                                                            Đề xuất bởi: <span className="text-orange-500 font-medium">{req.actor?.name}</span>
                                                        </div>
                                                    </div>
                                                    {isAdmin && (
                                                        <div className="flex gap-1">
                                                            <button
                                                                onClick={async () => {
                                                                    try {
                                                                        await conversationService.handleJoinRequest(conversationId, req._id, "accept");
                                                                        toast.success(`Đã chấp nhận ${req.userId?.name}`);
                                                                        // xóa khỏi list pending ngay lập tức (optimistic)
                                                                        setPendingRequests(prev => prev.filter(r => r._id !== req._id));
                                                                        onRefresh?.(); // socket group_request_handled sẽ broadcast cho tất cả
                                                                    } catch { toast.error("Thao tác thất bại"); }
                                                                }}
                                                                className="px-2 py-1 text-[10px] font-bold bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
                                                            >
                                                                Duyệt
                                                            </button>
                                                            <button
                                                                onClick={async () => {
                                                                    try {
                                                                        await conversationService.handleJoinRequest(conversationId, req._id, "reject");
                                                                        toast.success("Đã từ chối");
                                                                        // xóa khỏi list pending ngay lập tức (optimistic)
                                                                        setPendingRequests(prev => prev.filter(r => r._id !== req._id));
                                                                    } catch { toast.error("Thao tác thất bại"); }
                                                                }}
                                                                className="px-2 py-1 text-[10px] font-bold bg-gray-200 hover:bg-red-100 hover:text-red-600 text-gray-600 rounded-lg transition-colors"
                                                            >
                                                                Từ chối
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* pins tab */}
                        {tab === "pins" && (
                            <div className="p-3 space-y-2">
                                {pins.length === 0 ? (
                                    <div className="py-10 text-center text-xs text-gray-400 italic">
                                        Chưa có tin nhắn ghim
                                    </div>
                                ) : (
                                    pins.map((pin: any, i: number) => (
                                        <div
                                            key={i}
                                            className="p-3 bg-yellow-50 border border-yellow-100 rounded-xl hover:bg-yellow-100 transition-colors cursor-pointer shadow-sm"
                                        >
                                            <div className="flex items-center gap-1.5 mb-1.5">
                                                <Pin
                                                    size={11}
                                                    className="text-yellow-500"
                                                />
                                                <span className="text-[10px] text-yellow-600 font-bold">
                                                    Tin nhắn ghim
                                                </span>
                                            </div>
                                            <div className="text-xs text-gray-700 leading-relaxed break-words">
                                                {pin.content || "File/Media"}
                                            </div>
                                            <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-yellow-200/50">
                                                <Avatar
                                                    name={pin.senderId?.name}
                                                    size="xs"
                                                />
                                                <span className="text-[10px] text-gray-500">
                                                    {pin.senderId?.name} •{" "}
                                                    {new Date(
                                                        pin.createdAt,
                                                    ).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {isAddMemberOpen && (
                <AddMemberModal
                    conversationId={conversationId}
                    participants={conversationInfo?.participants || []}
                    conversationName={conversationInfo?.name}
                    onClose={() => setIsAddMemberOpen(false)}
                    onSuccess={() => {
                        onRefresh?.();
                    }}
                />
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

export default ConversationPanel;