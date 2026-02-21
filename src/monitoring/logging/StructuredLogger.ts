import winston from 'winston';
import { ILogger } from '@interfaces/ILogger';
import { ConfigLoader } from '@config/ConfigLoader';

export class StructuredLogger implements ILogger {
    private logger: winston.Logger;

    constructor() {
        const config = ConfigLoader.getInstance();
        const level = config.get('monitoring.logging.level') || 'info';
        const filePath = config.get('monitoring.logging.file.path');

        const transports: any[] = [
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.colorize(),
                    winston.format.simple(),
                ),
            }),
        ];

        if (filePath) {
            transports.push(
                new winston.transports.File({
                    filename: filePath,
                    format: winston.format.combine(
                        winston.format.timestamp(),
                        winston.format.json(),
                    ),
                }),
            );
        }

        this.logger = winston.createLogger({
            level,
            transports,
        });
    }

    debug(message: string, context?: any): void {
        this.logger.debug(message, { context });
    }

    info(message: string, context?: any): void {
        this.logger.info(message, { context });
    }

    warn(message: string, context?: any): void {
        this.logger.warn(message, { context });
    }

    error(message: string, trace?: string, context?: any): void {
        this.logger.error(message, { trace, context });
    }
}
