import { beforeAll, afterAll, jest } from '@jest/globals';

jest.mock('../src/messaging/implementations/kafka/KafkaRequestReply', () => ({
    KafkaRequestReply: jest.fn().mockImplementation(() => ({
        // @ts-ignore
        connect: jest.fn().mockResolvedValue(undefined),
        // @ts-ignore
        request: jest.fn().mockResolvedValue({}),
        // @ts-ignore
        disconnect: jest.fn().mockResolvedValue(undefined)
    }))
}));
import { ServiceBootstrap } from '../src/bootstrap/ServiceBootstrap';
import { Container } from '../src/core/di/Container';
import { TOKENS } from '../src/core/di/tokens';
import { DatabaseFacade } from '../src/core/application/facades/DatabaseFacade';


beforeAll(async () => {
    // Initialize infrastructure
    const bootstrap = ServiceBootstrap.getInstance();
    await bootstrap.initialize('Test Environment');

    // Any global setup like DB migrations for test DB could go here
});

afterAll(async () => {
    const container = Container.getInstance();
    const db = container.resolve<DatabaseFacade>(TOKENS.Database);
    // await db.close(); // If there is a close method
});
