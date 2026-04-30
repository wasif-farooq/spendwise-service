import 'reflect-metadata';
import 'express-async-errors';
import { ApplicationBootstrap } from './bootstrap/ApplicationBootstrap';

async function main() {
    const bootstrap = new ApplicationBootstrap();
    await bootstrap.start();
}

main().catch(console.error);