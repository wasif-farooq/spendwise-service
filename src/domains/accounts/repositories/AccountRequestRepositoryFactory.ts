import { AccountRequestRepository } from './AccountRequestRepository';

export class AccountRequestRepositoryFactory {
    private static instance: AccountRequestRepository | null = null;

    create(): AccountRequestRepository {
        if (AccountRequestRepositoryFactory.instance) {
            return AccountRequestRepositoryFactory.instance;
        }

        AccountRequestRepositoryFactory.instance = new AccountRequestRepository();
        return AccountRequestRepositoryFactory.instance;
    }
}