import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import {
  SqlTransactionLimitRepository,
  TransactionLimitService,
} from '@domains/transactions/services/TransactionLimit';

let instance: TransactionLimitService | null = null;

/** The monthly transaction allowance service, built on first use (after the DB is registered). */
export const getTransactionLimitService = (): TransactionLimitService =>
  (instance ??= new TransactionLimitService(
    new SqlTransactionLimitRepository(
      Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database),
    ),
  ));
