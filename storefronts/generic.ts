import { Router, Status } from 'https://deno.land/x/oak@v10.6.0/mod.ts'
import { DOMParser, HTMLDocument } from 'https://deno.land/x/deno_dom@v0.1.22-alpha/deno-dom-wasm.ts'
import { Html5Entities } from 'https://deno.land/x/html_entities@v1.0/mod.js'
import { cfetch } from '../helpers/cfetch.ts'
import { resolveURL } from '../helpers/resolveURL.ts'
import { getMeta } from '../helpers/getMeta.ts'
import { Redis } from 'https://deno.land/x/redis@v0.26.0/mod.ts'

export function genericEmbedRoutes(router: Router, redis: Redis) {
  router.get('/generic/product', async (ctx) => {
    let id: string | undefined
    try {
      const lang = ctx.request.headers.get('Accept-Language')
      const idp = ctx.request.url.searchParams.get('id')
      id = idp ? decodeURIComponent(idp) : undefined
      id = (await resolveURL(id ?? ''))?.url ?? id
      if (id === undefined) throw new Error('URL is required.')
      const keep = ctx.request.url.searchParams.get('keep')
      if (id?.includes('proxy.wishlily.app') || id?.includes('deno.dev')) throw new Error('Infinite proxy loop!')

      // Handle known link types (a little sloppy but it shouldn't really matter)
      if (keep !== 'true') {
        if (id?.includes('amazon.com')) {
          ctx.response.redirect(`${(Deno.env.get('ENVIRONMENT') === 'production' ? 'https://proxy.wishlily.app' : 'http://localhost:8080')}/amazon/product?id=/dp${id.match(/.*?h?t?t?p?s?:?\/?\/?w?w?w?.?amazon\.com\/?.*?\/(?:dp|gp)\/?(?:product)?a?w?\/?d?\/?(?:product)?(\/[0-9A-Z]{10}).*/)?.[1]}`)
          return
        }
        if (id?.includes('etsy.com')) {
          ctx.response.redirect(`${(Deno.env.get('ENVIRONMENT') === 'production' ? 'https://proxy.wishlily.app' : 'http://localhost:8080')}/etsy/product?id=${((id + '?').replace(/\/$/, '')).match(/h?t?t?p?s?:?\/?\/?w?w?w?.?etsy\.com\/listing\/(.*?)\?.*/)?.[1]}`)
          return
        }
      }

      if (id?.includes('amazon.com')) {
        id = `https://amazon.com/dp${id.match(/.*?h?t?t?p?s?:?\/?\/?w?w?w?.?amazon\.com\/?.*?\/(?:dp|gp)\/?(?:product)?a?w?\/?d?\/?(?:product)?(\/[0-9A-Z]{10}).*/)?.[1]}`
      }

      let results
      let document: HTMLDocument
      try {
        results = await cfetch(`${id}`, lang ?? 'en-US,en;q=0.5', redis)
        const tempDocument = new DOMParser().parseFromString(results, 'text/html')
        if (tempDocument === null) throw new Error('Cannot load website.')
        document = tempDocument
      } catch (e) {
        if (keep !== 'true') {
          console.log('(Interpreting as a search)')
          console.log(e)
          // It's not a working URL - It's probably a search!
          ctx.response.body = {
            isSearch: true,
            success: true,
          }
          return
        } else {
          throw e // Re-throw to catch below.
        }
      }
      const cover = getMeta(document, 'og:image') ?? getMeta(document, 'twitter:image:src')
      const title = getMeta(document, 'title') ?? getMeta(document, 'og:title') ?? getMeta(document, 'twitter:title')
      let shopifyPrice = ((getMeta(document, 'product:price:currency') == 'USD' || (getMeta(document, 'product:price:currency') === undefined && getMeta(document, 'product:price:amount'))) ? `$${getMeta(document, 'product:price:amount')}` : undefined)
      let ogPrice = ((getMeta(document, 'og:price:currency') == 'USD' || (getMeta(document, 'og:price:currency') === undefined && getMeta(document, 'og:price:amount'))) ? `$${getMeta(document, 'og:price:amount')}` : undefined)
      const regexPrices = results.match(/\$[\n\\n\s\t ]*?([0-9]+?\.?[0-9][0-9])/g)?.reverse() ?? []
      let regexPrice
      for (const thep of regexPrices) {
        const thep2 = thep.replace('$', '').replace('\\', '').replace('n', '').replace('\n', '').replace(' ', '')
        if (regexPrice === undefined && thep2 !== '0.00' && thep2 !== '0' && thep.match(/[0]?/)?.[0] !== thep) {
          regexPrice = thep2
        }
      }
      if (shopifyPrice === '$0.00' || shopifyPrice === '$0') shopifyPrice = undefined
      if (ogPrice === '$0.00' || ogPrice === '$0') ogPrice = undefined
      if (regexPrice) regexPrice = '$' + regexPrice
      const price = shopifyPrice ?? ogPrice ?? regexPrice

      //if(cover === undefined || title === undefined) throw new Error('Unable to parse link.')

      ctx.response.body = {
        isSearch: false,
        title: title ? Html5Entities.decode(title) : undefined,
        price: price === '$0.00' ? undefined : price,
        cover,
        link: id?.toString() ?? 'https://wishlily.app/',
        success: true,
      }
    } catch (e) {
      console.log(e)
      ctx.response.body = {
        message: e.message ?? 'Internal error occurred.',
        success: false,
        id
      }
      ctx.response.status = Status.InternalServerError
    }
  })

  router.get('/generic/search', (ctx) => {
    ctx.response.redirect(`${(Deno.env.get('ENVIRONMENT') === 'production' ? 'https://proxy.wishlily.app' : 'http://localhost:8080')}/etsy/search?q=${ctx.request.url.searchParams.get('q')}`)
  })
}
