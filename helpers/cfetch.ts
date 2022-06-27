import { resolveURL } from './resolveURL.ts'
import { Redis } from 'https://deno.land/x/redis@v0.26.0/mod.ts'

// Cached fetch
export async function cfetch(url: string, lang: string, redis: Redis): Promise<string> {
  const resolved = await resolveURL(url, redis, lang)
  if (resolved === undefined) throw new Error('Bail - unable to handle URL shenanigans')
  const text = await resolved.response

  return text
}
