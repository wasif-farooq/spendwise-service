import { Inject } from '@di/decorators/inject.decorator';
import { TOKENS } from '@di/tokens';
import { IUserRepository } from '@domains/auth/repositories/IUserRepository';
import { User } from '@domains/auth/models/User';
import { StorageService } from '@domains/storage/services/StorageService';
import { v4 as uuidv4 } from 'uuid';

export class UserService {
    constructor(
        @Inject('UserRepository') private userRepo: IUserRepository,
        @Inject(TOKENS.StorageService) private storageService: StorageService
    ) { }

    async getProfile(userId: string): Promise<User> {
        const user = await this.userRepo.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }
        return user;
    }

    async updateProfile(userId: string, data: { firstName: string; lastName: string }): Promise<User> {
        const user = await this.userRepo.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        user.updateName(data.firstName, data.lastName);
        await this.userRepo.save(user);

        return user;
    }

    async uploadAvatar(userId: string, file: Buffer, filename: string, contentType: string): Promise<{ avatarUrl: string }> {
        const user = await this.userRepo.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        const bucket = this.storageService.getBucket('avatars');
        const attachment = await this.storageService.uploadFile({
            file,
            filename: `avatar-${userId}-${uuidv4()}`,
            contentType,
            bucket,
            workspaceId: '',
            userId,
            metadata: { type: 'user-avatar', userId }
        });

        const avatarUrl = this.storageService.getPublicUrl(bucket, attachment.key);

        user.setAvatar(avatarUrl);
        await this.userRepo.save(user);

        return { avatarUrl };
    }
}
