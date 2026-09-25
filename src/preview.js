//
// From the document to the picture: bake, load, draw -- and, while a corner
// is being dragged, reshape one sector without baking at all.
//
// A COMMIT IS A REAL BAKE. The same mapc, the same loader, the same mesh
// builder the game uses, so the picture at rest cannot show a room the game
// would refuse. When mapc refuses, the last good picture stays and the
// complaints go to the status line with their line numbers. Textures are not
// part of that cost: TextureCache hands every view the pictures it already
// decoded.
//
// A DRAG IS A STAGED EDIT. The core's map builder was written for an editor
// (client/wasm/bindings.cpp: dnp_map_stage_point / dnp_map_commit_shape):
// the moved corners are staged on the loaded map, committed -- which
// re-triangulates that one sector, transactionally, keeping the old mesh if
// the new outline cannot be meshed -- and only that sector and its neighbours
// are rebuilt (MapView.setDynamicSectors). No bake, no new view, no texture
// work, per frame if wanted. Adjacency and mapc's overlap rules are global, so
// the release still bakes: a corner dragged onto another room's wall becomes a
// shared edge only when the whole map is looked at again.
//
import { MapView } from '/src/render/scene.js'
import { readMap } from '/src/mapdata.js'
import { emitLevel } from './module_emit.js'

const INTERVAL_MS = 100

export class Preview {
  /**
   * @param core      the loaded wasm core (client/src/core.js)
   * @param bake      studio/src/bake.js's bake, bound to the wasm binary
   * @param runtime   the runtime Lua texts by file name
   * @param viewport  where the picture goes
   * @param textures  a TextureCache
   */
  constructor ({ core, bake, runtime, viewport, textures }) {
    this.core = core
    this.bake = bake
    this.runtime = runtime
    this.viewport = viewport
    this.textures = textures
    this.map = null            // the loaded WasmMap of the last good bake
    this.data = null           // readMap() of it
    this.view = null           // the MapView drawn from it
    this.emitted = null        // mapfmt tables of the last good bake
    this.last = { ok: false, errors: [], warnings: [] }
    this.busy = false
    this.pending = null
    this.onResult = () => {}
    this.dragSector = -1       // the sector a drag has made dynamic, or -1
    this.staged = 0            // drag steps drawn without a bake (the page test reads it)
  }

  /** Ask for a bake; coalesces while one is in flight. Resolves with the last result. */
  refresh (module, doc) {
    this.pending = { module, doc }
    if (!this.busy) this.#run()
    return this.last
  }

  async #run () {
    this.busy = true
    while (this.pending) {
      const { module, doc } = this.pending
      this.pending = null
      const t0 = performance.now()
      try {
        await this.#bakeOnce(module, doc)
      } catch (e) {
        this.last = { ok: false, errors: [{ line: 0, msg: String(e?.message ?? e) }], warnings: [] }
        console.error('[studio] refresh failed', e)
      }
      this.onResult(this.last)
      const wait = INTERVAL_MS - (performance.now() - t0)
      if (this.pending && wait > 0) await new Promise((r) => setTimeout(r, wait))
    }
    this.busy = false
  }

  async #bakeOnce (module, doc) {
    const r = await emitLevel(module, doc, { bake: this.bake, runtime: this.runtime })
    if (!r.ok) { this.last = { ok: false, errors: r.errors, warnings: r.warnings }; return }
    const loaded = this.core.loadMap(r.dnpm)
    if (!loaded.ok) {
      this.last = { ok: false, errors: [{ line: 0, msg: `the core refused the baked map (status ${loaded.status})` }], warnings: r.warnings }
      return
    }
    const data = readMap(loaded.map)
    const view = new MapView(data)
    view.setDynamicSectors([])
    await this.textures.apply(view, doc.texscale)
    if (this.map) this.map.destroy()
    this.map = loaded.map
    this.data = data
    this.view = view
    this.emitted = r.emitted
    this.dragSector = -1
    this.viewport.setView(view)
    this.last = { ok: true, errors: [], warnings: r.warnings, hash: r.hash }
  }

  /**
   * Reshape one sector on the loaded map from the document's corners, for a
   * drag in progress. True when the picture was updated; false when only a
   * bake can (no good bake yet, the document has grown since it, or the new
   * outline cannot be meshed -- the old shape then stands until release).
   */
  stage (doc, sectorId) {
    if (!this.map || !this.emitted || !this.view || this.view !== this.viewport.view) return false
    const si = this.emitted.sectorIndex.get(sectorId)
    const s = doc.sectors[sectorId]
    const rec = si === undefined ? null : this.data.sectors[si]
    if (!s || !rec || rec.pointCount !== s.verts.length) return false
    const core = this.core
    const M = core.M
    const b = core.buf64 / 8
    for (let i = 0; i < s.verts.length; i++) {
      const { i64 } = core.views
      i64[b] = BigInt(Math.round(s.verts[i].x * 4294967296))
      i64[b + 1] = BigInt(Math.round(s.verts[i].y * 4294967296))
      M._dnp_map_stage_point(this.map.ptr, si, i, core.buf64)
    }
    if (M._dnp_map_commit_shape(this.map.ptr, si) !== 0) {
      M._dnp_map_discard_staged_edits(this.map.ptr, si)
      return false
    }
    M._dnp_map_rebuild_grid(this.map.ptr)
    this.data = readMap(this.map)
    this.view.map = this.data
    if (this.dragSector !== si) {
      // Once per drag: this sector and its neighbours become the dynamic
      // half, everything else is built one last time.
      this.dragSector = si
      this.view.setDynamicSectors([si])
    } else {
      this.view.rebuildDynamic()
    }
    this.staged++
    this.viewport.dirty = true
    return true
  }

  /** The sector index under an engine point, by the simulation's own predicate. */
  sectorIndexAt (x, y) {
    if (!this.map) return -1
    return this.map.findSector ? this.map.findSector(x, y) : -1
  }
}
