// ponytail: Simple KV sliding rate limiter

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

export async function checkRateLimit(
  kv: any,
  key: string,
  limit: number = 60,
  windowSeconds: number = 60
): Promise<RateLimitResult> {
  if (!kv) {
    return { success: true, limit, remaining: limit - 1, resetSeconds: windowSeconds };
  }

  const currentWindow = Math.floor(Date.now() / 1000 / windowSeconds);
  const kvKey = `rl:${key}:${currentWindow}`;

  try {
    const rawCount = await kv.get(kvKey);
    const count = rawCount ? parseInt(rawCount, 10) : 0;

    if (count >= limit) {
      return {
        success: false,
        limit,
        remaining: 0,
        resetSeconds: windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds)
      };
    }

    await kv.put(kvKey, (count + 1).toString(), { expirationTtl: windowSeconds * 2 });

    return {
      success: true,
      limit,
      remaining: limit - (count + 1),
      resetSeconds: windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds)
    };
  } catch (err) {
    // Fail open in case of KV temporary error
    return { success: true, limit, remaining: 1, resetSeconds: windowSeconds };
  }
}
