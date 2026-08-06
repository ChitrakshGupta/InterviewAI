import crypto from 'crypto';
import redis from '../config/redis';

/**
 * In-memory fallback map for environments where Redis connection might be unreachable.
 */
const inMemoryStore = new Map<string, { value: string; expiresAt: number }>();

export const generateRawToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

export const hashToken = (rawToken: string): string => {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
};

export const storeVerificationToken = async (
  hashedToken: string,
  userId: string,
  ttlSeconds = 1800
): Promise<void> => {
  const key = `verify:${hashedToken}`;
  try {
    await redis.set(key, userId, 'EX', ttlSeconds);
  } catch (err) {
    console.warn('Redis set error, using in-memory store fallback:', (err as Error).message);
    inMemoryStore.set(key, { value: userId, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
};

export const getVerificationUserId = async (hashedToken: string): Promise<string | null> => {
  const key = `verify:${hashedToken}`;
  try {
    const userId = await redis.get(key);
    if (userId) return userId;
  } catch (err) {
    console.warn('Redis get error, checking in-memory store fallback:', (err as Error).message);
  }

  const memItem = inMemoryStore.get(key);
  if (memItem) {
    if (Date.now() > memItem.expiresAt) {
      inMemoryStore.delete(key);
      return null;
    }
    return memItem.value;
  }

  return null;
};

export const deleteVerificationToken = async (hashedToken: string): Promise<void> => {
  const key = `verify:${hashedToken}`;
  try {
    await redis.del(key);
  } catch (err) {
    console.warn('Redis del error:', (err as Error).message);
  }
  inMemoryStore.delete(key);
};

export const setResendCooldown = async (userId: string, ttlSeconds = 120): Promise<void> => {
  const key = `user:${userId}:resend_cooldown`;
  try {
    await redis.set(key, '1', 'EX', ttlSeconds);
  } catch (err) {
    console.warn('Redis set cooldown error:', (err as Error).message);
    inMemoryStore.set(key, { value: '1', expiresAt: Date.now() + ttlSeconds * 1000 });
  }
};

export const checkResendCooldown = async (userId: string): Promise<boolean> => {
  const key = `user:${userId}:resend_cooldown`;
  try {
    const val = await redis.get(key);
    if (val === '1') return true;
  } catch (err) {
    console.warn('Redis check cooldown error:', (err as Error).message);
  }

  const memItem = inMemoryStore.get(key);
  if (memItem && Date.now() <= memItem.expiresAt) {
    return true;
  }

  return false;
};
