import { Redis } from 'https://deno.land/x/redis@v0.26.0/mod.ts'

export async function isFetchable(url: string, redis: Redis): Promise<boolean> {
  try {
    const domain = new URL(url).hostname

    // Check robots
    let robots = await redis.get(`robots-${domain}`)
    // expire robots txt if it was b4 we actually assumed they could change
    await redis.sendCommand('EXPIRE', `robots-${domain}`, 1, 'NX')
    if (robots === undefined) {
      try {
        const robotsTxt = await (await fetch('http://' + domain + '/robots.txt')).text()
        robots = robotsTxt.includes('User-Agent: Mathilda\nDisallow: /') || robotsTxt.includes('User-Agent: Mathilda\r\nDisallow: /') ? 'disallow' : 'allow'
        await redis.set(`robots-${domain}`, robots)
        await redis.expire(`robots-${domain}`, 60 * 60 * 12)
      } catch (e) {
        console.log(e)
        robots = 'allow'
        await redis.set(`robots-${domain}`, robots)
        await redis.expire(`robots-${domain}`, 60 * 60 * 12)
      }
    }

    // Robots.txt doesnt like us
    if (robots == 'disallow') return false

    const fetchCount = await redis.get('last-fetch-' + domain)
    if (fetchCount !== undefined && parseInt(fetchCount) >= 5) {
      // Rate limit exceeded (5 reqs / 5 min)
      return false
    }

    const tx = redis.tx()
    tx.incr('last-fetch-' + domain)
    tx.sendCommand('EXPIRE', 'last-fetch-' + domain, 60 * 5, 'NX')
    await tx.flush()
    return true
  } catch (e) {
    console.log(e)
    return false
  }
}
