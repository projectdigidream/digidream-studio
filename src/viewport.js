//
// The picture: the game's own renderer, with an editor's furniture on top.
//
// The map is drawn by client/src/render/scene.js's MapView from the same
// baked bytes the game would load, so what the author sees is what the
// player gets -- there is no "editor look" that could disagree with the
// game. On top of it: a grid, the selected sector's outline and corner
// handles, markers for spawns, lights and placed things, and the rubber band
// while a room is being drawn. Those are the only things here that the game
// does not draw.
//
// Two cameras, one target. `iso` is the game's view (client/src/camera.js:
// the same elevation, the same framing from a view height, so a room reads
// the way it plays). `plan` looks straight down: the drawing view. Both orbit
// the same ground point, and switching changes the projection and nothing
// else.
//
// COORDINATES. The engine is z-up; three is y-up; client/src/mapgeom.js owns
// the mapping (x, z, -y) and everything here goes through it. Picking gives
// back engine coordinates, because that is what the document stores.
//
import { SectorFx } from '/src/render/sectorfx.js'
import * as THREE from 'three'
import { makeCamera, resizeCamera } from '/src/render/scene.js'
import { cameraOffset, ISO_ELEVATION, distanceForFraming } from '/src/camera.js'
import { toThreeX, toThreeY, toThreeZ } from '/src/mapgeom.js'

const FOV = 50
const MIN_VIEW = 4
const MAX_VIEW = 300

export const COLORS = {
  grid: 0x1b2230, gridMajor: 0x2a3446, outline: 0xffe066, handle: 0xffe066, handleHot: 0xffffff,
  rubber: 0x5b8fd6, corner: 0x5f7fa8, pickable: 0x5b8fd6, when: 0xffcc66, if: 0x5b8fd6, then: 0x7ad48a, spawn: 0x66ff99, light: 0xffcc66, mob: 0xff6b6b, prop: 0x8fd0ff, edgeHot: 0x5b8fd6,
  // Camera paths: the curve the camera rides, and the polyline that was typed.
  path: 0x9a7bd6, pathHot: 0xd0a6ff, pathChord: 0x4a3f66,
  // A room the bake refused or a check complained about.
  problem: 0xff4d4d, problemWarn: 0xffa94d,
  // The metamap: a map's cell, and how its boundary sides meet a neighbour's.
  cell: 0x8fa6c4, neighbourShade: 0x0b0d12, seam_joined: 0x66ff99, seam_oneway: 0xffa94d, seam_walls: 0x5f7fa8, seam_loose: 0xff6b6b
}

export class Viewport {
  constructor (host = document.body) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio))
    this.renderer.setSize(innerWidth, innerHeight)
    this.renderer.setClearColor(0x0b0d12)
    host.appendChild(this.renderer.domElement)
    this.canvas = this.renderer.domElement

    this.scene = new THREE.Scene()
    this.mode = 'plan'
    this.viewHeight = 40
    this.yaw = Math.PI / 2                // engine +y up the screen
    this.elevation = ISO_ELEVATION        // the game's, unless the map sets one
    this.target = { x: 0, y: 0, z: 0 }    // engine: ground point the cameras orbit
    this.iso = makeCamera('perspective', innerWidth / innerHeight, this.viewHeight, FOV)
    this.plan = makeCamera('orthographic', innerWidth / innerHeight, this.viewHeight, FOV)
    this.plan.up.set(0, 0, -1)

    this.grid = new THREE.Group()
    const minor = new THREE.GridHelper(512, 512, COLORS.gridMajor, COLORS.grid)
    const major = new THREE.GridHelper(512, 64, COLORS.gridMajor, COLORS.gridMajor)
    minor.material.transparent = major.material.transparent = true
    minor.material.opacity = 0.55
    major.material.opacity = 0.7
    this.grid.add(minor, major)
    this.scene.add(this.grid)

    this.view = null
    this.markers = new THREE.Group()
    this.handles = new THREE.Group()
    this.lines = new THREE.Group()
    // One geometry for the many thin lines a pick offers (every wall, every
    // room outline): a Line per edge would be thousands of draw calls.
    this.segments = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: COLORS.pickable, depthTest: false, transparent: true, opacity: 0.85 }))
    this.segments.renderOrder = 8
    this.segments.visible = false
    // The neighbouring maps on the metamap, drawn where they sit; never picked.
    this.neighbours = new THREE.Group()
    this.scene.add(this.markers, this.handles, this.lines, this.segments, this.neighbours)
    this.labelCache = new Map()
    this.raycaster = new THREE.Raycaster()
    this.raycaster.params.Line = { threshold: 0.3 }
    this.dirty = true

    addEventListener('resize', () => this.resize())
    this.resize()
  }

  get camera () { return this.mode === 'plan' ? this.plan : this.iso }

  resize () {
    this.renderer.setSize(innerWidth, innerHeight)
    resizeCamera(this.iso, innerWidth / innerHeight, this.viewHeight)
    resizeCamera(this.plan, innerWidth / innerHeight, this.viewHeight)
    this.dirty = true
  }

  setMode (mode) { this.mode = mode; this.dirty = true }

  zoomBy (factor) {
    this.viewHeight = Math.min(MAX_VIEW, Math.max(MIN_VIEW, this.viewHeight / factor))
    this.resize()
  }

  rotate (delta) { this.yaw += delta; this.dirty = true }

  /** The map's camera, or the engine's when a value is null: yaw and elevation in radians, distance in units. */
  setCamera ({ yaw = null, elevation = null, distance = null } = {}) {
    if (yaw !== null) this.yaw = yaw
    this.elevation = elevation ?? ISO_ELEVATION
    if (distance !== null) this.viewHeight = Math.min(MAX_VIEW, Math.max(MIN_VIEW, distance / distanceForFraming(FOV, 1)))
    this.dirty = true
  }

  lookAt (x, y, z = this.target.z) { this.target = { x, y, z }; this.dirty = true }

  /**
   * The camera put somewhere, looking at something (engine units), instead of
   * orbiting the target: a cutscene's camera, previewed (scene.js). Null
   * hands it back.
   */
  setPose (pose) { this.pose = pose; this.dirty = true }

  /** Move the target so that what was under one screen point is under another. */
  panBy (dx, dy) {
    const cx = innerWidth / 2; const cy = innerHeight / 2
    const a = this.groundPoint(cx, cy, this.target.z)
    const b = this.groundPoint(cx - dx, cy - dy, this.target.z)
    if (!a || !b) return
    this.target = { x: this.target.x + (b.x - a.x), y: this.target.y + (b.y - a.y), z: this.target.z }
    this.dirty = true
  }

  #place () {
    const T = new THREE.Vector3(toThreeX(this.target.x), toThreeY(this.target.z), toThreeZ(this.target.y))
    if (this.pose && this.mode !== 'plan') {
      const { eye, look } = this.pose
      this.iso.position.set(toThreeX(eye.x), toThreeY(eye.z), toThreeZ(eye.y))
      this.iso.lookAt(toThreeX(look.x), toThreeY(look.z), toThreeZ(look.y))
      return
    }
    if (this.mode === 'plan') {
      this.plan.position.set(T.x, T.y + 200, T.z)
      this.plan.lookAt(T)
    } else {
      const o = cameraOffset(this.yaw, distanceForFraming(FOV, this.viewHeight), this.elevation)
      this.iso.position.set(T.x + o.x, T.y + o.y, T.z + o.z)
      this.iso.lookAt(T)
    }
  }

  render () {
    this.#place()
    // A sprite stands upright in the game's world, so under a pitched camera it
    // shows foreshortened by the pitch's cosine. The markers are screen-aligned
    // sprites, so the same is done to their height here: what the level view
    // shows of a monster's size is what the game will show.
    const squash = this.mode === 'iso' ? Math.cos(this.elevation) : 1
    for (const m of this.markers.children) if (m.userData.h) m.scale.y = m.userData.h * squash
    if (this.fx && this.view) {
      const o = this.view.root.position
      this.fx.setOrigin(o.x, o.y, o.z)
      this.fx.update(performance.now() / 1000)
    }
    this.renderer.render(this.scene, this.camera)
    if (this.fx?.hasFog) this.fx.renderFog(this.renderer, this.scene, this.camera)
    this.dirty = false
  }

  /** The engine (x, y) under a screen point on the plane at height z, or null. */
  groundPoint (clientX, clientY, z = 0) {
    this.#place()
    const ndc = new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.camera)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -toThreeY(z))
    const hit = new THREE.Vector3()
    if (!this.raycaster.ray.intersectPlane(plane, hit)) return null
    return { x: hit.x, y: -hit.z }
  }

  /** Editor furniture under a screen point: the nearest handle or marker, with its id. Badges are not things. */
  pickFurniture (clientX, clientY) {
    this.#place()
    const ndc = new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.camera)
    const hits = this.raycaster.intersectObjects([...this.handles.children, ...this.markers.children.filter((m) => m.userData.kind !== 'badge')], false)
    return hits.length ? hits[0].object.userData : null
  }

  /** Many thin segments at once: [{ a: {x,y,z}, b: {x,y,z} }]. Empty hides them. */
  setSegments (segs, color = COLORS.pickable) {
    const pos = new Float32Array(segs.length * 6)
    segs.forEach((s, i) => {
      pos.set([toThreeX(s.a.x), toThreeY(s.a.z) + 0.03, toThreeZ(s.a.y), toThreeX(s.b.x), toThreeY(s.b.z) + 0.03, toThreeZ(s.b.y)], i * 6)
    })
    this.segments.geometry.dispose()
    this.segments.geometry = new THREE.BufferGeometry()
    this.segments.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.segments.material.color.setHex(color)
    this.segments.visible = segs.length > 0
    this.dirty = true
  }

  /** Where an engine point lands on the screen, in px. */
  toScreen (x, y, z = 0) {
    this.#place()
    const p = new THREE.Vector3(toThreeX(x), toThreeY(z), toThreeZ(y)).project(this.camera)
    return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight }
  }

  /** Screen distance in px between a screen point and an engine point. */
  screenDistance (clientX, clientY, x, y, z = 0) {
    const s = this.toScreen(x, y, z)
    return Math.hypot(s.x - clientX, s.y - clientY)
  }

  /** Swap the drawn map for a new MapView (from preview.js). */
  setView (view) {
    if (this.view) {
      this.scene.remove(this.view.root)
      for (const m of this.view.meshes) m.geometry.dispose()
    }
    this.view = view
    if (view) this.scene.add(view.root)
    // The map's weather and fog, by the game's own renderer for them
    // (docs/SECTOR_FX.md): what the level view shows is what the game draws.
    this.fx?.dispose()
    this.fx = (view?.map?.fx?.length ?? 0) > 0
      ? new SectorFx({ THREE, map: view.map, touch: matchMedia('(pointer: coarse)').matches })
      : null
    if (this.fx) this.scene.add(this.fx.root)
    this.dirty = true
  }

  /**
   * The maps around this one on the metamap: [{ view, offset: {x, y} }], each
   * a MapView of its own bake, moved to where it sits relative to this map.
   * The views stay their owner's (a cache keeps them); only the group is ours.
   */
  setNeighbours (list) {
    this.neighbours.clear()
    for (const n of list) {
      n.view.root.position.set(toThreeX(n.offset.x), 0, toThreeZ(n.offset.y))
      this.neighbours.add(n.view.root)
    }
    this.dirty = true
  }

  /** Something on screen moves by itself (rain, fog), so every frame is drawn. */
  get animating () { return !!this.fx }

  /** The world distance one screen pixel covers on the plane at height z. */
  worldPerPixel (z = 0) {
    const a = this.groundPoint(innerWidth / 2, innerHeight / 2, z)
    const b = this.groundPoint(innerWidth / 2 + 10, innerHeight / 2, z)
    return a && b ? Math.hypot(b.x - a.x, b.y - a.y) / 10 : this.viewHeight / innerHeight
  }

  /** Corner handles: [{ id, x, y, z, hot, color }] -- the selected sector's, and while drawing, everyone else's to snap to. */
  setHandles (points) {
    this.handles.clear()
    const size = this.viewHeight / 90
    for (const p of points) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size),
                               new THREE.MeshBasicMaterial({ color: p.color ?? (p.hot ? COLORS.handleHot : COLORS.handle), depthTest: false }))
      m.position.set(toThreeX(p.x), toThreeY(p.z) + size / 2, toThreeZ(p.y))
      m.renderOrder = 10
      // A handle says what it belongs to: a sector's corner and a camera
      // path's point are both boxes on the floor and are not the same thing.
      m.userData = { kind: p.kind ?? 'vertex', id: p.id }
      this.handles.add(m)
    }
    this.dirty = true
  }

  /** Closed or open polylines: [{ points: [{x,y,z}], color, closed }]. */
  setLines (lines) {
    for (const l of this.lines.children) { l.geometry.dispose(); l.material.dispose() }
    this.lines.clear()
    for (const l of lines) {
      const pts = l.points.map((p) => new THREE.Vector3(toThreeX(p.x), toThreeY(p.z) + 0.02, toThreeZ(p.y)))
      if (l.closed && pts.length) pts.push(pts[0].clone())
      const geo = new THREE.BufferGeometry().setFromPoints(pts)
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: l.color ?? COLORS.outline, depthTest: false }))
      line.renderOrder = 9
      this.lines.add(line)
      // A closed line may be filled, translucent, on its own plane: how a room
      // that is wrong is marked so it shows at a glance, not only as an outline.
      if (l.fill && l.closed && l.points.length >= 3) {
        const flat = l.points.map((p) => new THREE.Vector2(p.x, p.y))
        let tris = []
        try { tris = THREE.ShapeUtils.triangulateShape(flat, []) } catch { tris = [] }
        if (tris.length) {
          const pos = []
          for (const t of tris) for (const k of t) { const p = l.points[k]; pos.push(toThreeX(p.x), toThreeY(p.z) + 0.02, toThreeZ(p.y)) }
          const g = new THREE.BufferGeometry()
          g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
          const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: l.color ?? COLORS.outline, transparent: true, opacity: l.fill, depthTest: false, side: THREE.DoubleSide }))
          mesh.renderOrder = 8
          this.lines.add(mesh)
        }
      }
    }
    this.dirty = true
  }

  /**
   * Markers: [{ id, kind, x, y, z, label, color, icon }]. With an `icon`
   * ({ texture, w, h, dy } from sprites.js) the thing is drawn as its own
   * picture, standing on its feet; otherwise as a labelled badge.
   */
  setMarkers (list) {
    for (const m of this.markers.children) if (m.userData.own) m.material.dispose()
    this.markers.clear()
    const h = this.viewHeight / 22
    for (const m of list) {
      let sprite
      if (m.icon) {
        // alphaTest as the game's props.js has it, so soft edges are cut the same way.
        sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: m.icon.texture, transparent: true, alphaTest: 0.5 }))
        sprite.scale.set(m.icon.w, m.icon.h, 1)
        sprite.position.set(toThreeX(m.x), toThreeY(m.z) + m.icon.dy, toThreeZ(m.y))
        sprite.userData = { kind: m.kind, id: m.id, own: true, h: m.icon.h }
      } else {
        sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.#label(m.label, m.color), depthTest: false, transparent: true }))
        sprite.scale.set(h * 3, h, 1)
        sprite.position.set(toThreeX(m.x), toThreeY(m.z) + h / 2, toThreeZ(m.y))
        sprite.userData = { kind: m.kind, id: m.id, own: true, label: m.label }
      }
      sprite.renderOrder = 11
      this.markers.add(sprite)
    }
    this.dirty = true
  }

  #label (text, color) {
    const key = `${text}|${color}`
    if (this.labelCache.has(key)) return this.labelCache.get(key)
    const c = document.createElement('canvas')
    c.width = 192; c.height = 64
    const g = c.getContext('2d')
    g.fillStyle = 'rgba(11,13,18,.78)'
    g.beginPath(); g.roundRect(4, 8, 184, 48, 12); g.fill()
    g.strokeStyle = `#${color.toString(16).padStart(6, '0')}`
    g.lineWidth = 4; g.stroke()
    g.fillStyle = '#e8f0ff'
    g.font = '600 26px ui-monospace, Menlo, monospace'
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(text.slice(0, 12), 96, 33)
    const tex = new THREE.CanvasTexture(c)
    this.labelCache.set(key, tex)
    return tex
  }
}
