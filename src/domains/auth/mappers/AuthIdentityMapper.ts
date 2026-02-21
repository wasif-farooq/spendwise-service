import { AuthIdentity } from '../models/AuthIdentity';

export class AuthIdentityMapper {
    public static toDomain(row: any): AuthIdentity {
        return AuthIdentity.create({
            userId: row.user_id,
            provider: row.provider,
            sub: row.sub,
            passwordHash: row.password_hash,
            lastLoginAt: row.last_login_at
        }, row.id);
    }
}
