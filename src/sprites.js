//
// The pictures of placed things, for the viewport.
//
// A placed monster or prop is drawn as its own first frame -- the picture the
// game will draw, facing the camera -- rather than a label with its name. The
// picture comes from wherever the game would get it: the module's imported
// sheets (blobs in the record), or the catalogue served at /sprites/: an
// `atlas` kind's sheet, or a classic kind's first frame PNG.
//
// The frame conventions are the client's (client/src/render/atlas.js): which
// key is view 1 of frame 0, how big the quad is for the sheet's world height,
// and which rectangle of the sheet to cut. Nothing here re-decides them.
//
import * as THREE from 'three'
import { parseAtlas, frameKey, quadFor, uvFor } from '/src/render/atlas.js'

export class SpriteLibrary {
  /**
   * @param sheets      Map name -> { atlas (parsed), imageUrl }: the module's own
   * @param kinds       parseProps().kinds of the served catalogue
   * @param moduleProps () => the module document's props
   * @param onLoad      called when a picture arrives, to redraw
   */
  constructor ({ sheets, kinds, moduleProps, onLoad, imageFor = null }) {
    this.sheets = sheets
    this.kinds = kinds
    this.moduleProps = moduleProps
    this.onLoad = onLoad
    this.imageFor = imageFor
    this.entries = new Map()      // name -> entry | null (no picture) | 'loading'
    this.loader = new THREE.TextureLoader()
  }

  forget (name) { this.entries.delete(name) }
  forgetAll () { this.entries.clear() }

  /**
   * The picture for a thing called `name`: { texture, w, h, dy } with the
   * texture already cut to the frame, or null while it loads or when there
   * is none.
   */
  iconFor (name) {
    const have = this.entries.get(name)
    if (have === 'loading') return null
    if (have !== undefined) return have
    this.entries.set(name, 'loading')
    this.#load(name).then((entry) => { this.entries.set(name, entry); if (entry) this.onLoad() })
      .catch(() => this.entries.set(name, null))
    return null
  }

  async #load (name) {
    const mp = (this.moduleProps() ?? []).find((p) => p.name === name)
    // The kind's drawing scale, the way the game's props.js applies it: a
    // multiplier on the picture's own size, 1 unless the record says.
    const scale = Number(mp?.scale) > 0 ? Number(mp.scale) : 1
    if (mp?.art?.kind === 'atlas' && mp.art.sheet) {
      const icon = await this.#atlasIcon(mp.art.sheet, mp.art.states?.[0])
      return icon ? { ...icon, w: icon.w * scale, h: icon.h * scale, dy: icon.dy * scale } : null
    }
    if (mp?.art?.kind === 'sprite') {
      // One picture of the module's own, standing as tall as the record says.
      const frame = mp.art.states?.[0]?.frames?.[0]
      const tex = frame ? await this.#texture(this.imageFor?.(frame) ?? `/sprites/${frame}.png`) : null
      if (!tex) return null
      const h = (mp.art.size ?? mp.height ?? 1) * scale
      return { texture: tex, w: h * (tex.image.width / tex.image.height), h, dy: h / 2 }
    }
    const k = [...this.kinds.values()].find((x) => x.name === name)
    if (!k) return null
    if (k.type === 'atlas' && k.sheet) return this.#atlasIcon(k.sheet, k.states.get(0)?.anim)
    if (k.type === 'sprite') {
      const st = k.states.get(0) ?? [...k.states.values()][0]
      const frame = st?.frames?.[0]
      if (!frame) return null
      const tex = await this.#texture(`/sprites/${frame}${k.rot8 ? '1' : ''}.png`)
      if (!tex) return null
      const h = k.size ?? 1
      return { texture: tex, w: h * (tex.image.width / tex.image.height), h, dy: h / 2 }
    }
    return null
  }

  async #atlasIcon (sheet, animName) {
    let src = this.sheets.get(sheet)
    if (!src) {
      const json = await fetch(`/sprites/${sheet}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      if (!json) return null
      src = { atlas: parseAtlas(json, sheet), imageUrl: `/sprites/${json.image}` }
    }
    const atlas = src.atlas
    const anim = animName && atlas.animations.some((a) => a.name === animName) ? animName : atlas.animations[0]?.name
    if (!anim) return null
    const key = frameKey(atlas, anim, 0, 1)
    const q = quadFor(atlas, key)
    const uv = uvFor(atlas, key)
    if (!q || !uv) return null
    const whole = await this.#texture(src.imageUrl)
    if (!whole) return null
    // One texture per frame: the same image, cut by offset and repeat.
    const tex = whole.clone()
    tex.offset.set(uv[0], uv[5])
    tex.repeat.set(uv[2] - uv[0], uv[1] - uv[5])
    tex.needsUpdate = true
    return { texture: tex, w: q.w, h: q.h, dy: q.dy }
  }

  #texture (url) {
    return new Promise((resolve) => this.loader.load(url, (tex) => {
      tex.magFilter = THREE.NearestFilter
      tex.minFilter = THREE.NearestFilter
      tex.generateMipmaps = false
      resolve(tex)
    }, undefined, () => resolve(null)))
  }
}
