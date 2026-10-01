import { useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';

interface UseConversationSocketOptions {
  onUpdate: () => void;
  onJoinRequested?: (payload: any) => void;
  onRequestHandled?: (payload: any) => void; // accept/reject xong → clear pending
  // callback khi user bị kick/rời/nhóm bị giải tán
  onForceLeave?: (conversationId: string, reason: 'dissolved' | 'removed' | 'left') => void;
}

export const useConversationSocket = (
  onUpdateOrOptions: (() => void) | UseConversationSocketOptions
) => {
  const { socket, joinConversation } = useSocket();

  const onUpdateRef = useRef<() => void>(() => {});
  const onJoinRequestedRef = useRef<((payload: any) => void) | undefined>(undefined);
  const onRequestHandledRef = useRef<((payload: any) => void) | undefined>(undefined);
  const onForceLeaveRef = useRef<UseConversationSocketOptions['onForceLeave'] | undefined>(undefined);

  useEffect(() => {
    onUpdateRef.current =
      typeof onUpdateOrOptions === 'function'
        ? onUpdateOrOptions
        : onUpdateOrOptions.onUpdate;

    if (typeof onUpdateOrOptions === 'object') {
      onJoinRequestedRef.current = onUpdateOrOptions.onJoinRequested;
      onRequestHandledRef.current = onUpdateOrOptions.onRequestHandled;
      onForceLeaveRef.current = onUpdateOrOptions.onForceLeave;
    }
  });

  useEffect(() => {
    if (!socket) return;

    // events thông thường
    const normalEvents = [
      'group_created',
      'group_added',
      'group_request_added',
      'group_member_added',
      'group_member_removed',
      'group_member_left',
      'group_role_changed',
      'conversation_updated',
      'message_seen',
    ];

    const handleNormal = (payload?: any) => {
      onUpdateRef.current();
      const cid =
        payload?.conversationId ||
        payload?.conversation?._id ||
        payload?.payload?.conversationId;
      if (cid) joinConversation(cid);
    };

    // events khiến user mất quyền truy cập conversation
    const handleGroupRemoved = (payload?: any) => {
      onUpdateRef.current();
      const cid = payload?.conversationId;
      if (cid) onForceLeaveRef.current?.(cid, 'removed');
    };

    const handleGroupLeft = (payload?: any) => {
      onUpdateRef.current();
      const cid = payload?.conversationId;
      if (cid) onForceLeaveRef.current?.(cid, 'left');
    };

    const handleGroupDissolved = (payload?: any) => {
      onUpdateRef.current();
      const cid = payload?.conversationId;
      if (cid) onForceLeaveRef.current?.(cid, 'dissolved');
    };

    const handleJoinRequested = (payload?: any) => {
      handleNormal(payload);
      onJoinRequestedRef.current?.(payload);
    };

    // khi request được xử lý (accept/reject) → refresh list + clear pending
    const handleRequestHandled = (payload?: any) => {
      handleNormal(payload);
      onRequestHandledRef.current?.(payload);
    };

    normalEvents.forEach(e => socket.on(e, handleNormal));
    socket.on('group_request_handled', handleRequestHandled);
    socket.on('group_removed', handleGroupRemoved);
    socket.on('group_left_self', handleGroupLeft);
    socket.on('group_dissolved', handleGroupDissolved);
    socket.on('group_join_requested', handleJoinRequested);

    return () => {
      normalEvents.forEach(e => socket.off(e, handleNormal));
      socket.off('group_request_handled', handleRequestHandled);
      socket.off('group_removed', handleGroupRemoved);
      socket.off('group_left_self', handleGroupLeft);
      socket.off('group_dissolved', handleGroupDissolved);
      socket.off('group_join_requested', handleJoinRequested);
    };
  }, [socket, joinConversation]);
};