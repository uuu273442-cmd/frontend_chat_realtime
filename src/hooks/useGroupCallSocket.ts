import { useEffect, useRef, useCallback } from 'react';
import { useSocket } from '../context/SocketContext';

export interface GroupCallParticipant {
  userId: string;
  name: string;
  avatar?: string | null;
  stream?: MediaStream;
}

interface UseGroupCallSocketOptions {
  onStarted: (payload: { callId: string; conversationId: string; hostId: string }) => void;
  onJoined: (payload: { callId: string; userId: string; userInfo: { name: string; avatar?: string } }) => void;
  onLeft:   (payload: { callId: string; userId: string }) => void;
  onEnded:  (payload: { callId: string; conversationId: string }) => void;
  onParticipants?: (payload: { callId: string; existingParticipants: { userId: string; name: string; avatar?: string }[] }) => void;
  onRedirect?: (payload: { callId: string; conversationId: string; hostId: string }) => void;
  onOffer:        (payload: { callId: string; fromUserId: string; sdp: RTCSessionDescriptionInit }) => void;
  onAnswer:       (payload: { callId: string; fromUserId: string; sdp: RTCSessionDescriptionInit }) => void;
  onIceCandidate: (payload: { callId: string; fromUserId: string; candidate: RTCIceCandidateInit }) => void;
}

export const useGroupCallSocket = (options: UseGroupCallSocketOptions) => {
  const { socket } = useSocket();
  const optsRef = useRef(options);
  useEffect(() => { optsRef.current = options; });

  const startGroupCall = useCallback((conversationId: string) => {
    socket?.emit('group_call_start', { conversationId });
  }, [socket]);

  const joinGroupCall = useCallback((callId: string) => {
    socket?.emit('group_call_join', { callId });
  }, [socket]);

  const leaveGroupCall = useCallback((callId: string) => {
    socket?.emit('group_call_leave', { callId });
  }, [socket]);

  const endGroupCall = useCallback((callId: string) => {
    socket?.emit('group_call_end', { callId });
  }, [socket]);

  // tín hiệu webrtc dùng chung với gọi 1-1
  const sendOffer = useCallback((callId: string, targetUserId: string, sdp: RTCSessionDescriptionInit) => {
    socket?.emit('call_offer', { callId, targetUserId, sdp });
  }, [socket]);

  const sendAnswer = useCallback((callId: string, targetUserId: string, sdp: RTCSessionDescriptionInit) => {
    socket?.emit('call_answer', { callId, targetUserId, sdp });
  }, [socket]);

  const sendIceCandidate = useCallback((callId: string, targetUserId: string, candidate: RTCIceCandidateInit) => {
    socket?.emit('call_ice_candidate', { callId, targetUserId, candidate });
  }, [socket]);

  useEffect(() => {
    if (!socket) return;

    const handlers: Record<string, (p: any) => void> = {
      group_call_started:      (p) => optsRef.current.onStarted(p),
      group_call_joined:       (p) => optsRef.current.onJoined(p),
      group_call_left:         (p) => optsRef.current.onLeft(p),
      group_call_ended:        (p) => optsRef.current.onEnded(p),
      group_call_participants: (p) => optsRef.current.onParticipants?.(p),
      group_call_redirect:     (p) => optsRef.current.onRedirect?.(p),
      call_offer:              (p) => optsRef.current.onOffer(p),
      call_answer:             (p) => optsRef.current.onAnswer(p),
      call_ice_candidate:      (p) => optsRef.current.onIceCandidate(p),
    };

    Object.entries(handlers).forEach(([e, h]) => socket.on(e, h));
    return () => { Object.entries(handlers).forEach(([e, h]) => socket.off(e, h)); };
  }, [socket]);

  return { startGroupCall, joinGroupCall, leaveGroupCall, endGroupCall, sendOffer, sendAnswer, sendIceCandidate };
};