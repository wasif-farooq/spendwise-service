import { ServiceBootstrap } from './ServiceBootstrap';


export class ApplicationBootstrap {
    async start() {
        // Re-use Service logic for infrastructure init
        const serviceBootstrap = ServiceBootstrap.getInstance();
        await serviceBootstrap.initialize('API Gateway');

        // Start HTTP Server (Dynamic import to ensure DI container is ready before Routes load)
        const { Server } = await import('@server/Server');
        const server = new Server();
        server.start();
    }
}
