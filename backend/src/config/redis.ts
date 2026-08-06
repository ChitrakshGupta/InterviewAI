import Redis from 'ioredis';

const getRedisClient = (): Redis => {
  const redisUrl = process.env.REDIS_URL as string;

  const client = new Redis(redisUrl, {
    tls: {
      rejectUnauthorized: false,
    },
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
  });

  client.on('connect', () => {
    console.log('✅ Upstash Redis Connected');
  });

  client.on('error', (err) => {
    console.warn('⚠️ Redis connection warning:', err.message);
  });

  return client;
};

const redis = getRedisClient();
export default redis;
