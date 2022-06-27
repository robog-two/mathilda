import { Redis } from 'https://deno.land/x/redis@v0.26.0/mod.ts'
import { isFetchable } from './isFetchable.ts'
import { preferredLanguages } from 'https://deno.land/x/negotiator@1.0.1/src/language.ts'

interface ResolutionResult {
  response: string
  url: string
  urlTrail: Array<string>
}

function cookieString(cookies: Record<string, string>): string {
  let string = ''
  for (const cookie in cookies) {
    string = `${string}${cookie}=${cookies[cookie]}; `
  }
  string = string.slice(0, string.length - 2)
  return string
}

export async function resolveURL(originalUrl: string, redis: Redis, acceptLanguageHeader = 'en-US'): Promise<ResolutionResult | undefined> {
  acceptLanguageHeader = preferredLanguages(acceptLanguageHeader)?.[0] ?? 'en-US'
  const cache = await redis.get(`resolve-cache-${acceptLanguageHeader}-${originalUrl.replaceAll(':', '-')}`)
  if (cache !== undefined) {
    return JSON.parse(cache)
  } else {
    let response: Response | undefined
    const trail: Array<string> = [originalUrl]
    let newURL = originalUrl
    const cookie: Record<string, string> = {}
    let tries = 0
    console.log('[ ] Starting request')
    while ((response === undefined || (response.headers.has('set-cookie') && cookie === {}) || (response.headers.has('location')) || response.status === 301 || response.status === 302) && tries < 30) {
      if (!isFetchable(newURL, redis)) { return undefined }
      response = (await fetch(
        newURL,
        {
          headers: {
            'accept-language': acceptLanguageHeader,
            'cookie': cookieString(cookie),
            'user-agent': 'Mathilda (+https://wishlily.app/bot)'
          },
          redirect: 'manual'
        }
      ))
      const loc = response.headers.get('location')
      if ((response.status === 301 || response.status === 302) && loc) {
        console.log(` |  Redirected to "${loc}"`)
        trail.push(newURL)
        newURL = loc
      }

      response.headers.forEach((cookieHeader, key) => {
        if (key === 'set-cookie') {
          const cookies = cookieHeader?.split('; ')
          if (cookies) {
            for (const eachCookie of cookies) {
              if (eachCookie.includes('=')) {
                const newCookie = eachCookie?.split('=')
                if (!['path','expires', 'domain', 'samesite', 'max-age', 'mode', 'dur', '', ' '].includes(newCookie[0].toString().toLocaleLowerCase()) && newCookie[0] !== undefined && newCookie[1] !== undefined) {
                  if (newCookie) {
                    cookie[newCookie[0]] = newCookie[1]
                    console.log(` |  Cookie "${newCookie[0]}" set to "${newCookie[1]}"`)
                  }
                }
              }
            }
          }
        }
      })
      tries++
    }
    if (tries === 30 || response === undefined) {
      console.log(`[ ] Could not resolve URL`)
      return undefined
    } else {
      console.log(`[X] Successfuly found final URL!`)

      const toCache = {
        response: await response.text(),
        url: newURL,
        urlTrail: trail
      }

      const tx = redis.tx()
      // Cache this response for all URLs in the trail of redirects
      for (const trailURL of trail) {
        const keyname = `resolve-cache-${acceptLanguageHeader}-${trailURL.replaceAll(':', '-')}`
        tx.set(keyname, JSON.stringify(toCache))
        tx.expire(keyname, 60 * 60 * 24)
      }
      await tx.flush()

      return toCache
    }
  }
}
