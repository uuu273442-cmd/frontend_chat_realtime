import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
    UserPlus,
    Check,
    X,
    UserMinus,
    Search,
    Filter,
    MoreHorizontal,
    Users,
    MessageSquare,
    ChevronLeft,
} from "lucide-react";
import toast from "react-hot-toast";
import AddFriendModal from "./AddFriendModal";
import UserProfileModal from "./UserProfileModal";
import Avatar from "../ui/Avatar";
import { friendService } from "../../services/friendService";
import { useFriendSocket } from "../../hooks/useFriendSocket";
import { useSocket } from "../../context/SocketContext";

interface ContactsViewProps {
    onStartChat?: (userId: string) => void;
}

const ContactsView: React.FC<ContactsViewProps> = ({ onStartChat }) => {
    const navigate = useNavigate();
    const [friends, setFriends] = useState<any[]>([]);
    const [requests, setRequests] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [viewProfileUserId, setViewProfileUserId] = useState<
        string | null
    >(null);
    const { presenceMap } = useSocket();
    const [searchTerm, setSearchTerm] = useState("");

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [friendsData, requestsData] = await Promise.all([
                friendService.getFriends(),
                friendService.getFriendRequests(),
            ]);
            setFriends(friendsData);
            setRequests(requestsData);
        } catch (error) {
            toast.error("Failed to load contacts");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    useFriendSocket({ onUpdate: fetchData });

    const handleRespond = async (
        id: string,
        action: "accepted" | "rejected",
    ) => {
        try {
            await friendService.respondToRequest(id, action);
            if (action === "accepted") {
                toast.success("Đã chấp nhận lời mời kết bạn 🎉");
            } else {
                toast("Đã từ chối lời mời kết bạn", { icon: "👋" });
            }
            fetchData();
        } catch (error) {
            toast.error("Thao tác thất bại");
        }
    };

    const handleUnfriend = async (userId: string) => {
        if (!window.confirm("Are you sure you want to unfriend this user?"))
            return;
        try {
            await friendService.unfriend(userId);
            toast.success("Unfriended successfully");
            fetchData();
        } catch (error) {
            toast.error("Unfriend failed");
        }
    };

    // group friends by first letter of their name
    const groupedFriends = friends
        .filter((f) => f.name.toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name))
        .reduce((acc: any, friend) => {
            const firstLetter = friend.name.charAt(0).toUpperCase();
            if (!acc[firstLetter]) acc[firstLetter] = [];
            acc[firstLetter].push(friend);
            return acc;
        }, {});

    if (isLoading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-gray-50">
                <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4" />
                <span className="text-gray-400 text-sm font-medium">
                    Đang tải danh sách...
                </span>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col bg-white h-full overflow-hidden font-sans">
            {isAddModalOpen && (
                <AddFriendModal onClose={() => setIsAddModalOpen(false)} />
            )}

            {viewProfileUserId && (
                <UserProfileModal
                    userId={viewProfileUserId}
                    onClose={() => setViewProfileUserId(null)}
                />
            )}

            {/* header - Zalo Style */}
            <header className="h-14 border-b border-gray-100 flex items-center justify-between px-4 md:px-6 flex-shrink-0">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => navigate("/chat")}
                        className="md:hidden -ml-1 p-1.5 rounded-full hover:bg-gray-100 text-gray-600"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <Users size={20} className="text-gray-600" />
                    <h2 className="text-base font-bold text-gray-800">
                        Danh sách bạn bè
                    </h2>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto bg-gray-50/50">
                {/* search & Actions Bar */}
                <div className="p-4 bg-white border-b border-gray-100 flex flex-wrap gap-4 items-center">
                    <div className="flex-1 min-w-[200px] relative">
                        <Search
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                            size={16}
                        />
                        <input
                            type="text"
                            placeholder="Tìm bạn"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-gray-100 border-none rounded-lg text-sm outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <button className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 rounded-lg text-sm font-medium text-gray-600 transition-colors">
                            <Filter size={16} /> Tên (A-Z)
                        </button>
                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-lg shadow-blue-100 transition-all active:scale-95"
                        >
                            <UserPlus size={16} /> Thêm bạn
                        </button>
                    </div>
                </div>

                <div className="max-w-5xl mx-auto p-6 space-y-8">
                    {/* friend Requests Section */}
                    {requests.length > 0 && (
                        <section className="animate-in fade-in slide-in-from-top-4 duration-500">
                            <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4 ml-1">
                                Lời mời kết bạn ({requests.length})
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {requests.map((req) => (
                                    <div
                                        key={req._id}
                                        className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between hover:shadow-md transition-all group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-lg shadow-inner">
                                                {req.senderId?.name?.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="font-bold text-sm text-gray-800">
                                                    {req.senderId?.name}
                                                </div>
                                                <div className="text-[11px] text-gray-500">
                                                    Muốn kết bạn với bạn
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() =>
                                                    handleRespond(
                                                        req._id,
                                                        "accepted",
                                                    )
                                                }
                                                className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl transition-all shadow-sm"
                                            >
                                                <Check size={18} />
                                            </button>
                                            <button
                                                onClick={() =>
                                                    handleRespond(
                                                        req._id,
                                                        "rejected",
                                                    )
                                                }
                                                className="p-2 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-xl transition-all shadow-sm"
                                            >
                                                <X size={18} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* friends List with Alphabet Headers */}
                    <section className="bg-white rounded-[24px] border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
                            <h3 className="text-sm font-bold text-gray-800">
                                Bạn bè ({friends.length})
                            </h3>
                        </div>

                        <div className="divide-y divide-gray-50">
                            {Object.keys(groupedFriends).length === 0 ? (
                                <div className="p-16 text-center">
                                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Users
                                            size={32}
                                            className="text-gray-200"
                                        />
                                    </div>
                                    <p className="text-gray-400 text-sm">
                                        Chưa có bạn bè nào. Hãy bắt đầu kết nối!
                                    </p>
                                </div>
                            ) : (
                                Object.keys(groupedFriends).map((letter) => (
                                    <div key={letter} className="bg-white">
                                        <div className="px-6 py-2 bg-gray-50/50 text-xs font-black text-gray-400">
                                            {letter}
                                        </div>
                                        <div className="divide-y divide-gray-50">
                                            {groupedFriends[letter].map(
                                                (friend: any) => (
                                                    <div
                                                        key={friend._id}
                                                        className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors group"
                                                    >
                                                        <div
                                                            className="flex items-center gap-4 cursor-pointer"
                                                            onClick={() =>
                                                                onStartChat &&
                                                                onStartChat(
                                                                    friend._id,
                                                                )
                                                            }
                                                        >
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setViewProfileUserId(
                                                                        friend._id,
                                                                    );
                                                                }}
                                                                className="relative flex-shrink-0"
                                                            >
                                                                <Avatar
                                                                    src={
                                                                        friend.avatar
                                                                    }
                                                                    name={
                                                                        friend.name
                                                                    }
                                                                    size="md"
                                                                    className="group-hover:scale-105 transition-transform"
                                                                />
                                                                <span
                                                                    className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                                                                        presenceMap[
                                                                            friend
                                                                                ._id
                                                                        ]
                                                                            ?.status ===
                                                                        "online"
                                                                            ? "bg-green-500"
                                                                            : presenceMap[
                                                                                    friend
                                                                                        ._id
                                                                                ]
                                                                                    ?.status ===
                                                                                "away"
                                                                              ? "bg-yellow-500"
                                                                              : presenceMap[
                                                                                      friend
                                                                                          ._id
                                                                                  ]
                                                                                      ?.status ===
                                                                                  "busy"
                                                                                ? "bg-red-500"
                                                                                : "bg-gray-300"
                                                                    }`}
                                                                />
                                                            </button>
                                                            <div>
                                                                <div className="font-bold text-[14px] text-gray-800">
                                                                    {
                                                                        friend.name
                                                                    }
                                                                </div>
                                                                <div className="text-[11px] text-green-500 font-medium">
                                                                    Gia đình
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() =>
                                                                    onStartChat &&
                                                                    onStartChat(
                                                                        friend._id,
                                                                    )
                                                                }
                                                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                                title="Nhắn tin"
                                                            >
                                                                <MessageSquare
                                                                    size={20}
                                                                />
                                                            </button>
                                                            <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all">
                                                                <MoreHorizontal
                                                                    size={20}
                                                                />
                                                            </button>
                                                            <button
                                                                onClick={() =>
                                                                    handleUnfriend(
                                                                        friend._id,
                                                                    )
                                                                }
                                                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                                title="Hủy kết bạn"
                                                            >
                                                                <UserMinus
                                                                    size={20}
                                                                />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ),
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default ContactsView;