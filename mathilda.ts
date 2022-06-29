import { Application, Router, Status } from 'https://deno.land/x/oak@v10.6.0/mod.ts'
import { CORS } from 'https://deno.land/x/oak_cors@v0.1.1/mod.ts'
import { amazonEmbedRoutes } from './storefronts/amazon.ts'
import { etsyEmbedRoutes } from './storefronts/etsy.ts'
import { genericEmbedRoutes } from './storefronts/generic.ts'
import { getRedis } from './helpers/getRedis.ts'

const router = new Router()
const redis = await getRedis()

amazonEmbedRoutes(router, redis)
etsyEmbedRoutes(router, redis)
genericEmbedRoutes(router, redis)

router.get('/', (ctx) => {
  ctx.response.status = 200
  ctx.response.body = {
    message: '🦐 WishLily Embedding API. https://wishlily.app/',
    success: true,
    env: (Deno.env.get('ENVIRONMENT') === 'production' ? undefined : Deno.env.get('ENVIRONMENT'))
  }
})

// Left here since old cached embeds may use it, and if something crazy happened with Vercel,
// this would be the fallback. But I hope my code is not that awful lol, this shouldn't be hit frequently.
router.get('/embed', async (ctx) => {
  try {
    const userId = ctx.request.url.searchParams.get('userId')
    const wishlistId = ctx.request.url.searchParams.get('wishlistId')

    const dbResponse = await fetch('https://data.mongodb-api.com/app/wishlily-website-krmwb/endpoint/list_wishlist', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        wishlistId,
        userId
      })
    })

    const list = (await dbResponse.json()).reverse()

    ctx.response.redirect(`https://imagecdn.app/v2/image/${encodeURIComponent(list[0]?.cover)}?format=webp`)
  } catch (e) {
    console.error(e)
    ctx.response.body = {
      message: e.message ?? 'Internal error occurred.',
      success: false,
    }
    ctx.response.status = Status.InternalServerError
  }
})

const app = new Application()
app.use(CORS({origin: '*'}))
if (Deno.env.get('ENVIRONMENT') !== 'PRODUCTION') {
  app.use(async (ctx, next) => {
    const body = ctx.request.hasBody ? await ctx.request.body({type: 'json', limit: 0}).value : undefined
    await next()
    console.log([
      'Request:',
      ctx.request.method + ' ' + ctx.request.url,
      body,
      'Response:',
      ctx.response.body
    ])
  })
}
app.use(router.routes())
app.use(router.allowedMethods())

app.addEventListener(
  'listen',
  (_) => console.log('Listening on http://localhost:8080'),
)
await app.listen({ port: 8080 })
