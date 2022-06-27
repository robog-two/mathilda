import { resolveURL } from './resolveURL.ts'
import { Redis } from 'https://deno.land/x/redis@v0.26.0/mod.ts'

// Cached fetch, also checks robots.txt & ensures rate limits.

export async function cfetch(url: string, lang: string, redis: Redis): Promise<string> {
  const domain = new URL(url).hostname

  // Check robots
  let robots = await redis.get(`robots-${domain}`)
  if (robots === undefined) {
    const robotsTxt = await (await fetch('http://' + domain + '/robots.txt')).text()
    robots = robotsTxt.includes('User-Agent: Mathilda\nDisallow: /') || robotsTxt.includes('User-Agent: Mathilda\r\nDisallow: /') ? 'disallow' : 'allow'
    await redis.set(`robots-${domain}`, robots)
  }

  if (robots == 'disallow') throw new Error('Action disallowed by robots.txt')

  const keyname = `fetch-cache-${lang}-${url.replaceAll(':', '-')}`
  const cache = await redis.get(keyname)
  if (cache !== undefined) {
    return cache
  } else {
    const lastFetch = await redis.get('last-fetch-' + domain)
    if (lastFetch !== undefined && parseInt(lastFetch) > Date.now() - (1000 * 30)) {
      throw new Error('Rate limit exceeded')
    }

    const resolved = await resolveURL(url, lang)
    if (resolved === undefined) throw new Error('Bail - unable to handle URL shenanigans')
    console.log(resolved.urlTrail)
    const text = await resolved.response.text()

    const tx = redis.tx()
    tx.set('last-fetch-' + domain, Date.now())
    tx.expire('last-fetch-' + domain, 60 * 5)
    tx.set(keyname, text)
    tx.expire(keyname, 60 * 60 * 24)
    await tx.flush()
    return text
  }
}
