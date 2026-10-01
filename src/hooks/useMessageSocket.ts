import { useEffect, useRef, useState } from "react";
import { useSocket } from "../context/SocketContext";

interface UseMessageSocketProps {
    activeChat: string | null;
    currentUserId?: string;
    onNewMessage: (message: any) => void;
    onConversationUpdate: () => void;
    // fine-grained handlers for inline state updates
    onMessageEdited?: (payload: any) => void;
    onMessageDeleted?: (payload: any) => void;
    onMessageReacted?: (payload: any) => void;
    onMessageSeen?: (payload: any) => void;
    onMessagePinned?: (payload: any) => void;
    onMessageUnpinned?: (payload: any) => void;
    onMessageForwarded?: (payload: any) => void;
    // payload: mảng LinkPreview docs [{ messageId, url, title, description, image }]
    onLinkPreview?: (payload: any[]) => void;
}

export const useMessageSocket = ({
    activeChat,
    currentUserId,
    onNewMessage,
    onConversationUpdate,
    onMessageEdited,
    onMessageDeleted,
    onMessageReacted,
    onMessageSeen,
    onMessagePinned,
    onMessageUnpinned,
    onMessageForwarded,
    onLinkPreview,
}: UseMessageSocketProps) => {
    const {
        socket,
        joinConversation,
        leaveConversation,
        emitTypingStart,
        emitTypingStop,
    } = useSocket();
    const [isTyping, setIsTyping] = useState(false);
    const typingTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        if (!activeChat) return;

        joinConversation(activeChat);

        if (!socket) return;

        // new message arrival events
        // "new_message_linkPreview" KHÔNG nằm trong nhóm này
        const arrivalEvents = [
            "new_message",
            "new_message_file",
            "new_message_media",
            "new_message_voice",
            "new_message_call",
            "message_system_room",
        ];

        arrivalEvents.forEach((evt) => {
            socket.on(evt, (payload: any) => {
                onNewMessage(payload);
            });
        });

        // link preview đến sau khi message text đã tồn tại
        socket.on("new_message_linkPreview", (payload: any[]) => {
            if (onLinkPreview) {
                onLinkPreview(payload);
            }
        });

        // message_edited
        // payload: full populated message object
        socket.on("message_edited", (payload: any) => {
            if (onMessageEdited) {
                onMessageEdited(payload);
            } else {
                onConversationUpdate();
            }
        });

        // message_deleted
        // payload: { messageId, scope: 'everyone' | 'self', deletedBy }
        socket.on("message_deleted", (payload: any) => {
            if (onMessageDeleted) {
                onMessageDeleted(payload);
            } else {
                onConversationUpdate();
            }
        });

        // message_reacted
        // payload: { messageId, userId, emoji, action: 'add' | 'remove' }
        socket.on("message_reacted", (payload: any) => {
            if (onMessageReacted) {
                onMessageReacted(payload);
            } else {
                onConversationUpdate();
            }
        });

        // message_seen
        // payload: { conversationId, messageId, seenBy: { _id, name, avatar } }
        socket.on("message_seen", (payload: any) => {
            if (onMessageSeen) {
                onMessageSeen(payload);
            } else {
                onConversationUpdate();
            }
        });

        // message_pinned
        // payload: { messageId, isPinned: true, pinByUser, pinnedAt }
        socket.on("message_pinned", (payload: any) => {
            if (onMessagePinned) {
                onMessagePinned(payload);
            } else {
                onConversationUpdate();
            }
        });

        // message_unpinned
        // payload: { messageId, isPinned: false, pinByUser: null, pinnedAt: null }
        socket.on("message_unpinned", (payload: any) => {
            if (onMessageUnpinned) {
                onMessageUnpinned(payload);
            } else {
                onConversationUpdate();
            }
        });

        // message_forwarded
        socket.on("message_forwarded", (payload: any) => {
            if (onMessageForwarded) {
                onMessageForwarded(payload);
            } else {
                onNewMessage(payload);
            }
        });

        // mention_received
        socket.on("mention_received", () => {
            onConversationUpdate();
        });

        // typing
        socket.on("user_typing", (payload: any) => {
            if (
                payload.conversationId === activeChat &&
                payload.userId !== currentUserId
            ) {
                setIsTyping(true);
            }
        });

        socket.on("user_stopped_typing", (payload: any) => {
            if (
                payload.conversationId === activeChat &&
                payload.userId !== currentUserId
            ) {
                setIsTyping(false);
            }
        });

        // group management events
        const groupEvents = [
            "group_member_added",
            "group_member_removed",
            "group_member_left",
            "group_role_changed",
            "group_dissolved",
        ];
        groupEvents.forEach((evt) => {
            socket.on(evt, (payload: any) => {
                if (payload.conversationId === activeChat) {
                    onConversationUpdate();
                }
            });
        });

        return () => {
            leaveConversation(activeChat);
            if (socket) {
                const allEvents = [
                    ...arrivalEvents,
                    "message_edited",
                    "message_deleted",
                    "message_reacted",
                    "message_seen",
                    "message_pinned",
                    "message_unpinned",
                    "message_forwarded",
                    "mention_received",
                    "user_typing",
                    "user_stopped_typing",
                    ...groupEvents,
                ];
                allEvents.forEach((evt) => socket.off(evt));
            }
        };
    }, [activeChat, socket, currentUserId]);

    const notifyTyping = () => {
        if (activeChat) {
            emitTypingStart(activeChat);
            if (typingTimeoutRef.current)
                clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = window.setTimeout(() => {
                emitTypingStop(activeChat);
            }, 1500);
        }
    };

    const stopTyping = () => {
        if (activeChat) {
            if (typingTimeoutRef.current)
                clearTimeout(typingTimeoutRef.current);
            emitTypingStop(activeChat);
        }
    };

    return { isTyping, notifyTyping, stopTyping };
};