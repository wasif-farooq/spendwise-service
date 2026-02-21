import { IUserRepository } from './IUserRepository';
import { User } from '../models/User';
import { BaseRepository } from '@shared/repositories/BaseRepository';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { Inject } from '@di/decorators/inject.decorator';
import { TOKENS } from '@di/tokens';
import { CreateUserQuery } from '../queries/user/CreateUserQuery';
import { UpdateUserQuery } from '../queries/user/UpdateUserQuery';
import { FindUserByEmailQuery } from '../queries/user/FindUserByEmailQuery';
import { FindUserByIdQuery } from '../queries/user/FindUserByIdQuery';

export class UserRepository extends BaseRepository<any> implements IUserRepository {
    constructor(@Inject(TOKENS.Database) db: DatabaseFacade) {
        super(db, 'users');
    }

    async save(user: User, options?: { db?: DatabaseFacade }): Promise<void> {
        const db = options?.db || this.db;
        const exists = await this.findById(user.id, { db });
        if (exists) {
            await new UpdateUserQuery(db).execute(user);
        } else {
            await new CreateUserQuery(db).execute(user);
        }
    }

    async findByEmail(email: string, options?: { db?: DatabaseFacade }): Promise<User | null> {
        const db = options?.db || this.db;
        return new FindUserByEmailQuery(db).execute(email);
    }

    async findById(id: string, options?: { db?: DatabaseFacade }): Promise<User | null> {
        const db = options?.db || this.db;
        return new FindUserByIdQuery(db).execute(id);
    }
}
