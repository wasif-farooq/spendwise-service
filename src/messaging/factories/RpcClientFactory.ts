import { IRpcClient } from '@messaging/interfaces/IRpcClient';
import { ConfigLoader } from '@config/ConfigLoader';
import { KafkaRpcClient } from '@messaging/implementations/kafka/KafkaRpcClient';
import { BullMQRpcClient } from '@messaging/implementations/bullmq/BullMQRpcClient';

export class RpcClientFactory {
  static create(): IRpcClient {
    const config = ConfigLoader.getInstance();
    const provider = config.get('messaging.provider') || 'kafka';

    console.log(`[RpcClientFactory] Creating RPC client for provider: ${provider}`);

    if (provider === 'bullmq') {
      return new BullMQRpcClient();
    }

    return new KafkaRpcClient();
  }
}
