import { KafkaRequestReply } from '@messaging/implementations/kafka/KafkaRequestReply';
import { CreateWorkspaceDto, UpdateWorkspaceDto, InviteMemberDto } from '@domains/workspaces/dto/workspace.dto';

export class WorkspaceRequestRepository {
    private rpcClient: KafkaRequestReply;

    constructor(autoConnect: boolean = true) {
        this.rpcClient = new KafkaRequestReply();
        if (autoConnect) {
            this.rpcClient.connect().catch(err => console.error('Failed to connect RPC Client', err));
        }
    }

    async create(userId: string, dto: CreateWorkspaceDto) {
        return this.rpcClient.request('workspace.service.create', { userId, ...dto });
    }

    async update(workspaceId: string, userId: string, dto: UpdateWorkspaceDto) {
        return this.rpcClient.request('workspace.service.update', { workspaceId, userId, ...dto });
    }

    async delete(workspaceId: string, userId: string) {
        return this.rpcClient.request('workspace.service.delete', { workspaceId, userId });
    }

    async list(userId: string) {
        return this.rpcClient.request('workspace.service.list', { userId });
    }

    async getMembers(workspaceId: string, userId: string) {
        return this.rpcClient.request('workspace.service.get-members', { workspaceId, userId });
    }

    async inviteMember(workspaceId: string, userId: string, dto: InviteMemberDto) {
        return this.rpcClient.request('workspace.service.invite-member', { workspaceId, userId, ...dto });
    }

    async removeMember(workspaceId: string, userId: string, memberId: string) {
        return this.rpcClient.request('workspace.service.remove-member', { workspaceId, userId, memberId });
    }

    async getRoles(workspaceId: string, userId: string, params: { page?: number; limit?: number; search?: string } = {}) {
        return this.rpcClient.request('workspace.service.get-roles', { workspaceId, userId, ...params });
    }

    async getRole(workspaceId: string, userId: string, roleId: string) {
        return this.rpcClient.request('workspace.service.get-role', { workspaceId, userId, roleId });
    }

    async createRole(workspaceId: string, userId: string, dto: any) {
        return this.rpcClient.request('workspace.service.create-role', { workspaceId, userId, ...dto });
    }

    async updateRole(workspaceId: string, userId: string, roleId: string, dto: any) {
        return this.rpcClient.request('workspace.service.update-role', { workspaceId, userId, roleId, ...dto });
    }

    async assignRole(workspaceId: string, userId: string, memberId: string, dto: any) {
        return this.rpcClient.request('workspace.service.assign-role', { workspaceId, userId, memberId, ...dto });
    }

    async deleteRole(workspaceId: string, userId: string, roleId: string) {
        return this.rpcClient.request('workspace.service.delete-role', { workspaceId, userId, roleId });
    }

    async checkPermission(workspaceId: string, userId: string, permission: string) {
        return this.rpcClient.request('workspace.service.check-permission', { workspaceId, userId, permission });
    }
}
