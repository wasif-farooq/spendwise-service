import { KafkaRequestReply } from '@messaging/implementations/kafka/KafkaRequestReply';

export class FeatureFlagRequestRepository {
    private rpcClient: KafkaRequestReply;

    constructor(autoConnect: boolean = true) {
        this.rpcClient = new KafkaRequestReply();
        if (autoConnect) {
            this.rpcClient.connect().catch(err => console.error('Failed to connect RPC Client', err));
        }
    }

    async getAllFlags() {
        return this.rpcClient.request('feature-flags.service.get-all', {});
    }
}
