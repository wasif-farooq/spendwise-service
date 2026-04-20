import { ConfigLoader } from '@config/ConfigLoader';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { PostgresFactory } from '@database/factories/PostgresFactory';
import { RepositoryFactory } from '@factories/RepositoryFactory';
import { ServiceFactory } from '@factories/ServiceFactory';

export class WorkspaceRequestRepository {
    private config = ConfigLoader.getInstance();
    private getMode(): string {
        return this.config.get('repository.mode') || 'direct';
    }

    private get service() {
        const db = new DatabaseFacade(new PostgresFactory());
        const repoFactory = new RepositoryFactory(db);
        const serviceFactory = new ServiceFactory(repoFactory, db);
        return serviceFactory.createWorkspaceService();
    }

    // Helper to wrap responses in RPC-style format
    private wrap(promise: Promise<any>): Promise<any> {
        return promise
            .then(data => {
                // Handle array responses (like workspace list)
                if (Array.isArray(data)) {
                    return { data, error: null, statusCode: 200 };
                }
                return { ...data, error: null, statusCode: 200 };
            })
            .catch(error => ({ 
                error: error.message || 'An error occurred', 
                statusCode: error.statusCode || 500,
                data: null 
            }));
    }

    async create(userId: string, dto: any) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.create(userId, dto));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async update(workspaceId: string, userId: string, dto: any) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.update(workspaceId, userId, dto));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async delete(workspaceId: string, userId: string) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.delete(workspaceId, userId));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async list(userId: string) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.getUserWorkspaces(userId));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async getMembers(workspaceId: string, userId: string, params: any = {}) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.getMembers(workspaceId, userId, params));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async inviteMember(workspaceId: string, userId: string, dto: any) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.inviteMember(workspaceId, userId, dto));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async removeMember(workspaceId: string, userId: string, memberId: string) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.removeMember(workspaceId, userId, memberId));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async getRoles(workspaceId: string, userId: string, params: any = {}) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.getRoles(workspaceId, userId, params));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async getRole(workspaceId: string, userId: string, roleId: string) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.getRole(workspaceId, userId, roleId));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async createRole(workspaceId: string, userId: string, dto: any) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.createRole(workspaceId, userId, dto));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async updateRole(workspaceId: string, userId: string, roleId: string, dto: any) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.updateRole(workspaceId, userId, roleId, dto));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async assignRole(workspaceId: string, userId: string, memberId: string, dto: any) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.assignRole(workspaceId, userId, memberId, dto));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async deleteRole(workspaceId: string, userId: string, roleId: string) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.deleteRole(workspaceId, userId, roleId));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async checkPermission(workspaceId: string, userId: string, permission: string) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.checkPermission(workspaceId, userId, permission));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async getById(workspaceId: string, userId: string) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.getById(workspaceId, userId));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async getMember(workspaceId: string, userId: string, memberId: string) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.getMember(workspaceId, userId, memberId));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async updateMember(workspaceId: string, userId: string, memberId: string, dto: any) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.updateMember(workspaceId, userId, memberId, dto));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async duplicateRole(workspaceId: string, userId: string, roleId: string) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.duplicateRole(workspaceId, userId, roleId));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async uploadLogo(workspaceId: string, userId: string, file: Buffer, filename: string, contentType: string) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.uploadLogo(workspaceId, userId, file, filename, contentType));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async resendInvitation(workspaceId: string, userId: string, invitationId: string) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.resendInvitation(workspaceId, userId, invitationId));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async cancelInvitation(workspaceId: string, userId: string, invitationId: string) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.cancelInvitation(workspaceId, userId, invitationId));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async getInvitations(workspaceId: string, userId: string, params: any = {}) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.getInvitations(workspaceId, userId, params));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async acceptInvitation(token: string, registrationData?: { firstName: string; lastName: string; password: string }) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.acceptInvitation(token, registrationData));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async getMyInvitations(userId: string) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.getMyInvitations(userId));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }
}
