import { Router, Status } from 'https://deno.land/x/oak@v10.6.0/mod.ts'
import { DOMParser, HTMLDocument } from 'https://deno.land/x/deno_dom@v0.1.22-alpha/deno-dom-wasm.ts'
import { Html5Entities } from 'https://deno.land/x/html_entities@v1.0/mod.js'
import { cfetch } from '../helpers/cfetch.ts'
import { Redis } from 'https://deno.land/x/redis@v0.26.0/mod.ts'

export function etsyEmbedRoutes(router: Router, redis: Redis) {
  router.get('/etsy/search', async (ctx) => {
    try {
      const lang = ctx.request.headers.get('Accept-Language')
      const query = ctx.request.url.searchParams.get('q')
      const results = await cfetch(`https://etsy.com/search?q=${query}`, lang ?? 'en-US,en;q=0.5', redis)
      const document: HTMLDocument | null = new DOMParser().parseFromString(results, 'text/html')
      const links = document?.getElementsByClassName('v2-listing-card')

      const resultsJSON = []
      if (links) {
        for (const link of links) {
          const productinfo = link.getElementsByClassName('v2-listing-card__info')[0]
          const title = productinfo.getElementsByClassName('v2-listing-card__title')[0].textContent.replace('\\n', '').trim()
          const cover = link.getElementsByClassName('wt-width-full')?.[0]?.outerHTML?.match(/src="(.*?)"/)?.[1]
          const price = productinfo.getElementsByClassName('currency-symbol')[0].textContent + productinfo.getElementsByClassName('currency-value')[0].textContent
          const buyLink = link?.outerHTML?.match(/href="(.*?)\?.*?"/)?.[1]

          resultsJSON.push({
            title,
            price,
            cover,
            link: buyLink,
            id: buyLink?.match(/.*?listing\/(.*)/)?.[1]
          })
        }

        ctx.response.body = {
          message: resultsJSON,
          success: true,
        }
      } else {
        ctx.response.body = {
          message: 'No products found.',
          success: false
        }
        return
      }
    } catch (e) {
      console.error(e)
      ctx.response.body = {
        message: e.message ?? 'Internal error occurred.',
        success: false,
      }
      ctx.response.status = Status.InternalServerError
    }
  })

  router.get('/etsy/product', async (ctx) => {
    const id = ctx.request.url.searchParams.get('id')
    try {
      const lang = ctx.request.headers.get('Accept-Language')
      const results = await cfetch(`https://etsy.com/listing/${id}`, lang ?? 'en-US,en;q=0.5', redis)

      const document: HTMLDocument | null = new DOMParser().parseFromString(results, 'text/html')
      const description = document?.getElementById('listing-page-cart')
      const cover = document?.querySelector('img.wt-max-width-full')?.outerHTML?.match(/src=\\?"(.*?)\\?"/)?.[1]
      const title = description?.getElementsByClassName('wt-text-body-03')?.[0]?.textContent?.replace('\\n', '')?.trim()
      const price = description?.getElementsByClassName('wt-mr-xs-2')?.[0]?.textContent?.replaceAll('\\n', '')?.replaceAll('Price:', '')?.replace(/\s+/g, ' ')?.trim()

      ctx.response.body = {
        title: title ? Html5Entities.decode(title) : undefined,
        price: price ? Html5Entities.decode(price) : undefined,
        cover,
        link: `https://etsy.com/listing/${id}`,
        success: true,
      }
    } catch (e) {
      console.error(e)
      ctx.response.redirect(`${(Deno.env.get('ENVIRONMENT') === 'production' ? 'https://proxy.wishlily.app' : 'http://localhost:8080')}/generic/product?keep=true&id=https://etsy.com/listing/${id}`)
      ctx.response.status = Status.InternalServerError
    }
  })
}
