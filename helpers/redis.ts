import { connect, Redis } from 'https://deno.land/x/redis@v0.26.0/mod.ts'

export async function redis(): Promise<Redis> {
  const redis = await connect({
    hostname: Deno.env.get('REDIS_HOST') || 'localhost',
    port: Deno.env.get('REDIS_PORT') || 6379,
  })

  const redisAuth = {
    user: Deno.env.get('REDIS_USER'),
    password: Deno.env.get('REDIS_PASSWORD'),
  }
  if (redisAuth.user && redisAuth.password) {
    await redis.auth(redisAuth.user, redisAuth.password)
  }

  return redis
}
