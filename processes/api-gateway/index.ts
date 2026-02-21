import { ApplicationBootstrap } from '../../src/bootstrap/ApplicationBootstrap';

const app = new ApplicationBootstrap();
app.start().catch((err) => {
    console.error('Fatal error starting API Gateway', err);
    process.exit(1);
});
