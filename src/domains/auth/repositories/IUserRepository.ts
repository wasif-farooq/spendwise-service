import { User } from '../models/User';

import { DatabaseFacade } from '@facades/DatabaseFacade';

export interface IUserRepository {
    save(user: User, options?: { db?: DatabaseFacade }): Promise<void>;
    findByEmail(email: string, options?: { db?: DatabaseFacade }): Promise<User | null>;
    findById(id: string, options?: { db?: DatabaseFacade }): Promise<User | null>;
}
