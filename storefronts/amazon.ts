import { Router, Status } from 'https://deno.land/x/oak@v10.6.0/mod.ts'
import { DOMParser, HTMLDocument } from 'https://deno.land/x/deno_dom@v0.1.22-alpha/deno-dom-wasm.ts'
import { Html5Entities } from 'https://deno.land/x/html_entities@v1.0/mod.js'
import { cfetch } from '../helpers/cfetch.ts'
import { Redis } from 'https://deno.land/x/redis@v0.26.0/mod.ts'

export function amazonEmbedRoutes(router: Router, redis: Redis) {
  router.get('/amazon/search', async (ctx) => {
    try {
      const lang = ctx.request.headers.get('Accept-Language')
      const query = ctx.request.url.searchParams.get('q')?.replace(' ', '+')
      const results = await cfetch(`https://amazon.com/s?k=${query}`, lang ?? 'en-US,en;q=0.5', redis)
      const document: HTMLDocument | null = new DOMParser().parseFromString(results, 'text/html')
      const links = document?.getElementsByClassName('a-section a-spacing-base')

      const resultsJSON = []
      if (links === undefined) {
        ctx.response.body = {
          message: 'No products found.',
          success: false
        }
        return
      }
      for (const link of links) {
        const productinfo = link?.getElementsByClassName('a-section a-spacing-small s-padding-left-small s-padding-right-small')?.[0]
        const titleEl = productinfo?.getElementsByClassName('a-section a-spacing-none a-spacing-top-small s-title-instructions-style')?.[0]
        const title = titleEl?.getElementsByClassName('a-size-base-plus a-color-base a-text-normal')?.[0]?.textContent?.replace('\\n', '')?.trim()
        const cover = link?.getElementsByClassName('s-image')[0].outerHTML.match(/src="(.*?)"/)?.[1]
        const price = productinfo?.getElementsByClassName('a-price-symbol')?.[0]?.textContent + productinfo?.getElementsByClassName('a-price-whole')?.[0]?.textContent + productinfo?.getElementsByClassName('a-price-fraction')?.[0]?.textContent
        const buyLink = titleEl?.getElementsByClassName('a-link-normal s-underline-text s-underline-link-text s-link-style a-text-normal')?.[0]?.outerHTML?.match(/href="(.*?)\?.*?"/)?.[1]

        if (title && cover && price && buyLink && !buyLink.startsWith('/gp/')) {
          resultsJSON.push({
            title,
            price,
            cover: `https://imagecdn.app/v2/image/${encodeURI(cover.replace('?', ''))}?width=400&height=200&format=webp&fit=cover`,
            link: `https://amazon.com${buyLink}`.match(/(.*?)\/ref=.*/)?.[1] ?? `https://amazon.com${buyLink}`,
            id: buyLink?.match(/\/?(.*?)\/ref=.*/)?.[1]
          })
        }
      }

      ctx.response.body = {
        message: resultsJSON,
        success: true,
      }
    } catch (e) {
      console.log(e)
      ctx.response.body = {
        message: e.message ?? 'Internal error occurred.',
        success: false,
      }
      ctx.response.status = Status.InternalServerError
    }
  })

  router.get('/amazon/product', async (ctx) => {
    const id = ctx.request.url.searchParams.get('id')
    try {
      const lang = ctx.request.headers.get('Accept-Language')
      const results = await cfetch(`https://amazon.com${id}`, lang ?? 'en-US,en;q=0.5', redis)

      const document: HTMLDocument | null = new DOMParser().parseFromString(results, 'text/html')
      let cover = document?.getElementById('landingImage')?.outerHTML?.match(/src=\\?"(.*?)\\?"/)?.[1]
      const title = document?.getElementById('productTitle')?.textContent?.replace('\\n', '')?.trim()
      const priceEl = document?.getElementsByClassName('a-price aok-align-center reinventPricePriceToPayMargin priceToPay')?.[0]
      let price: string | undefined = undefined
      if (priceEl) {
        price = priceEl?.getElementsByClassName('a-price-symbol')?.[0]?.textContent + priceEl?.getElementsByClassName('a-price-whole')?.[0]?.textContent + priceEl?.getElementsByClassName('a-price-fraction')?.[0]?.textContent
      } else {
        price = document?.getElementsByClassName('a-price a-text-price a-size-medium apexPriceToPay')?.[0]?.getElementsByClassName('a-offscreen')?.[0]?.textContent
      }

      try {
        if (price === undefined) {
          price = document?.getElementsByClassName('a-color-price')?.[0]?.textContent
        }

        if (price === '$') {
          price = document?.getElementsByClassName('swatchElement selected')?.[0]?.textContent?.match(/.*?(\$[0-9]+(?:\.|\,)[0-9][0-9])/)?.[1]
        }

        if (price === undefined) {
          price = document?.getElementsByClassName('a-text-price')?.[0]?.textContent
        }
      } catch (e) {
        console.log(e)
      }

      try {
        if (cover === undefined) {
          cover = document?.getElementById('imgBlkFront')?.outerHTML?.match(/src=\\?"(.*?)\\?"/)?.[1]
        }

        if (cover === undefined) {
          cover = document?.getElementById('detailImg')?.outerHTML?.match(/src=\\?"(.*?)\\?"/)?.[1]
        }

        if (cover === undefined) {
          cover = results?.match(/(https\:\/\/images.*?\/I\/.*?.jpg)/g)?.[0]
        }
      } catch (e) {
        console.log(e)
      }

      let bkp
      try {
        if (title === undefined || price === undefined || cover === undefined) {
          // Sometimes amazon breaks stuff.
          bkp = await(await fetch(`${(Deno.env.get('ENVIRONMENT') === 'production' ? 'https://proxy.wishlily.app' : 'http://localhost:8080')}/generic/product?keep=true&id=${encodeURIComponent('https://amazon.com' + id)}`)).json()
        }
      } catch (e) {
        // Sometimes... I break stuff
        console.log(e)
      }

      ctx.response.body = {
        title: title ? Html5Entities.decode(title) : bkp?.title,
        price: price ? Html5Entities.decode(price) : bkp?.price,
        cover: cover ?? bkp?.cover,
        link: `https://amazon.com${id}`,
        success: true,
      }
    } catch (e) {
      console.log(e)
      ctx.response.redirect(`${(Deno.env.get('ENVIRONMENT') === 'production' ? 'https://proxy.wishlily.app' : 'http://localhost:8080')}/generic/product?keep=true&id=https://amazon.com${id}`)
      ctx.response.status = Status.InternalServerError
    }
  })
}
