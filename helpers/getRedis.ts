import { connect, Redis } from 'https://deno.land/x/redis@v0.26.0/mod.ts'
import { Lock } from 'https://deno.land/x/unified_deno_lock@v0.1.1/mod.ts'

const redisMutex = new Lock()

export async function getRedis(): Promise<Redis> {
  const redis = await connect({
    hostname: Deno.env.get('REDIS_HOST') || 'localhost',
    port: Deno.env.get('REDIS_PORT') || 6379,
    password: Deno.env.get('REDIS_PASSWORD'),
    name: Deno.env.get('REDIS_USER'),
  })

  return redis
}

export async function redisTxn<T>(transaction: () => T): Promise<T> {
  redisMutex.lock()
  const result: T = await transaction()
  redisMutex.unlock()
  return result
}
