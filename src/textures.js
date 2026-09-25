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

export class TextureCache {
  /**
   * @param urlFor  (name) => url: the module's own picture, or /textures/NAME.png
   * @param cutout  { NAME: true } from the texture index: alpha-tested pictures
   */
  constructor ({ urlFor, cutout = {} }) {
    this.urlFor = urlFor
    this.cutout = cutout
    this.entries = new Map()       // name -> Promise<THREE.Texture | null>
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
    const e = this.entries.get(name)
    if (!e) return
    this.entries.delete(name)
    e.then((tex) => tex?.dispose())
  }

  /** Put the pictures on a MapView's materials, loading whatever is new. */
  async apply (view, pxPerUnit) {
    await Promise.all(view.map.textures.map(async (name, i) => {
      const tex = await this.get(name)
      const mat = view.materials[i]
      if (!tex || !mat) return
      mat.uniforms.map.value = tex
      // Each picture covers its own amount of world (loadRealTextures does the
      // same division, from the index; here the decoded image says its size).
      mat.uniforms.repeat.value.set(pxPerUnit / tex.image.width, pxPerUnit / tex.image.height)
      if (this.cutout[name]) mat.defines = { ...(mat.defines ?? {}), CUTOUT: '' }
      mat.needsUpdate = true
    }))
  }
}
