import { ActivityLogRepository } from './ActivityLogRepository';

export class ActivityLogRequestRepositoryFactory {
  private static instance: ActivityLogRepository | null = null;

  create(db: any): ActivityLogRepository {
    if (ActivityLogRequestRepositoryFactory.instance) {
      return ActivityLogRequestRepositoryFactory.instance;
    }

    ActivityLogRequestRepositoryFactory.instance = new ActivityLogRepository(db);
    return ActivityLogRequestRepositoryFactory.instance;
  }
}
