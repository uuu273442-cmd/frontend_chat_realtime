import api from './authService';
import type { Conversation, User } from '../types';

export const conversationService = {
  // private & Group Creation
  async createPrivateConversation(userId: string): Promise<Conversation> {
    const response = await api.post('/conversations/private', { userId });
    return response.data;
  },

  async createGroupConversation(name: string, groupIds: string[]): Promise<Conversation> {
    const response = await api.post('/conversations/group', { name, groupIds });
    return response.data;
  },

  // conversation Information
  async getConversationInfo(id: string): Promise<Conversation> {
    const response = await api.get(`/conversations/${id}/info`);
    return response.data;
  },

  async getInfoMedia(id: string): Promise<any[]> {
    const response = await api.get(`/conversations/${id}/info/media`);
    return response.data;
  },

  async getInfoFile(id: string): Promise<any[]> {
    const response = await api.get(`/conversations/${id}/info/file`);
    return response.data;
  },

  async getInfoLinkPreview(id: string): Promise<any[]> {
    const response = await api.get(`/conversations/${id}/info/link-preview`);
    return response.data;
  },

  // list & Search
  async getConversations(archived: boolean = false): Promise<Conversation[]> {
    const response = await api.get(`/conversations?archived=${archived}`);
    return response.data;
  },

  async listUsers(): Promise<User[]> {
    const response = await api.get('/conversations/list-user');
    return response.data;
  },

  // member Management
  async addMembers(id: string, userIds: string[], description?: string): Promise<any> {
    const response = await api.patch(`/conversations/${id}/members/add`, { userIds, description });
    return response.data;
  },

  async removeMembers(id: string, userIds: string[]): Promise<any> {
    const response = await api.delete(`/conversations/${id}/members/remove`, {
      data: { userIds }
    });
    return response.data;
  },

  async changeRole(roomId: string, targetUserId: string, role: string): Promise<any> {
    const response = await api.patch(`/conversations/${roomId}/members/role`, { id: targetUserId, role });
    return response.data;
  },

  async leaveGroup(id: string): Promise<any> {
    const response = await api.delete(`/conversations/${id}/members/leave`);
    return response.data;
  },

  async disbandGroup(id: string): Promise<any> {
    const response = await api.delete(`/conversations/${id}/disband`);
    return response.data;
  },

  // join Requests
  async listJoinRequests(id: string): Promise<any[]> {
    const response = await api.get(`/conversations/${id}/requests`);
    return response.data;
  },

  async handleJoinRequest(roomId: string, requestId: string, action: 'accept' | 'reject'): Promise<any> {
    const response = await api.patch(`/conversations/${roomId}/request/handle`, { id: requestId, action });
    return response.data;
  },

  // ghim
  async getPins(id: string): Promise<any[]> {
    const response = await api.get(`/conversations/${id}/pins`);
    return response.data;
  },

  // actions (Archive, Mute, Remove)
  async removeConversation(id: string): Promise<any> {
    const response = await api.delete(`/conversations/${id}/remove`);
    return response.data;
  },

  async archiveConversation(id: string): Promise<any> {
    const response = await api.post(`/conversations/${id}/archive`);
    return response.data;
  },

  async unarchiveConversation(id: string): Promise<any> {
    const response = await api.delete(`/conversations/${id}/archive`);
    return response.data;
  },

  async muteConversation(id: string, duration: number): Promise<any> {
    const response = await api.post(`/conversations/${id}/mute`, { duration });
    return response.data;
  },

  async unmuteConversation(id: string): Promise<any> {
    const response = await api.delete(`/conversations/${id}/mute`);
    return response.data;
  },
};