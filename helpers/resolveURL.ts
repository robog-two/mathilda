interface ResolutionResult {
  response: Response
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

export async function resolveURL(originalUrl: string, acceptLanguageHeader = 'en-US,en;q=0.5'): Promise<ResolutionResult | undefined> {
  let response: Response | undefined
  const trail: Array<string> = [originalUrl]
  let newURL = originalUrl
  const cookie: Record<string, string> = {}
  let tries = 0
  console.log('[ ] Starting request')
  while ((response === undefined || (response.headers.has('set-cookie') && cookie === {}) || (response.headers.has('location')) || response.status === 301 || response.status === 302) && tries < 30) {
    response = (await fetch(
      newURL,
      {
        headers: {
          'accept-language': acceptLanguageHeader,
          'cookie': cookieString(cookie)
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
    return {
      response,
      url: newURL,
      urlTrail: trail
    }
  }
}
