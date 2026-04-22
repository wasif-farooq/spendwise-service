import { Inject } from '@di/decorators/inject.decorator';
import { TOKENS } from '@di/tokens';
import { IUserRepository } from '@domains/auth/repositories/IUserRepository';
import { User } from '@domains/auth/models/User';
import { StorageService } from '@domains/storage/services/StorageService';
import { ConfigLoader } from '@config/ConfigLoader';
import { AppError } from '@shared/errors/AppError';
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

        // Get bucket name
        let bucket = this.storageService.getBucket('avatars');
        
        if (!bucket || bucket.includes('undefined')) {
            bucket = 'spendwise-avatars';
        }

        try {
            // For user avatar, upload directly to S3 to bypass the workspace_id FK issue
            const key = `avatars/${userId}/${uuidv4()}.${filename.split('.').pop()}`;
            
            const { Upload } = await import('@aws-sdk/lib-storage');
            
            const s3Client = (this.storageService as any).s3Client;
            
            const upload = new Upload({
                client: s3Client,
                params: {
                    Bucket: bucket,
                    Key: key,
                    Body: file,
                    ContentType: contentType,
                },
            });
            
            await upload.done();

            const avatarUrl = this.storageService.getPublicUrl(bucket, key);

            user.setAvatar(avatarUrl);
            await this.userRepo.save(user);

            return { avatarUrl };
        } catch (error: any) {
            console.error('Avatar upload failed:', error.message);
            throw new AppError('Avatar upload failed: ' + error.message, 500);
        }
    }
}
