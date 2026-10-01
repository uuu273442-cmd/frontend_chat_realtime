import React from "react";
import {
    MessageSquare,
    Users,
    Cloud,
    Briefcase,
    Settings,
    LogOut,
} from "lucide-react";
import Avatar from "../ui/Avatar";

interface SidebarPrimaryProps {
    user: any;
    avatarUrl?: string | null;
    currentView: string;
    setCurrentView: (view: "chats" | "contacts") => void;
    onOpenSettings: () => void;
    onLogout: () => void;
    isSettingsOpen: boolean;
    pendingFriendCount?: number; // NEW
}

const SidebarPrimary: React.FC<SidebarPrimaryProps> = ({
    user,
    avatarUrl,
    currentView,
    setCurrentView,
    onOpenSettings,
    onLogout,
    isSettingsOpen,
    pendingFriendCount = 0,
}) => {
    return (
        <aside
            className="fixed bottom-0 left-0 right-0 z-50 h-14 flex-row justify-around
                       md:static md:h-full md:w-[58px] md:flex-col md:justify-start md:py-4
                       bg-[#0068ff] flex items-center flex-shrink-0 shadow-xl"
        >
            {/* user Profile */}
            <button
                type="button"
                className="cursor-pointer md:mb-6 group relative flex flex-col items-center justify-center flex-1 md:flex-none h-full md:h-auto"
                onClick={onOpenSettings}
                title="Cài đặt tài khoản"
            >
                <Avatar
                    src={avatarUrl || undefined}
                    name={user?.name}
                    size="md"
                    className="border-2 border-white/30"
                />
            </button>

            {/* navigation */}
            <div className="flex flex-row md:flex-col gap-1 flex-1 md:flex-none md:w-full">
                <button
                    onClick={() => setCurrentView("chats")}
                    className={`flex-1 md:w-full py-2 md:py-3 flex flex-col md:flex-row items-center justify-center gap-0.5 transition-all relative group ${currentView === "chats" ? "bg-[#005ae0] text-white" : "text-white/70 hover:bg-white/10"}`}
                >
                    <MessageSquare
                        size={20}
                        className="group-hover:scale-110 transition-transform"
                    />
                    {currentView === "chats" && (
                        <div className="absolute left-0 right-0 md:right-auto top-0 md:top-0 bottom-auto md:bottom-0 h-1 md:h-auto md:w-1 bg-white" />
                    )}
                </button>

                {/* contacts button với badge */}
                <button
                    onClick={() => setCurrentView("contacts")}
                    className={`flex-1 md:w-full py-2 md:py-3 flex flex-col md:flex-row items-center justify-center gap-0.5 transition-all relative group ${currentView === "contacts" ? "bg-[#005ae0] text-white" : "text-white/70 hover:bg-white/10"}`}
                >
                    <div className="relative">
                        <Users
                            size={20}
                            className="group-hover:scale-110 transition-transform"
                        />
                        {pendingFriendCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                                {pendingFriendCount > 99 ? "99+" : pendingFriendCount}
                            </span>
                        )}
                    </div>
                    {currentView === "contacts" && (
                        <div className="absolute left-0 right-0 md:right-auto top-0 md:top-0 bottom-auto md:bottom-0 h-1 md:h-auto md:w-1 bg-white" />
                    )}
                </button>
            </div>

            {/* utilities */}
            <div className="hidden md:flex md:mt-auto md:flex-col items-center gap-1 w-full pb-2">
                <button className="w-full py-3 flex justify-center text-white/70 hover:bg-white/10 transition-all group">
                    <Cloud
                        size={20}
                        className="group-hover:scale-110 transition-transform"
                    />
                </button>
                <button className="w-full py-3 flex justify-center text-white/70 hover:bg-white/10 transition-all group">
                    <Briefcase
                        size={20}
                        className="group-hover:scale-110 transition-transform"
                    />
                </button>

                <button
                    onClick={onOpenSettings}
                    className={`w-full py-3 flex justify-center transition-all relative group ${isSettingsOpen ? "bg-[#005ae0] text-white" : "text-white/70 hover:bg-white/10"}`}
                >
                    <Settings
                        size={22}
                        className="group-hover:rotate-90 transition-all duration-500"
                    />
                </button>

                <button
                    onClick={onLogout}
                    className="w-full py-3 flex justify-center text-white/70 hover:bg-red-500/30 hover:text-red-100 transition-all group"
                >
                    <LogOut size={20} />
                </button>
            </div>

            {/* logout */}
            <button
                onClick={onLogout}
                className="md:hidden flex-1 py-2 flex flex-col items-center justify-center gap-0.5 text-white/70 active:bg-red-500/30 transition-all"
            >
                <LogOut size={20} />
            </button>
        </aside>
    );
};

export default SidebarPrimary;