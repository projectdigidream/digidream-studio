//
// A map's thumbnail: its rooms from above, north up, drawn from the document.
//
// 2D canvas, not a bake: a thumbnail is a glance at a map's shape, wanted for
// every map on the Home and in the metamap's grid at once, and a bake each
// would cost a compiler run per tile. So it is the document's own polygons --
// each room filled with its floor texture (or a shade of its floor height
// while the picture loads), larger rooms first so a pillar or a pit inside one
// is drawn over it -- with the start and the placed things as dots.
//

import { withAlpha } from './skin.js'

/**
 * How the map fits a w x h canvas with `pad` pixels round it: canvas x = ox +
 * k * x, canvas y = oy - k * y (north up). Null for a map with no rooms.
 */
export function thumbTransform (doc, w, h, pad = 4, bounds = null) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity
  for (const sid of doc.order ?? []) for (const v of doc.sectors[sid]?.verts ?? []) {
    x0 = Math.min(x0, v.x); y0 = Math.min(y0, v.y); x1 = Math.max(x1, v.x); y1 = Math.max(y1, v.y)
  }
  if (!Number.isFinite(x0)) return null
  // A fixed frame (a metamap cell, 0 to the pitch): every map at one scale.
  if (bounds) { [x0, y0, x1, y1] = bounds; pad = 0 }
  const k = Math.min((w - 2 * pad) / Math.max(1e-6, x1 - x0), (h - 2 * pad) / Math.max(1e-6, y1 - y0))
  // Centred both ways.
  const ox = (w - k * (x1 - x0)) / 2 - k * x0
  const oy = (h + k * (y1 - y0)) / 2 + k * y0
  return { k, ox, oy }
}

const area = (verts) => {
  let a = 0
  for (let i = 0; i < verts.length; i++) { const p = verts[i]; const q = verts[(i + 1) % verts.length]; a += p.x * q.y - q.x * p.y }
  return Math.abs(a) / 2
}

const images = new Map()        // url -> HTMLImageElement (loading or loaded)

/** The floor picture, once; `onLoad` when it arrives so the thumbnail is drawn again. */
function imageAt (url, onLoad) {
  let img = images.get(url)
  if (!img) {
    img = new Image()
    img.decoding = 'async'
    img.src = url
    images.set(url, img)
  }
  if (!img.complete) img.addEventListener('load', onLoad, { once: true })
  return img.complete && img.naturalWidth ? img : null
}

/**
 * Draw `doc` into `canvas`.
 * @param imageFor  (texture name) -> URL
 * @param skin      the studio's skin (S.skin): the stage, room, line and dot colours (preview.thumb.*)
 * @param bounds    [x0, y0, x1, y1] to frame instead of the map's own extent
 */
export function drawThumb (canvas, doc, { imageFor = (n) => `/textures/${n}.png`, bounds = null, skin } = {}) {
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1)
  const w = canvas.clientWidth || Number(canvas.getAttribute('width')) || 160
  const h = canvas.clientHeight || Number(canvas.getAttribute('height')) || 100
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
  const g = canvas.getContext('2d')
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  const cv = (key) => skin.canvas('preview', `thumb.${key}`)
  g.fillStyle = skin.canvas('common', 'stage').fill
  g.fillRect(0, 0, w, h)
  const t = thumbTransform(doc, w, h, 4, bounds)
  if (!t) return
  const X = (x) => t.ox + t.k * x
  const Y = (y) => t.oy - t.k * y
  const redraw = () => drawThumb(canvas, doc, { imageFor, bounds, skin })
  const floors = (doc.order ?? []).map((sid) => doc.sectors[sid]).filter((s) => s && s.verts?.length >= 3)
  const lo = Math.min(...floors.map((s) => s.floor)); const hi = Math.max(...floors.map((s) => s.floor))
  floors.sort((a, b) => area(b.verts) - area(a.verts))
  for (const s of floors) {
    g.beginPath()
    s.verts.forEach((v, i) => (i ? g.lineTo(X(v.x), Y(v.y)) : g.moveTo(X(v.x), Y(v.y))))
    g.closePath()
    const img = s.floorTex ? imageAt(imageFor(s.floorTex), redraw) : null
    if (img) {
      const pat = g.createPattern(img, 'repeat')
      // The texture's own scale: texscale pixels to a unit, world-aligned.
      pat.setTransform(new DOMMatrix().translate(t.ox, t.oy).scale(t.k / (doc.texscale || 32)))
      g.fillStyle = pat
      g.fill()
      g.fillStyle = `rgba(0,0,0,${0.55 - 0.55 * (s.light ?? 255) / 255})` // the room's own light: content, as the game darkens it
      g.fill()
    } else {
      // The skin's room colour, lighter the higher the floor.
      const f = hi > lo ? (s.floor - lo) / (hi - lo) : 0.5
      g.fillStyle = cv('room').fill
      g.fill()
      g.fillStyle = withAlpha(skin.canvas('common', 'stage').fill, 0.5 * (1 - f))
      g.fill()
    }
    g.strokeStyle = cv('line').color
    g.lineWidth = 1
    g.stroke()
  }
  const dot = (x, y, color, r = 2.5) => { g.beginPath(); g.arc(X(x), Y(y), r, 0, Math.PI * 2); g.fillStyle = color; g.fill() }
  for (const e of doc.entities ?? []) dot(e.x, e.y, cv(e.kind === 'mob' ? 'monster' : 'prop').fill, 2)
  for (const p of doc.spawns ?? []) dot(p.x, p.y, cv('spawn').fill, 3)
}

/** A canvas showing `doc`, drawn once it is in the page and has a size. */
export function thumbCanvas (doc, opts = {}, cls = 'sd-thumb') {
  const c = document.createElement('canvas')
  c.className = cls
  c.dataset.thumb = doc.name ?? ''
  c.thumb = { doc, opts }
  requestAnimationFrame(() => drawThumb(c, doc, opts))
  return c
}

/** Draw every thumbnail on the page again (the skin changed). */
export function redrawThumbs (skin, root = document) {
  for (const c of root.querySelectorAll('canvas[data-thumb]')) if (c.thumb) drawThumb(c, c.thumb.doc, { ...c.thumb.opts, skin })
}
