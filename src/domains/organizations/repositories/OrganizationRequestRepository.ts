import { KafkaRequestReply } from '@messaging/implementations/kafka/KafkaRequestReply';
import { UpdateOrganizationDto, InviteMemberDto } from '@domains/organizations/dto/organization.dto';

export class OrganizationRequestRepository {
    private rpcClient: KafkaRequestReply;

    constructor(autoConnect: boolean = true) {
        this.rpcClient = new KafkaRequestReply();
        if (autoConnect) {
            this.rpcClient.connect().catch(err => console.error('Failed to connect RPC Client', err));
        }
    }

    async update(orgId: string, userId: string, dto: UpdateOrganizationDto) {
        return this.rpcClient.request('organization.service.update', { orgId, userId, ...dto });
    }

    async delete(orgId: string, userId: string) {
        return this.rpcClient.request('organization.service.delete', { orgId, userId });
    }

    async list(userId: string) {
        return this.rpcClient.request('organization.service.list', { userId });
    }

    async getMembers(orgId: string, userId: string) {
        return this.rpcClient.request('organization.service.get-members', { orgId, userId });
    }

    async inviteMember(orgId: string, userId: string, dto: InviteMemberDto) {
        return this.rpcClient.request('organization.service.invite-member', { orgId, userId, ...dto });
    }

    async removeMember(orgId: string, userId: string, memberId: string) {
        return this.rpcClient.request('organization.service.remove-member', { orgId, userId, memberId });
    }

    async getRoles(orgId: string, userId: string, params: { page?: number; limit?: number; search?: string } = {}) {
        return this.rpcClient.request('organization.service.get-roles', { orgId, userId, ...params });
    }

    async getRole(orgId: string, userId: string, roleId: string) {
        return this.rpcClient.request('organization.service.get-role', { orgId, userId, roleId });
    }

    async createRole(orgId: string, userId: string, dto: any) {
        return this.rpcClient.request('organization.service.create-role', { orgId, userId, ...dto });
    }

    async updateRole(orgId: string, userId: string, roleId: string, dto: any) {
        return this.rpcClient.request('organization.service.update-role', { orgId, userId, roleId, ...dto });
    }

    async assignRole(orgId: string, userId: string, memberId: string, dto: any) {
        return this.rpcClient.request('organization.service.assign-role', { orgId, userId, memberId, ...dto });
    }

    async deleteRole(orgId: string, userId: string, roleId: string) {
        return this.rpcClient.request('organization.service.delete-role', { orgId, userId, roleId });
    }

    async checkPermission(orgId: string, userId: string, permission: string) {
        return this.rpcClient.request('organization.service.check-permission', { orgId, userId, permission });
    }
}
