export type RateLimitConfig = {
  route: string;
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  limited: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();

export const rateLimitPolicies = {
  recommend: {
    route: '/api/recommend',
    limit: 20,
    windowMs: 60_000,
  },
  playerSearch: {
    route: '/api/players/search',
    limit: 60,
    windowMs: 60_000,
  },
} satisfies Record<string, RateLimitConfig>;

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const [firstIp] = forwardedFor.split(',');
    if (firstIp?.trim()) return firstIp.trim();
  }

  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

export function checkRateLimit(request: Request, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const clientIp = getClientIp(request);
  const key = `${config.route}:${clientIp}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    const resetAt = now + config.windowMs;
    buckets.set(key, { count: 1, resetAt });
    return {
      limited: false,
      limit: config.limit,
      remaining: config.limit - 1,
      resetAt,
    };
  }

  if (current.count >= config.limit) {
    return {
      limited: true,
      limit: config.limit,
      remaining: 0,
      resetAt: current.resetAt,
    };
  }

  current.count += 1;
  return {
    limited: false,
    limit: config.limit,
    remaining: config.limit - current.count,
    resetAt: current.resetAt,
  };
}

export function resetRateLimits(): void {
  buckets.clear();
}
