import { connect, Redis } from 'https://deno.land/x/redis@v0.26.0/mod.ts'

export async function getRedis(): Promise<Redis> {
  const redis = await connect({
    hostname: Deno.env.get('REDIS_HOST') || 'localhost',
    port: Deno.env.get('REDIS_PORT') || 6379,
    password: Deno.env.get('REDIS_PASSWORD'),
    name: Deno.env.get('REDIS_USER'),
  })

  return redis
}
