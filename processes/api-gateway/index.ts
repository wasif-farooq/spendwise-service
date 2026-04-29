import { ApplicationBootstrap } from '../../src/bootstrap/ApplicationBootstrap';

process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT EXCEPTION]', err.message);
    console.error('[STACK]', err.stack);
});

process.on('unhandledRejection', (reason) => {
    console.error('[UNHANDLED REJECTION]', reason);
});

const app = new ApplicationBootstrap();
app.start().catch((err) => {
    console.error('Fatal error starting API Gateway', err);
    process.exit(1);
});
