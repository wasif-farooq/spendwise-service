import 'express-async-errors';
import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { ConfigLoader } from '@config/ConfigLoader';
import { StructuredLogger } from '@monitoring/logging/StructuredLogger';
import { MetricsService } from '@monitoring/MetricsService';
import { LogStream } from '@monitoring/logging/LogStream';
import { versionMiddleware } from '@shared/versioning/middleware/version.middleware';
import { ApiRouter } from '@shared/ApiRouter';
import { errorMiddleware } from '@shared/middleware/error.middleware';

export class Server {
    private app: Express;
    private logger: StructuredLogger;
    private config: ConfigLoader;

    constructor() {
        this.app = express();
        this.logger = new StructuredLogger();
        this.config = ConfigLoader.getInstance();

        this.configureMiddleware();
        this.configureRoutes();
    }

    private configureMiddleware() {
        this.app.use(helmet({
            crossOriginResourcePolicy: false,
            crossOriginOpenerPolicy: false,
        }));
        this.app.use(cors(this.config.get('server.cors')));
        this.app.use(compression());
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // Logging middleware
        const stream = new LogStream(this.logger);
        this.app.use(morgan('combined', { stream: stream as any }));

        // Versioning middleware
        this.app.use('/api', versionMiddleware);
    }

    private configureRoutes() {
        this.app.get('/health', (req, res) => {
            res.json({ status: 'ok', timestamp: new Date(), service: 'API Gateway' });
        });

        // Metrics endpoint
        this.app.get('/metrics', async (req, res) => {
            const metricsService = MetricsService.getInstance();
            res.set('Content-Type', metricsService.getContentType());
            res.send(await metricsService.getMetrics());
        });

        // Mount API Router here
        this.app.use('/api', new ApiRouter().getRouter());

        // Global Error Handler
        this.app.use(errorMiddleware);
    }

    public start() {
        const port = this.config.get('server.port') || 3000;
        this.app.listen(port, () => {
            this.logger.info(`Server started on port ${port}`);
        });
    }

    public getApp(): Express {
        return this.app;
    }
}
