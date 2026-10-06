//
// Wall and floor pictures, decoded once and kept.
//
// Every bake makes a new MapView, and a MapView's own loader fetches and
// decodes every texture it names. On a Doom level that is a hundred images per
// edit and a placeholder flash while they arrive -- the one cost of the
// whole-map bake that was actually visible. So the studio loads each picture
// once, configured exactly as the game configures it (client/src/render/
// textures.js's configureTexture), and hands the same texture to every view.
//
import * as THREE from 'three'
import { configureTexture } from '/src/render/textures.js'
import { TextureAnimator } from '/src/render/animtex.js'
import { frameRect } from './texsheet.js'

export class TextureCache {
  /**
   * @param urlFor  (name) => url: the module's own picture, or /textures/NAME.png
   * @param cutout  { NAME: true } from the texture index: alpha-tested pictures
   * @param sheetOf (name) => { layout, frames, fps } | null: a sprite sheet (texsheet.js)
   * @param groups  () => [{ fps, frames }]: every animation, sheets' and frame lists'
   *                (render/animtex.js parseAnimations' groups)
   */
  constructor ({ urlFor, cutout = {}, sheetOf = () => null, groups = () => [] }) {
    this.urlFor = urlFor
    this.cutout = cutout
    this.sheetOf = sheetOf
    this.groups = groups
    this.entries = new Map()       // name -> Promise<THREE.Texture | null>
    this.cuts = new Map()          // `${name}:${layout}:${frames}` -> [THREE.Texture] (frame 0 first)
  }

  /**
   * A sprite sheet cut into its frames, each its own texture so it tiles as an
   * ordinary one does -- where the client cuts it (render/textures.js cutSheet).
   */
  #cut (name, tex, spec) {
    const key = `${name}:${spec.layout}:${spec.frames}`
    if (this.cuts.has(key)) return this.cuts.get(key)
    const img = tex.image
    const out = []
    for (let k = 0; k < spec.frames; k++) {
      const r = frameRect(spec, img.width, img.height, k)
      const c = document.createElement('canvas')
      c.width = Math.max(1, r.w); c.height = Math.max(1, r.h)
      c.getContext('2d').drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h)
      const f = configureTexture(THREE, new THREE.CanvasTexture(c))
      f.name = k === 0 ? name : `${name}#${k}`
      out.push(f)
    }
    this.cuts.set(key, out)
    return out
  }

  /** A name's picture as a map shows it: a sheet's first frame, else the picture. */
  async shown (name) {
    const tex = await this.get(name)
    const spec = tex && this.sheetOf(name)
    return spec ? this.#cut(name, tex, spec)[0] : tex
  }

  /** A frame by the animator's name: NAME#k of a sheet, or another texture of a frame list. */
  async #frame (name) {
    const m = /^(.+)#(\d+)$/.exec(name)
    if (!m) return this.shown(name)
    const tex = await this.get(m[1]); const spec = tex && this.sheetOf(m[1])
    return spec ? (this.#cut(m[1], tex, spec)[Number(m[2])] ?? null) : null
  }

  /** The texture for a name, loading it the first time. Null when it cannot be loaded. */
  get (name) {
    if (!this.entries.has(name)) {
      this.entries.set(name, new Promise((resolve) => {
        new THREE.TextureLoader().load(this.urlFor(name),
          (tex) => resolve(configureTexture(THREE, tex)), undefined, () => resolve(null))
      }))
    }
    return this.entries.get(name)
  }

  /** Drop a name, when its picture changed (a re-import) or its module closed. */
  forget (name) {
    for (const [k, frames] of this.cuts) if (k.startsWith(`${name}:`)) { for (const f of frames) f.dispose(); this.cuts.delete(k) }
    const e = this.entries.get(name)
    if (!e) return
    this.entries.delete(name)
    e.then((tex) => tex?.dispose())
  }

  /** Put the pictures on a MapView's materials, loading whatever is new. */
  async apply (view, pxPerUnit) {
    await Promise.all(view.map.textures.map(async (name, i) => {
      // A sheet shows one frame, sized as one frame (as the client does).
      const tex = await this.shown(name)
      const mat = view.materials[i]
      if (!tex || !mat) return
      mat.uniforms.map.value = tex
      // Each picture covers its own amount of world (loadRealTextures does the
      // same division, from the index; here the decoded image says its size).
      mat.uniforms.repeat.value.set(pxPerUnit / tex.image.width, pxPerUnit / tex.image.height)
      if (this.cutout[name]) mat.defines = { ...(mat.defines ?? {}), CUTOUT: '' }
      mat.needsUpdate = true
    }))
    return this.animator(view)
  }

  /**
   * The client's own TextureAnimator over this view: every animation whose
   * first frame the map uses, its frames loaded first (it asks for them
   * synchronously). Null when nothing on the map moves.
   */
  async animator (view) {
    const names = view.map.textures
    const groups = this.groups().filter((g) => names.includes(g.frames[0]))
    if (!groups.length) return null
    const loaded = new Map()
    await Promise.all(groups.flatMap((g) => g.frames).map(async (n) => { const t = await this.#frame(n); if (t) loaded.set(n, t) }))
    const a = new TextureAnimator({ groups, names, materials: view.materials, frameTexture: (n) => loaded.get(n) ?? null })
    return a.count ? a : null
  }
}
