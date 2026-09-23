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
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 60));
  const safeWindow = Math.max(1, Math.min(86400, Math.floor(Number(windowSeconds) || 60)));
  const sanitizedKey = (key || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');

  if (!kv) {
    return { success: true, limit: safeLimit, remaining: safeLimit - 1, resetSeconds: safeWindow };
  }

  const currentWindow = Math.floor(Date.now() / 1000 / safeWindow);
  const kvKey = `rl:${sanitizedKey}:${currentWindow}`;

  try {
    const rawCount = await kv.get(kvKey);
    const count = rawCount ? parseInt(rawCount, 10) : 0;

    if (count >= safeLimit) {
      return {
        success: false,
        limit: safeLimit,
        remaining: 0,
        resetSeconds: safeWindow - (Math.floor(Date.now() / 1000) % safeWindow)
      };
    }

    // Cloudflare KV minimum TTL is 60 seconds
    const expirationTtl = Math.max(60, safeWindow * 2);
    await kv.put(kvKey, (count + 1).toString(), { expirationTtl });

    return {
      success: true,
      limit: safeLimit,
      remaining: safeLimit - (count + 1),
      resetSeconds: safeWindow - (Math.floor(Date.now() / 1000) % safeWindow)
    };
  } catch (err) {
    // Fail open in case of KV temporary error
    return { success: true, limit: safeLimit, remaining: 1, resetSeconds: safeWindow };
  }
}
