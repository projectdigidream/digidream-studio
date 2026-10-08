//
// THE TEXTURE BAKER: a qPainter project (.texproj.json) -> the texture the game
// loads (assets/textures/NAME.png). A baker (docs/PLUGINS.md, Bakers): no DOM,
// the same bytes in a page's Worker and in node.
//
// What qPainter's own export does, without a canvas: each frame is its
// visible layers composited bottom-up, "source-over" with the layer's opacity
// (textureeditor/src/doc.ts, composite). One frame is the picture; several
// are stacked top to bottom into a sheet (its sheetBlob(vertical)) and the
// texture is animated at the project's fps (docs/TEXTURE_SHEETS.md).
//
// A single visible layer at full opacity is copied, not blended, so its
// half-transparent pixels survive exactly, as in qPainter's export. With more
// layers the arithmetic is straight-alpha in floats, rounded once; a canvas
// works premultiplied, so a semi-transparent pixel can differ from qPainter's
// own PNG by one step. The bake is the definition.
//
import { decodePng, encodePng, dataUrlBytes } from './png.js'

export const version = '2'

/** One cel, as a project keeps it: a data URL, or (from a library) { width, height, data }. */
function cel (v, w, h) {
  if (typeof v === 'string') {
    const img = decodePng(dataUrlBytes(v))
    if (img.w !== w || img.h !== h) throw new Error(`a ${img.w}×${img.h} layer in a ${w}×${h} project`)
    return img.rgba
  }
  if (v && v.data && v.width === w && v.height === h) return Uint8Array.from(v.data)
  throw new Error('a layer it cannot read')
}

/** Composite one frame of `layers` ([{ visible, opacity, cels: [rgba] }]) into a fresh RGBA. */
export function compositeFrame (layers, frame, w, h) {
  const seen = layers.filter((l) => l.visible !== false && (l.opacity ?? 1) > 0)
  const out = new Uint8Array(w * h * 4)
  if (seen.length === 1 && (seen[0].opacity ?? 1) >= 1) {
    out.set(seen[0].cels[Math.min(frame, seen[0].cels.length - 1)])
    return out
  }
  for (const l of seen) {
    const src = l.cels[Math.min(frame, l.cels.length - 1)]
    const op = Math.min(1, Math.max(0, l.opacity ?? 1))
    for (let i = 0; i < out.length; i += 4) {
      const as = (src[i + 3] / 255) * op
      if (as === 0) continue
      const ad = out[i + 3] / 255
      const ao = as + ad * (1 - as)
      for (let c = 0; c < 3; c++) out[i + c] = Math.round((src[i + c] * as + out[i + c] * ad * (1 - as)) / ao)
      out[i + 3] = Math.round(ao * 255)
    }
  }
  return out
}

/**
 * @param key    the texture's name in the module
 * @param bytes  the project's JSON
 * @returns { files: { 'textures/NAME.png': bytes }, meta: { w, h, sheet? }, problems }
 */
export async function bake ({ key, bytes }) {
  const p = JSON.parse(new TextDecoder().decode(bytes))
  const w = p.w, h = p.h
  if (!(Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0 && w <= 4096 && h <= 4096)) throw new Error(`a project of size ${w}×${h}`)
  if (!Array.isArray(p.layers) || !p.layers.length) throw new Error('a project with no layers')
  const layers = p.layers.map((l) => ({ visible: l.visible, opacity: l.opacity, cels: (l.cels ?? [l.data]).map((c) => cel(c, w, h)) }))
  const frames = Math.max(...layers.map((l) => l.cels.length))
  const sheet = new Uint8Array(w * h * 4 * frames)
  for (let f = 0; f < frames; f++) sheet.set(compositeFrame(layers, f, w, h), f * w * h * 4)
  const png = encodePng(w, h * frames, sheet)
  const meta = { w, h: h * frames }
  if (frames > 1) meta.sheet = { layout: 'vertical', frames, fps: p.fps ?? 8 }
  return { files: { [`textures/${key}.png`]: png }, meta, problems: [] }
}
