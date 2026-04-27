import { createClient } from 'redis';

const client = createClient({
    url: `redis://localhost:6379`
});

client.on('error', (err) => console.error('Redis Client Error:', err));
client.on('connect', () => console.log('Redis Client connected'));

async function test() {
    try {
        await client.connect();
        console.log('Connected to Redis');

        // Test SET and GET
        await client.set('test_key', 'hello');
        const value = await client.get('test_key');
        console.log('GET test_key:', value);

        // Check if 2fa_pending keys exist
        const keys = await client.keys('2fa_pending:*');
        console.log('2fa_pending keys:', keys);

        await client.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

test();