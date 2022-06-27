import { resolveURL } from './resolveURL.ts'

const cache: Map<string, string> = new Map()

// Cached fetch, also checks robots.txt & ensures rate limits.

export async function cfetch(url: string, lang: string): Promise<string> {
  if (cache.has(lang + url)) {
    return cache.get(lang + url) ?? ''
  } else {
    const resolved = await resolveURL(url, lang)
    if (resolved === undefined) throw new Error('Bail - unable to handle URL shenanigans')
    const text = await resolved.response.text()
    cache.set(lang + url, text)
    return text
  }
}
