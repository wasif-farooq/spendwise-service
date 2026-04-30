import { WorkspaceRequestRepository } from './WorkspaceRequestRepository';

export class WorkspaceRequestRepositoryFactory {
    private static instance: WorkspaceRequestRepository | null = null;

    create(): WorkspaceRequestRepository {
        if (WorkspaceRequestRepositoryFactory.instance) {
            return WorkspaceRequestRepositoryFactory.instance;
        }

        WorkspaceRequestRepositoryFactory.instance = new WorkspaceRequestRepository();
        return WorkspaceRequestRepositoryFactory.instance;
    }
}