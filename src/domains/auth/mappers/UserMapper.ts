import { User } from '../models/User';

export class UserMapper {
    public static toDomain(row: any): User {
        return User.restore({
            email: row.email,
            firstName: row.first_name,
            lastName: row.last_name,
            isActive: row.is_active,
            status: row.status || 'active',
            role: row.role || 'customer',
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            deletedAt: row.deleted_at,
            emailVerified: row.email_verified,
            emailVerificationCode: row.email_verification_code,
            emailVerifiedAt: row.email_verified_at,
            twoFactorEnabled: row.two_factor_enabled,
            twoFactorMethod: row.two_factor_method,
            twoFactorSecret: row.two_factor_secret,
            backupCodes: row.backup_codes,
            twoFactorMethods: row.two_factor_methods
        }, row.id);
    }
}
