export interface User {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
  status: 'online' | 'away' | 'busy' | 'offline';
  isOnline?: boolean;
  customStatusMessage?: string;
  lastSeen?: string;
}

export interface Attachment {
  _id: string;
  url: string;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  duration?: number; // for voice/video
  
  // aliases for compatibility
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  type?: 'image' | 'video' | 'file' | 'voice';
}

export interface LinkPreview {
  url: string;
  title: string;
  description?: string;
  image?: string;
  siteName?: string;
}

export interface Message {
  _id: string;
  conversationId: string;
  senderId: User;
  content: string;
  type: 'text' | 'file' | 'media' | 'voice' | 'call' | 'system' | 'forward';
  attachments?: Attachment[];
  linkPreviews?: LinkPreview[];
  replyTo?: {
    _id: string;
    content: string;
    senderId: User;
  };
  mentions?: User[] | string[];
  reactions?: {
    userId: string | User;
    emoji: string;
  }[];
  seenBy?: (string | User)[];
  isEdited?: boolean;
  editedAt?: string;
  isDeleted?: boolean;
  isPinned?: boolean;
  pinByUser?: string | User;
  pinnedAt?: string;
  createdAt: string;
  updatedAt: string;
  callInfo?: {
    callType: 'voice' | 'video'; // 'video' chỉ có ở tin nhắn cũ
    status: 'missed' | 'ended' | 'cancelled' | 'started';
    duration?: number;
    startedAt?: string;
    endedAt?: string;
    participants?: User[];
  };
}

export interface Conversation {
  _id: string;
  name?: string;
  type: 'private' | 'group';
  participants: {
    userId: User;
    role: 'owner' | 'admin' | 'member';
    muteUntil?: string;
  }[];
  lastMessage?: Message;
  unreadCount?: number;
  isArchived?: boolean;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
}