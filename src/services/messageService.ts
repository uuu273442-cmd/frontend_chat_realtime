import api from './authService';
import type { Message, Attachment } from '../types';

export const messageService = {
  // send a simple text message
  async sendMessage(roomId: string, content: string, replyTo?: string, mentions?: string[]): Promise<Message> {
    const response = await api.post(`/messages/${roomId}`, { content, replyTo, mentions });
    return response.data.message;
  },

  // get messages for a conversation
  async getMessages(roomId: string, limit: number = 20, before?: string): Promise<{ messages: Message[], hasMore: boolean, nextCursor: string | null }> {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (before) params.append('before', before);
    
    const response = await api.get(`/messages/${roomId}?${params.toString()}`);
    return response.data;
  },

  // edit a message
  async editMessage(roomId: string, messageId: string, content: string): Promise<Message> {
    const response = await api.patch(`/messages/${roomId}`, { id: messageId, content });
    return response.data;
  },

  // delete a message
  async deleteMessage(roomId: string, messageId: string, scope: 'everyone' | 'self' = 'everyone'): Promise<any> {
    const response = await api.delete(`/messages/${roomId}?scope=${scope}`, {
      data: { id: messageId }
    });
    return response.data;
  },

  // pin a message
  async pinMessage(roomId: string, messageId: string): Promise<any> {
    const response = await api.post(`/messages/${roomId}/pin`, { id: messageId });
    return response.data;
  },

  // unpin a message
  async unpinMessage(roomId: string, messageId: string): Promise<any> {
    const response = await api.patch(`/messages/${roomId}/unpin`, { id: messageId });
    return response.data;
  },

  // search messages in a conversation
  async searchMessages(roomId: string, q: string): Promise<Message[]> {
    const response = await api.get(`/messages/${roomId}/search?q=${encodeURIComponent(q)}`);
    return response.data;
  },

  // react to a message
  async reactToMessage(roomId: string, messageId: string, emoji: string): Promise<any> {
    const response = await api.post(`/messages/${roomId}/react`, { id: messageId, emoji });
    return response.data;
  },

  // unreact to a message
  async unreactFromMessage(roomId: string, messageId: string): Promise<any> {
    const response = await api.patch(`/messages/${roomId}/unreact`, { id: messageId });
    return response.data;
  },

  // mark conversation as seen
  async markAsSeen(roomId: string): Promise<any> {
    const response = await api.patch(`/messages/${roomId}/seen`);
    return response.data;
  },

  // forward a message
  async forwardMessage(roomId: string, messageId: string, conversationIds: string[]): Promise<Message[]> {
    const response = await api.post(`/messages/${roomId}/forward`, { id: messageId, conversationIds });
    return response.data;
  },

  // upload files
  async uploadFiles(roomId: string, files: File[], replyTo?: string): Promise<{ message: Message, attachments: Attachment[] }> {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    if (replyTo) formData.append('replyTo', replyTo);
    
    const response = await api.post(`/messages/${roomId}/file`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },

  // upload media (images/videos)
  async uploadMedia(roomId: string, files: File[], replyTo?: string): Promise<{ message: Message, attachments: Attachment[] }> {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    if (replyTo) formData.append('replyTo', replyTo);
    
    const response = await api.post(`/messages/${roomId}/media`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },

  // upload voice
  async uploadVoice(roomId: string, file: File, replyTo?: string): Promise<{ message: Message, attachments: Attachment[] }> {
    const formData = new FormData();
    formData.append('file', file);
    if (replyTo) formData.append('replyTo', replyTo);
    
    const response = await api.post(`/messages/${roomId}/voice`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },

  // link preview message
  async sendLinkPreview(roomId: string, content: string, replyTo?: string): Promise<Message> {
    const response = await api.post(`/messages/${roomId}/link-preview`, { content, replyTo });
    return response.data;
  }
};
