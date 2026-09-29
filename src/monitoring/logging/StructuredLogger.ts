import winston from 'winston';
import { ILogger } from '@interfaces/ILogger';
import { ConfigLoader } from '@config/ConfigLoader';

export class StructuredLogger implements ILogger {
  private logger: winston.Logger;

  constructor() {
    const config = ConfigLoader.getInstance();
    const level = config.get('monitoring.logging.level') || 'info';
    // The path always has a default, so `enabled` is what decides. Ignoring it made every
    // environment write logs/*.log — including production, where the container runs as
    // an unprivileged user in a read-only app directory and the mkdir crashed the boot.
    // In a container, logs belong on stdout.
    const fileEnabled = config.get('monitoring.logging.file.enabled') === true;
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

    if (fileEnabled && filePath) {
      transports.push(
        new winston.transports.File({
          filename: filePath,
          format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
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
