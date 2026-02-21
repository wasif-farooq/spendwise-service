import dotenv from 'dotenv';
import path from 'path';

export class ConfigLoader {
    private static instance: ConfigLoader;
    private config: any;

    private constructor() {
        this.loadEnvironment();
    }

    public static getInstance(): ConfigLoader {
        if (!ConfigLoader.instance) {
            ConfigLoader.instance = new ConfigLoader();
        }
        return ConfigLoader.instance;
    }

    private loadEnvironment() {
        const env = process.env.NODE_ENV || 'development';

        // Load .env file
        const envFile = path.resolve(process.cwd(), `.env.${env}`);
        dotenv.config({ path: envFile });

        // Load config file
        try {
            const configPath = path.resolve(process.cwd(), `config/environments/${env}.ts`);
            // Using require for dynamic synchronous loading
            const userConfig = require(configPath).default;
            this.config = userConfig;
        } catch (error) {
            console.error(`Failed to load configuration for environment: ${env}`, error);
            process.exit(1);
        }
    }

    public get(key: string): any {
        const keys = key.split('.');
        let result = this.config;

        for (const k of keys) {
            if (result && typeof result === 'object' && k in result) {
                result = result[k];
            } else {
                return undefined;
            }
        }

        return result;
    }
}
