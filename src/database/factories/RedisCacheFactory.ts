import { CacheAbstractFactory } from '@abstract-factories/CacheAbstractFactory';
import { ICache } from '@interfaces/ICache';
import { RedisCache } from '@cache/implementations/RedisCache';

export class RedisCacheFactory extends CacheAbstractFactory {
  createCache(): ICache {
    return new RedisCache();
  }
}
