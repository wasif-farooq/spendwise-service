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
    const defaultEnvFile = path.resolve(process.cwd(), '.env');

    if (require('fs').existsSync(envFile)) {
      dotenv.config({ path: envFile });
    } else if (require('fs').existsSync(defaultEnvFile)) {
      dotenv.config({ path: defaultEnvFile });
    } else {
      dotenv.config(); // Fallback to default behavior
    }

    this.config = ConfigLoader.loadConfigModule(env);
  }

  /**
   * Locate and load the config module for an environment.
   *
   * The extension is deliberately omitted so Node resolves `.js` from a
   * compiled build and ts-node resolves `.ts` in development — hardcoding
   * `.ts` made the app unbootable from `dist`.
   *
   * Candidates are ordered so the copy sitting alongside this module wins:
   * `src/config` -> `<root>/config/environments`, and after a build
   * `dist/src/config` -> `<root>/dist/config/environments`. The cwd-based
   * entries are fallbacks for unusual working directories.
   */
  private static loadConfigModule(env: string): any {
    const candidates = [
      path.resolve(__dirname, '../../config/environments', env),
      path.resolve(process.cwd(), 'config/environments', env),
      path.resolve(process.cwd(), 'dist/config/environments', env),
    ];

    const tried: string[] = [];

    for (const candidate of candidates) {
      let resolved: string;
      try {
        resolved = require.resolve(candidate);
      } catch {
        tried.push(candidate);
        continue;
      }

      // Resolution succeeded, so any error past this point comes from the
      // config module itself (e.g. a missing required env var) and must not
      // be mistaken for "environment not found".
      const loaded = require(resolved);
      const config = loaded.default ?? loaded;

      if (!config || typeof config !== 'object') {
        throw new Error(`Config module ${resolved} did not export a configuration object`);
      }

      return config;
    }

    throw new Error(
      `No configuration found for NODE_ENV="${env}". Looked for:\n` +
        tried.map((p) => `  - ${p}(.js|.ts)`).join('\n'),
    );
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
