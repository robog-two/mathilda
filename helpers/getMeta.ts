
import { HTMLDocument } from 'https://deno.land/x/deno_dom@v0.1.22-alpha/deno-dom-wasm.ts'

export function getMeta(document: HTMLDocument, name: string) : string | undefined {
  const byName = document.querySelector(`meta[name=\'${name}\']`)?.outerHTML.match(/content=\\?"(.*?)\\?"/)?.[1]
  const byProperty = document.querySelector(`meta[property=\'${name}\']`)?.outerHTML.match(/content=\\?"(.*?)\\?"/)?.[1]
  return byName ?? byProperty
}
