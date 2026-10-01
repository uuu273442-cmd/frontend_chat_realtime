import React, { useState, useEffect } from "react";
import {
    Camera,
    Mail,
    Phone,
    User,
    Shield,
    Check,
    Loader2,
    X,
    Bell,
    Moon,
    Lock,
    Settings,
    Eye,
    EyeOff,
    MessageSquareText,
    Radio,
} from "lucide-react";
import { userService } from "../../services/userService";
import { useAuth } from "../../context/AuthContext";
import toast from "react-hot-toast";

interface SettingsModalProps {
    onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<
        "profile" | "account" | "preferences"
    >("profile");
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // form states
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [bio, setBio] = useState("");
    const [avatar, setAvatar] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);

    // privacy states
    const [lastSeenVisibility, setLastSeenVisibility] = useState<
        "everyone" | "friends" | "nobody"
    >("everyone");
    const [showReadReceipts, setShowReadReceipts] = useState(true);
    const [showTypingIndicator, setShowTypingIndicator] = useState(true);
    const [isSavingPrivacy, setIsSavingPrivacy] = useState(false);

    // status states
    const [status, setStatus] = useState<
        "online" | "away" | "busy" | "offline"
    >("online");
    const [customStatusMessage, setCustomStatusMessage] = useState("");
    const [isSavingStatus, setIsSavingStatus] = useState(false);

    useEffect(() => {
        if (user?.sub) {
            fetchProfile();
        }
    }, [user]);

    // giải phóng object URL của avatar preview khi component unmount
    useEffect(() => {
        return () => {
            if (preview && preview.startsWith("blob:")) {
                URL.revokeObjectURL(preview);
            }
        };
    }, [preview]);

    const fetchProfile = async () => {
        try {
            const data = await userService.getCurrentProfile(user.sub);
            setName(data.name || "");
            setEmail(data.email || "");
            setPhone(data.phoneNumber || "");
            setBio(data.bio || "");
            setPreview(data.avatar || null);

            // status
            setStatus(data.status || "online");
            setCustomStatusMessage(data.customStatusMessage || "");

            // privacy
            try {
                // bE trả về {_id, privacy: {lastSeenVisibility, ...}}
                const res = await userService.getPrivacy();
                const p = res?.privacy;
                setLastSeenVisibility(
                    p?.lastSeenVisibility || "everyone",
                );
                setShowReadReceipts(p?.showReadReceipts ?? true);
                setShowTypingIndicator(
                    p?.showTypingIndicator ?? true,
                );
            } catch {
                // fallback: nếu endpoint riêng lỗi, dùng privacy nested trong profile
                if (data.privacy) {
                    setLastSeenVisibility(
                        data.privacy.lastSeenVisibility || "everyone",
                    );
                    setShowReadReceipts(
                        data.privacy.showReadReceipts ?? true,
                    );
                    setShowTypingIndicator(
                        data.privacy.showTypingIndicator ?? true,
                    );
                }
            }
        } catch (error) {
            toast.error("Failed to load profile");
        } finally {
            setIsLoading(false);
        }
    };

    // auto-save privacy
    const savePrivacy = async (
        overrides: Partial<{
            lastSeenVisibility: "everyone" | "friends" | "nobody";
            showReadReceipts: boolean;
            showTypingIndicator: boolean;
        }>,
    ) => {
        setIsSavingPrivacy(true);
        try {
            const payload = {
                lastSeenVisibility,
                showReadReceipts,
                showTypingIndicator,
                ...overrides,
            };
            await userService.updatePrivacy(payload);
            toast.success("Đã cập nhật quyền riêng tư");
        } catch {
            toast.error("Không thể cập nhật quyền riêng tư");
        } finally {
            setIsSavingPrivacy(false);
        }
    };

    // auto-save status khi đổi dropdown; customStatusMessage lưu khi blur input
    const saveStatus = async (
        overrides: Partial<{
            status: "online" | "away" | "busy" | "offline";
            customStatusMessage: string;
        }>,
    ) => {
        setIsSavingStatus(true);
        try {
            const nextStatus = overrides.status ?? status;
            const nextMessage =
                overrides.customStatusMessage ?? customStatusMessage;
            await userService.updateStatus(nextStatus, nextMessage);
            toast.success("Đã cập nhật trạng thái");
        } catch {
            toast.error("Không thể cập nhật trạng thái");
        } finally {
            setIsSavingStatus(false);
        }
    };

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // validate loại file và kích thước trước khi tạo preview
        if (!file.type.startsWith("image/")) {
            toast.error("Vui lòng chọn file ảnh (jpg, png, webp...)");
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            toast.error("Ảnh đại diện tối đa 5MB");
            return;
        }

        // useEffect cleanup phía trên sẽ tự động revoke object URL cũ khi
        setAvatar(file);
        setPreview(URL.createObjectURL(file));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);

        try {
            const formData = new FormData();
            formData.append("name", name);
            formData.append("email", email);
            formData.append("phone", phone);
            formData.append("bio", bio);
            if (avatar) {
                formData.append("file", avatar);
            }

            await userService.updateProfile(formData);
            toast.success("Settings updated!");
            fetchProfile();
        } catch (error) {
            toast.error("Failed to update settings");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex justify-center items-center z-[100] p-0 md:p-4 animate-in fade-in duration-300">
            <div className="bg-white w-full h-full md:h-[70vh] md:max-w-3xl md:rounded-2xl shadow-2xl flex flex-col md:flex-row overflow-hidden animate-in zoom-in-95 duration-300">
                {/* sidebar */}
                <div className="w-full md:w-56 bg-gray-50 border-b md:border-b-0 md:border-r border-gray-100 p-3 md:p-6 flex flex-row md:flex-col gap-2 flex-shrink-0 overflow-x-auto md:overflow-visible">
                    <h2 className="hidden md:block text-lg font-black mb-6 text-gray-900 px-2">
                        Cài đặt
                    </h2>

                    <nav className="flex flex-row md:flex-col gap-1.5 md:gap-1 md:space-y-1">
                        <button
                            onClick={() => setActiveTab("profile")}
                            className={`flex-shrink-0 md:w-full flex items-center gap-2 md:gap-3 px-3.5 md:px-4 py-2 md:py-2.5 rounded-xl transition-all duration-200 text-xs md:text-sm whitespace-nowrap ${activeTab === "profile" ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "text-gray-600 hover:bg-gray-200/60"}`}
                        >
                            <User size={16} />{" "}
                            <span className="font-bold">Thông tin cá nhân</span>
                        </button>

                        <button
                            onClick={() => setActiveTab("account")}
                            className={`flex-shrink-0 md:w-full flex items-center gap-2 md:gap-3 px-3.5 md:px-4 py-2 md:py-2.5 rounded-xl transition-all duration-200 text-xs md:text-sm whitespace-nowrap ${activeTab === "account" ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "text-gray-600 hover:bg-gray-200/60"}`}
                        >
                            <Shield size={16} />{" "}
                            <span className="font-bold">
                                Tài khoản & Bảo mật
                            </span>
                        </button>

                        <button
                            onClick={() => setActiveTab("preferences")}
                            className={`flex-shrink-0 md:w-full flex items-center gap-2 md:gap-3 px-3.5 md:px-4 py-2 md:py-2.5 rounded-xl transition-all duration-200 text-xs md:text-sm whitespace-nowrap ${activeTab === "preferences" ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "text-gray-600 hover:bg-gray-200/60"}`}
                        >
                            <Settings size={16} />{" "}
                            <span className="font-bold">Cài đặt chung</span>
                        </button>
                    </nav>

                    <div className="hidden md:block mt-auto pt-6 border-t border-gray-200/60 px-2">
                        <div className="flex items-center gap-2 text-gray-400">
                            <Lock size={14} />
                            <span className="text-[9px] font-black uppercase tracking-widest">
                                Mã hóa đầu cuối
                            </span>
                        </div>
                    </div>
                </div>

                {/* content */}
                <div className="flex-1 flex flex-col relative bg-white overflow-hidden min-h-0">
                    <button
                        onClick={onClose}
                        className="absolute top-4 md:top-6 right-4 md:right-6 text-gray-400 hover:text-gray-900 transition-colors z-20 p-1.5 hover:bg-gray-100 rounded-full"
                    >
                        <X size={24} />
                    </button>

                    <div className="flex-1 overflow-y-auto p-5 md:p-8 lg:p-10">
                        {isLoading ? (
                            <div className="h-full flex items-center justify-center">
                                <Loader2
                                    className="animate-spin text-blue-600"
                                    size={32}
                                />
                            </div>
                        ) : (
                            <form
                                onSubmit={handleSubmit}
                                className="max-w-xl mx-auto space-y-8"
                            >
                                {activeTab === "profile" && (
                                    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                                        <div>
                                            <h3 className="text-xl font-black text-gray-900 mb-1">
                                                Thông tin cá nhân
                                            </h3>
                                            <p className="text-gray-500 text-sm">
                                                Cập nhật ảnh đại diện và chi
                                                tiết hồ sơ của bạn.
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-6 p-6 bg-blue-50/40 rounded-2xl border border-blue-100/50">
                                            <div className="relative group">
                                                <div className="w-20 h-20 rounded-full bg-blue-200 flex items-center justify-center text-2xl font-bold overflow-hidden ring-4 ring-white shadow-xl">
                                                    {preview ? (
                                                        <img
                                                            src={preview}
                                                            alt="Avatar"
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        name.charAt(0)
                                                    )}
                                                </div>
                                                <label
                                                    htmlFor="settings-avatar"
                                                    className="absolute -bottom-0.5 -right-0.5 bg-blue-600 text-white p-2 rounded-full cursor-pointer shadow-lg hover:scale-110 transition-transform border-2 border-white"
                                                >
                                                    <Camera size={14} />
                                                </label>
                                                <input
                                                    id="settings-avatar"
                                                    type="file"
                                                    hidden
                                                    accept="image/*"
                                                    onChange={
                                                        handleAvatarChange
                                                    }
                                                />
                                            </div>
                                            <div className="space-y-0.5">
                                                <h4 className="text-sm font-bold text-gray-800">
                                                    Ảnh đại diện
                                                </h4>
                                                <p className="text-xs text-gray-500">
                                                    Dung lượng tối đa: 2MB. Định
                                                    dạng: JPG, PNG.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-sm font-semibold text-gray-700 ml-1">
                                                    Full Name
                                                </label>
                                                <div className="relative">
                                                    <User
                                                        className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                                                        size={18}
                                                    />
                                                    <input
                                                        type="text"
                                                        value={name}
                                                        onChange={(e) =>
                                                            setName(
                                                                e.target.value,
                                                            )
                                                        }
                                                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-sm font-semibold text-gray-700 ml-1">
                                                    Email Address
                                                </label>
                                                <div className="relative">
                                                    <Mail
                                                        className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                                                        size={18}
                                                    />
                                                    <input
                                                        type="email"
                                                        value={email}
                                                        onChange={(e) =>
                                                            setEmail(
                                                                e.target.value,
                                                            )
                                                        }
                                                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-sm font-semibold text-gray-700 ml-1">
                                                    Phone Number
                                                </label>
                                                <div className="relative">
                                                    <Phone
                                                        className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                                                        size={18}
                                                    />
                                                    <input
                                                        type="tel"
                                                        value={phone}
                                                        onChange={(e) =>
                                                            setPhone(
                                                                e.target.value,
                                                            )
                                                        }
                                                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-sm font-semibold text-gray-700 ml-1">
                                                        Giới thiệu bản thân
                                                    </label>
                                                    <span className="text-xs text-gray-400">
                                                        {bio.length}/150
                                                    </span>
                                                </div>
                                                <textarea
                                                    value={bio}
                                                    maxLength={150}
                                                    rows={3}
                                                    placeholder="Vài dòng giới thiệu về bạn..."
                                                    onChange={(e) =>
                                                        setBio(e.target.value)
                                                    }
                                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all resize-none text-sm"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === "account" && (
                                    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                                        <div>
                                            <h3 className="text-2xl font-bold text-gray-900 mb-1">
                                                Trạng thái & Quyền riêng tư
                                            </h3>
                                            <p className="text-gray-500">
                                                Quản lý trạng thái hoạt động và
                                                ai có thể thấy thông tin của
                                                bạn.
                                            </p>
                                        </div>

                                        {/* trạng thái hoạt động */}
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-gray-400">
                                                <Radio size={13} />
                                                Trạng thái hoạt động
                                                {isSavingStatus && (
                                                    <Loader2
                                                        size={12}
                                                        className="animate-spin text-blue-500"
                                                    />
                                                )}
                                            </div>

                                            <div className="p-5 border border-gray-100 rounded-2xl space-y-4">
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                    {(
                                                        [
                                                            {
                                                                value: "online",
                                                                label: "Trực tuyến",
                                                                color: "bg-green-500",
                                                            },
                                                            {
                                                                value: "away",
                                                                label: "Vắng mặt",
                                                                color: "bg-yellow-500",
                                                            },
                                                            {
                                                                value: "busy",
                                                                label: "Bận",
                                                                color: "bg-red-500",
                                                            },
                                                            {
                                                                value: "offline",
                                                                label: "Ẩn",
                                                                color: "bg-gray-400",
                                                            },
                                                        ] as const
                                                    ).map((opt) => (
                                                        <button
                                                            key={opt.value}
                                                            type="button"
                                                            onClick={() => {
                                                                setStatus(
                                                                    opt.value,
                                                                );
                                                                saveStatus({
                                                                    status: opt.value,
                                                                });
                                                            }}
                                                            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                                                                status ===
                                                                opt.value
                                                                    ? "border-blue-500 bg-blue-50 text-blue-700"
                                                                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                                                            }`}
                                                        >
                                                            <span
                                                                className={`w-2.5 h-2.5 rounded-full ${opt.color}`}
                                                            />
                                                            {opt.label}
                                                        </button>
                                                    ))}
                                                </div>

                                                <div className="space-y-1.5">
                                                    <label className="text-xs font-semibold text-gray-500 ml-1">
                                                        Trạng thái tùy chỉnh
                                                        (tối đa 80 ký tự)
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={
                                                            customStatusMessage
                                                        }
                                                        maxLength={80}
                                                        placeholder="VD: Đang tập trung code 🚀"
                                                        onChange={(e) =>
                                                            setCustomStatusMessage(
                                                                e.target.value,
                                                            )
                                                        }
                                                        onBlur={() =>
                                                            saveStatus({})
                                                        }
                                                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all text-sm"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* quyền riêng tư */}
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-gray-400">
                                                <Shield size={13} />
                                                Quyền riêng tư
                                                {isSavingPrivacy && (
                                                    <Loader2
                                                        size={12}
                                                        className="animate-spin text-blue-500"
                                                    />
                                                )}
                                            </div>

                                            {/* lần cuối truy cập */}
                                            <div className="p-5 border border-gray-100 rounded-2xl flex items-center justify-between gap-4">
                                                <div className="flex items-center gap-4 min-w-0">
                                                    <div className="p-3 bg-purple-50 rounded-xl text-purple-600 flex-shrink-0">
                                                        <Eye size={20} />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="font-bold">
                                                            Ai thấy lần truy
                                                            cập cuối
                                                        </div>
                                                        <div className="text-sm text-gray-500">
                                                            Kiểm soát ai có
                                                            thể xem thời gian
                                                            bạn online gần
                                                            nhất.
                                                        </div>
                                                    </div>
                                                </div>
                                                <select
                                                    value={
                                                        lastSeenVisibility
                                                    }
                                                    onChange={(e) => {
                                                        const val = e.target
                                                            .value as
                                                            | "everyone"
                                                            | "friends"
                                                            | "nobody";
                                                        setLastSeenVisibility(
                                                            val,
                                                        );
                                                        savePrivacy({
                                                            lastSeenVisibility:
                                                                val,
                                                        });
                                                    }}
                                                    className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium outline-none focus:border-blue-500 flex-shrink-0"
                                                >
                                                    <option value="everyone">
                                                        Mọi người
                                                    </option>
                                                    <option value="friends">
                                                        Bạn bè
                                                    </option>
                                                    <option value="nobody">
                                                        Không ai
                                                    </option>
                                                </select>
                                            </div>

                                            {/* đã xem tin nhắn */}
                                            <div className="p-5 border border-gray-100 rounded-2xl flex items-center justify-between hover:bg-gray-50 transition-colors">
                                                <div className="flex items-center gap-4">
                                                    <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
                                                        <EyeOff size={20} />
                                                    </div>
                                                    <div>
                                                        <div className="font-bold">
                                                            Hiển thị đã xem
                                                        </div>
                                                        <div className="text-sm text-gray-500">
                                                            Cho người khác
                                                            biết khi bạn đã
                                                            xem tin nhắn của
                                                            họ.
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const next =
                                                            !showReadReceipts;
                                                        setShowReadReceipts(
                                                            next,
                                                        );
                                                        savePrivacy({
                                                            showReadReceipts:
                                                                next,
                                                        });
                                                    }}
                                                    className={`w-12 h-6 rounded-full relative transition-colors flex-shrink-0 ${
                                                        showReadReceipts
                                                            ? "bg-blue-600"
                                                            : "bg-gray-200"
                                                    }`}
                                                >
                                                    <div
                                                        className={`w-5 h-5 bg-white rounded-full absolute top-0.5 shadow-sm transition-all ${
                                                            showReadReceipts
                                                                ? "right-0.5"
                                                                : "left-0.5"
                                                        }`}
                                                    />
                                                </button>
                                            </div>

                                            {/* đang nhập */}
                                            <div className="p-5 border border-gray-100 rounded-2xl flex items-center justify-between hover:bg-gray-50 transition-colors">
                                                <div className="flex items-center gap-4">
                                                    <div className="p-3 bg-green-50 rounded-xl text-green-600">
                                                        <MessageSquareText
                                                            size={20}
                                                        />
                                                    </div>
                                                    <div>
                                                        <div className="font-bold">
                                                            Hiển thị đang nhập
                                                        </div>
                                                        <div className="text-sm text-gray-500">
                                                            Cho người khác
                                                            biết khi bạn đang
                                                            soạn tin nhắn.
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const next =
                                                            !showTypingIndicator;
                                                        setShowTypingIndicator(
                                                            next,
                                                        );
                                                        savePrivacy({
                                                            showTypingIndicator:
                                                                next,
                                                        });
                                                    }}
                                                    className={`w-12 h-6 rounded-full relative transition-colors flex-shrink-0 ${
                                                        showTypingIndicator
                                                            ? "bg-blue-600"
                                                            : "bg-gray-200"
                                                    }`}
                                                >
                                                    <div
                                                        className={`w-5 h-5 bg-white rounded-full absolute top-0.5 shadow-sm transition-all ${
                                                            showTypingIndicator
                                                                ? "right-0.5"
                                                                : "left-0.5"
                                                        }`}
                                                    />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === "preferences" && (
                                    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                                        <div>
                                            <h3 className="text-2xl font-bold text-gray-900 mb-1">
                                                Preferences
                                            </h3>
                                            <p className="text-gray-500">
                                                Customize your chat experience.
                                            </p>
                                        </div>

                                        <div className="space-y-6">
                                            <div className="flex items-center justify-between p-2">
                                                <div className="flex items-center gap-4">
                                                    <Moon
                                                        size={22}
                                                        className="text-gray-400"
                                                    />
                                                    <div>
                                                        <div className="font-bold">
                                                            Dark Mode
                                                        </div>
                                                        <div className="text-sm text-gray-500">
                                                            Adjust the
                                                            appearance of the
                                                            application.
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="w-12 h-6 bg-gray-200 rounded-full relative cursor-pointer">
                                                    <div className="w-5 h-5 bg-white rounded-full absolute left-0.5 top-0.5 shadow-sm"></div>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between p-2">
                                                <div className="flex items-center gap-4">
                                                    <Bell
                                                        size={22}
                                                        className="text-gray-400"
                                                    />
                                                    <div>
                                                        <div className="font-bold">
                                                            Desktop
                                                            Notifications
                                                        </div>
                                                        <div className="text-sm text-gray-500">
                                                            Receive alerts for
                                                            new messages.
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="w-12 h-6 bg-blue-600 rounded-full relative cursor-pointer">
                                                    <div className="w-5 h-5 bg-white rounded-full absolute right-0.5 top-0.5 shadow-sm"></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="pt-8 border-t border-gray-100 flex justify-end gap-4">
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="px-6 py-3 rounded-xl font-semibold text-gray-600 hover:bg-gray-100 transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSaving}
                                        className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 transition-all flex items-center gap-2 disabled:opacity-50"
                                    >
                                        {isSaving ? (
                                            <Loader2
                                                className="animate-spin"
                                                size={20}
                                            />
                                        ) : (
                                            <Check size={20} />
                                        )}
                                        {isSaving
                                            ? "Saving..."
                                            : "Save Changes"}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;