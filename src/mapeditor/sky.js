//
// The sky in the studio: the client's own Sky (render/sky.js) behind the level
// view, and on every sky flat (F_SKY*) the client's MapView draws there.
//
// The client loads a sky's pictures from /textures/<name>.png. A module's own
// textures live in the studio's store, not behind that URL, so the Sky is
// given a three.js whose texture loaders look each name up in the studio
// first (S.imageFor: the module's copy, else the served one). Everything else
// -- the strip's horizon and caps, the panorama, the cube's faces -- is the
// client's code, unchanged: what the level view shows is what the game draws.
//
import * as THREE from 'three'
import { Sky, skyFromMessage } from '/src/render/sky.js'
import { MapView } from '/src/render/scene.js'
import { skyFor, skyMessage } from '../sky_emit.js'

let S = null

/** three.js, with its texture loaders reading the studio's pictures by name. */
export function studioThree (imageFor) {
  const resolve = (url) => {
    const m = /^\/textures\/(.+)\.png$/.exec(url)
    return m ? imageFor(decodeURIComponent(m[1])) : url
  }
  class TextureLoader extends THREE.TextureLoader {
    load (url, ...rest) { return super.load(resolve(url), ...rest) }
  }
  class CubeTextureLoader extends THREE.CubeTextureLoader {
    load (urls, ...rest) { return super.load(urls.map(resolve), ...rest) }
  }
  return { ...THREE, TextureLoader, CubeTextureLoader }
}

/** A Sky for a renderer of the studio's own (the Sky section's preview). */
export const studioSky = (opts = {}) => new Sky(studioThree((n) => S.imageFor(n)), { warn: (m) => console.warn(m), ...opts })

/** The level view's sky: the map's own, else the module's. */
export function applySky () {
  if (!S?.levelSky) return
  S.levelSky.set(skyFromMessage(skyMessage(skyFor(S.module, S.doc)))).then(() => { if (S.viewport) S.viewport.dirty = true })
  if (S.viewport) S.viewport.dirty = true
}

export function install (s) {
  S = s
  // One Sky for the level view, before any MapView is made: its sky flats wear its material.
  S.levelSky = studioSky()
  MapView.sky = S.levelSky
  S.viewport.setSky(S.levelSky)
  S.applySky = applySky
  S.studioSky = studioSky
  applySky()
}
