import { ICache } from '@interfaces/ICache';

export abstract class CacheAbstractFactory {
    abstract createCache(): ICache;
}
