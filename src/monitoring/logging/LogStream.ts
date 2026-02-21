import { ILogger } from '@interfaces/ILogger';

export class LogStream {
    constructor(private logger: ILogger) { }

    write(message: string) {
        this.logger.info(message.trim());
    }
}
