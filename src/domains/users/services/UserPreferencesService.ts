import { Inject } from '@di/decorators/inject.decorator';
import { UserPreferencesRepository } from  '@domains/users/repositories/UserPreferencesRepository';
import { UserPreference } from  '@domains/users/models/UserPreference';
import { UpdateUserPreferencesDto } from  '@domains/users/dto/user-preferences.dto';

export class UserPreferencesService {
    constructor(
        @Inject('UserPreferencesRepository') private repo: UserPreferencesRepository
    ) { }

    async getPreferences(userId: string): Promise<UserPreference> {
        let prefs = await this.repo.findByUserId(userId);
        if (!prefs) {
            // Create default
            prefs = UserPreference.create({ userId });
            await this.repo.save(prefs);
        }
        return prefs;
    }

    async updatePreferences(userId: string, dto: UpdateUserPreferencesDto): Promise<UserPreference> {
        const prefs = await this.getPreferences(userId);
        prefs.update(dto);
        await this.repo.save(prefs);
        return prefs;
    }
}
