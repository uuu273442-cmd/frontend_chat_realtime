import React, { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause } from "lucide-react";

interface VoiceMessagePlayerProps {
    src: string;
    isMine: boolean;
    initialDuration?: number; // giây, dùng khi audio chưa load metadata xong
}

const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
};

// waveform giả lập cố định (không phân tích audio thật
const generateBars = (seed: string, count = 32): number[] => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    const bars: number[] = [];
    for (let i = 0; i < count; i++) {
        h = (h * 1103515245 + 12345) >>> 0;
        // chiều cao 30%-100%
        bars.push(30 + (h % 71));
    }
    return bars;
};

const VoiceMessagePlayer: React.FC<VoiceMessagePlayerProps> = ({
    src,
    isMine,
    initialDuration = 0,
}) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(initialDuration);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [isLoading, setIsLoading] = useState(false);

    const bars = useRef(generateBars(src)).current;

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const onTimeUpdate = () => setCurrentTime(audio.currentTime);
        const onLoadedMetadata = () => {
            if (isFinite(audio.duration)) setDuration(audio.duration);
            setIsLoading(false);
        };
        const onEnded = () => {
            setIsPlaying(false);
            setCurrentTime(0);
        };
        const onWaiting = () => setIsLoading(true);
        const onCanPlay = () => setIsLoading(false);

        audio.addEventListener("timeupdate", onTimeUpdate);
        audio.addEventListener("loadedmetadata", onLoadedMetadata);
        audio.addEventListener("ended", onEnded);
        audio.addEventListener("waiting", onWaiting);
        audio.addEventListener("canplay", onCanPlay);

        return () => {
            audio.removeEventListener("timeupdate", onTimeUpdate);
            audio.removeEventListener("loadedmetadata", onLoadedMetadata);
            audio.removeEventListener("ended", onEnded);
            audio.removeEventListener("waiting", onWaiting);
            audio.removeEventListener("canplay", onCanPlay);
        };
    }, []);

    const togglePlay = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (isPlaying) {
            audio.pause();
            setIsPlaying(false);
        } else {
            // dừng các audio khác đang phát trên trang (chỉ 1 voice message phát cùng lúc)
            document.querySelectorAll("audio[data-voice-player]").forEach((el) => {
                if (el !== audio) (el as HTMLAudioElement).pause();
            });
            audio.play().catch(() => {});
            setIsPlaying(true);
        }
    }, [isPlaying]);

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        const audio = audioRef.current;
        if (!audio || !duration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        audio.currentTime = ratio * duration;
        setCurrentTime(ratio * duration);
    };

    const cyclePlaybackRate = () => {
        const rates = [1, 1.5, 2];
        const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
        setPlaybackRate(next);
        if (audioRef.current) audioRef.current.playbackRate = next;
    };

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    const barColor = isMine ? "bg-white/40" : "bg-gray-300";
    const barColorActive = isMine ? "bg-white" : "bg-blue-500";
    const subTextColor = isMine ? "text-white/70" : "text-gray-400";
    const btnBg = isMine ? "bg-white/20 hover:bg-white/30" : "bg-blue-500 hover:bg-blue-600";
    const btnIconColor = isMine ? "text-white" : "text-white";

    return (
        <div className="flex items-center gap-2.5 min-w-[220px] max-w-[260px] py-0.5">
            <audio ref={audioRef} src={src} preload="metadata" data-voice-player />

            {/* play/Pause button */}
            <button
                onClick={togglePlay}
                disabled={isLoading}
                className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95 ${btnBg} disabled:opacity-50`}
            >
                {isLoading ? (
                    <div className="w-3.5 h-3.5 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                ) : isPlaying ? (
                    <Pause size={15} className={btnIconColor} fill="currentColor" />
                ) : (
                    <Play size={15} className={`${btnIconColor} ml-0.5`} fill="currentColor" />
                )}
            </button>

            <div className="flex-1 min-w-0">
                {/* waveform / progress bar */}
                <div
                    onClick={handleSeek}
                    className="flex items-center gap-[2px] h-6 cursor-pointer select-none"
                >
                    {bars.map((h, i) => {
                        const barProgress = (i / bars.length) * 100;
                        const isActive = barProgress <= progress;
                        return (
                            <div
                                key={i}
                                className={`flex-1 rounded-full transition-colors duration-75 ${isActive ? barColorActive : barColor}`}
                                style={{ height: `${h}%` }}
                            />
                        );
                    })}
                </div>

                {/* time + speed */}
                <div className="flex items-center justify-between mt-0.5">
                    <span className={`text-[10px] font-medium ${subTextColor}`}>
                        {formatTime(isPlaying || currentTime > 0 ? currentTime : duration)}
                    </span>
                    <button
                        onClick={cyclePlaybackRate}
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isMine ? "bg-white/15 text-white/80 hover:bg-white/25" : "bg-gray-100 text-gray-500 hover:bg-gray-200"} transition-colors`}
                    >
                        {playbackRate}x
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VoiceMessagePlayer;
