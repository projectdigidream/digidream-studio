//
// Composite textures in the studio's views (composites.js; docs/COMPOSITE_TEXTURES.md):
// the definitions the map views draw with, and the flat pictures of them the
// pages show.
//
// MapView.composites must hold a composite's name before the view that names
// it is built (its material is one from the start), so the map is kept here
// and filled in place: the module's, read back through the client's own
// parser from the lines the studio writes, over the app's. Every flat picture
// -- the page's preview, the tiles, the pickers, the map thumbnails -- comes
// from the client's JS twin of the shader (compositeSources), so it shows the
// tiles the game will.
//
import { MapView } from '/src/render/scene.js'
import * as cp from '/src/render/composite.js'
import { parseAnimations } from '/src/render/animtex.js'
import { animationsTxt } from './texsheet.js'
import { compositeProblems, renderComposite } from './composites.js'

let S = null

// A picture's pixels, by URL (a re-import is a new blob URL, so a new entry).
const pixels = new Map()
function pixelsOf (url) {
  if (!url) return Promise.resolve(null)
  if (!pixels.has(url)) {
    pixels.set(url, new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = img.naturalWidth; c.height = img.naturalHeight
        const g = c.getContext('2d', { willReadFrequently: true })
        g.drawImage(img, 0, 0)
        resolve({ data: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height })
      }
      img.onerror = () => resolve(null)
      img.src = url
    }))
  }
  return pixels.get(url)
}

// The flat pictures of composites, by name: { key, url } (key: what it was drawn from).
const thumbs = new Map()
const drawing = new Map()  // name -> the latest drawing's number, so an older one finishing late loses

/**
 * The module's composites as the client reads the file the studio writes:
 * a sheet or another composite among one's textures left out as it will be,
 * one with no textures yet absent.
 */
const ownDefs = () => parseAnimations(animationsTxt(S.module) ?? '').composites

const urlOf = (n) => S.imageUrls.get(n) ?? `/textures/${n}.png`

/**
 * Draw `def` into `canvas`: `tiles` by `tiles` of its cell at most, the canvas
 * no larger than `maxPx` a side. Resolves to what was drawn (its size), or
 * null when none of its textures has a picture.
 */
async function draw (canvas, def, { maxPx = 512, maxTiles = 8, minTiles = 2, level = 0 } = {}) {
  const pictures = await Promise.all(def.members.map((m) => pixelsOf(urlOf(m.name))))
  const overlay = def.overlay ? await pixelsOf(urlOf(def.overlay.name)) : null
  const first = pictures.find(Boolean)
  if (!first) return null
  const across = (n) => Math.max(minTiles, Math.min(maxTiles, Math.floor(maxPx / n)))
  const out = renderComposite(cp, def, pictures, overlay, { tilesX: across(first.w), tilesY: across(first.h), level })
  if (!out) return null
  canvas.width = out.w; canvas.height = out.h
  canvas.getContext('2d').putImageData(new ImageData(out.data, out.w, out.h), 0, 0)
  return out
}

/** Its thumbnail: a few tiles, as a blob URL. */
async function thumbOf (name, def) {
  const key = JSON.stringify([{ ...def, line: 0 }, ...[...def.members.map((m) => m.name), def.overlay?.name].map((n) => n && urlOf(n))])
  if (thumbs.get(name)?.key === key) return thumbs.get(name).url
  const n = (drawing.get(name) ?? 0) + 1
  drawing.set(name, n)
  const c = document.createElement('canvas')
  const drawn = await draw(c, def, { maxPx: 192, maxTiles: 4 })
  const blob = drawn && await new Promise((resolve) => c.toBlob(resolve, 'image/png'))
  if (drawing.get(name) !== n) return thumbs.get(name)?.url ?? null  // a newer drawing is on its way
  const had = thumbs.get(name)
  if (had?.url) URL.revokeObjectURL(had.url)
  if (!blob) { thumbs.delete(name); return null }
  const url = URL.createObjectURL(blob)
  thumbs.set(name, { key, url })
  return url
}

/** Hand it the studio's state, and publish what others call. */
export function install (s) {
  S = s
  S.compositeDefs = new Map()
  MapView.composites = S.compositeDefs
  /** The module's own composites, by name (one with no textures yet among them). */
  S.isComposite = (n) => !!S.module?.composites?.[n] || S.compositeDefs.has(n)
  /** One of the module's, as it stands this moment (the page's preview, mid-drag). */
  S.compositeDefOf = (name) => ownDefs().get(name) ?? null
  S.drawComposite = draw
  /**
   * The module changed: the definitions the views draw with, now (a bake
   * reads them next), and the pictures of them after -- resolved once drawn.
   */
  S.refreshComposites = () => {
    S.compositeDefs.clear()
    for (const [n, d] of S.servedAnim?.composites ?? []) if (!S.module?.composites?.[n]) S.compositeDefs.set(n, d)
    for (const [n, d] of ownDefs()) S.compositeDefs.set(n, d)
    for (const [n, t] of thumbs) if (!S.compositeDefs.has(n)) { URL.revokeObjectURL(t.url); thumbs.delete(n) }
    S.compositesDrawn = Promise.all([...S.compositeDefs].map(([n, d]) => thumbOf(n, d).catch(() => null)))
    return S.compositesDrawn
  }
  /** A composite's flat picture's URL, once drawn; '' before (or with no pictures). */
  S.compositeThumb = (n) => thumbs.get(n)?.url ?? ''
  /** What the client would leave out or refuse, for the page and the problems list. */
  S.compositeProblems = (n, c) => compositeProblems(n, c, {
    sizeOf: (t) => S.module?.textures?.[t] ?? (S.textureSizes?.[t] ? { w: S.textureSizes[t][0], h: S.textureSizes[t][1] } : null),
    isSheet: (t) => !!S.sheetOf?.(t),
    isComposite: (t) => S.isComposite(t),
    isTexture: (t) => !!S.module?.textures?.[t] || !!S.textureSizes?.[t]
  })
}
