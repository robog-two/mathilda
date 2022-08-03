import { Redis } from 'https://deno.land/x/redis@v0.26.0/mod.ts'
import { redisTxn } from './getRedis.ts'

export async function isFetchable(url: string, redis: Redis): Promise<string | undefined> {
  try {
    const parsed = new URL(url)
    const domain = parsed.host.replaceAll(':', '-port-')

    // Check robots
    let robots: string | undefined = await redisTxn(async () => {return await redis.get(`robots-${domain}`)})
    console.log(url)
    if (robots === undefined) {
      try {
        const resp = await fetch('https://api.robotstxt.io/v1/allowed', {
          method: 'POST',
          body: JSON.stringify({
            url: parsed.origin,
            agent: 'Mathilda'
          }),
          headers: {
            'Content-Type': 'application/json'
          }
        })
        robots = (await (resp)?.json())?.allowed === false ? 'disallow' : 'allow'
      } catch (e) {
        console.error(e)
        robots = 'allow'
      }

      await redisTxn(async () => {
        await redis.set(`robots-${domain}`, robots || "allow")
        await redis.expire(`robots-${domain}`, 60 * 60 * 12)
      })
    }

    // Robots.txt doesnt like us
    if (robots == 'disallow') {
      return 'Website chose to block WishLily.'
    }

    const fetchCount = await redisTxn(async () => { return await redis.get('last-fetch-' + domain) })
    if (fetchCount !== undefined && parseInt(fetchCount) >= 5 && await redis.ttl('last-fetch-' + domain) > 0) {
      // Rate limit exceeded (5 reqs / 5 min)
      return 'Rate limit exceeded. Try again in 5 minutes.'
    }

    await redisTxn(async () => {
      await redis.incr('last-fetch-' + domain)
      if (await redis.ttl('last-fetch-' + domain) <= 0) {
        await redis.expire('last-fetch-' + domain, 60 * 5)
      }
    })

    return undefined
  } catch (e) {
    console.error(e)
    return e.message
  }
}
