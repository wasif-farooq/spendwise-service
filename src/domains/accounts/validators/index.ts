import { CreateAccountSchema, UpdateAccountSchema, AccountIdParamSchema } from '../dto';
import { AppError } from '@shared/errors/AppError';

export class AccountValidators {
    static validateCreate(data: unknown) {
        const result = CreateAccountSchema.safeParse(data);
        if (!result.success) {
            const errors = result.error.errors.map(e => e.message).join(', ');
            throw new AppError(`Validation failed: ${errors}`, 400);
        }
        return result.data;
    }

    static validateUpdate(data: unknown) {
        const result = UpdateAccountSchema.safeParse(data);
        if (!result.success) {
            const errors = result.error.errors.map(e => e.message).join(', ');
            throw new AppError(`Validation failed: ${errors}`, 400);
        }
        return result.data;
    }

    static validateId(param: unknown) {
        const result = AccountIdParamSchema.safeParse(param);
        if (!result.success) {
            throw new AppError('Invalid account ID', 400);
        }
        return result.data;
    }
}
