import { resolveURL } from './resolveURL.ts'
import { Redis } from 'https://deno.land/x/redis@v0.26.0/mod.ts'

// Cached fetch
export async function cfetch(url: string, lang: string, redis: Redis): Promise<string> {
  const cache = await redis.get(`fetch-cache-${lang}-${url.replaceAll(':', '-')}`)
  if (cache !== undefined) {
    return cache
  } else {
    const resolved = await resolveURL(url, redis, lang)
    if (resolved === undefined) throw new Error('Bail - unable to handle URL shenanigans')
    const text = await resolved.response.text()

    const tx = redis.tx()
    // Cache this response for all URLs in the trail of redirects
    for (const trailURL of resolved.urlTrail) {
      const keyname = `fetch-cache-${lang}-${trailURL.replaceAll(':', '-')}`
      tx.set(keyname, text)
      tx.expire(keyname, 60 * 60 * 24)
    }
    await tx.flush()

    return text
  }
}
