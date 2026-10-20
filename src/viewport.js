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
import { colorParts } from '../vendor/uikit/runtime.js'
import { iconPicture, glyphOf } from './ui.js'

const FOV = 50
const MIN_VIEW = 4
const MAX_VIEW = 300
// CORNERS AND BADGES SCALE WITH THE ZOOM, gently and within bounds: at the
// opening zoom (40) as the skin draws them; zoomed in, up to 1.6x on screen;
// zoomed out, down to half -- so "start" never covers the room it is in, and
// a corner never shrinks out of sight. The world size of one at view height v.
const furnitureScale = (v) => v * Math.min(1.6, Math.max(0.5, Math.sqrt(40 / v)))
// A FINGER IS NOT A MOUSE: on a touch screen the corners are drawn twice the
// size, and a tap within a finger's width of one is on it (pickFurniture).
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
const HANDLE = COARSE ? 2 : 1
const CORNER_PX = COARSE ? 30 : 12

// The furniture's colours, as three.js numbers, from the skin (docs/STUDIO_SKINS.md):
// wearSkin() fills them from S.skin.canvas, and again on every change of skin
// or mode. ALPHA holds the opacity the skin gives each (1 when solid); FILL
// the fill alpha of the keys that fill (a room marked wrong, a neighbour).
// Each key names its canvas entry and which part of it: [group, key, part].
export const SKIN_KEYS = {
  stage: ['common', 'stage'],
  grid: ['common', 'grid.minor'], gridMajor: ['common', 'grid.major'],
  outline: ['common', 'selected'], handle: ['common', 'handle', 'fill'], handleHot: ['common', 'handle.hot', 'fill'],
  rubber: ['map', 'draw'], corner: ['map', 'corner.snap', 'fill'], pickable: ['map', 'pick'], edgeHot: ['map', 'wall.selected'],
  when: ['map', 'trigger.when'], if: ['map', 'trigger.if'], then: ['map', 'trigger.then'],
  spawn: ['map', 'marker.spawn'], light: ['map', 'marker.light'], mob: ['map', 'marker.monster'], prop: ['map', 'marker.prop'],
  // Camera paths: the curve the camera rides, and the polyline that was typed.
  path: ['map', 'path'], pathHot: ['map', 'path.active'], pathChord: ['map', 'path.chord'],
  // A room the bake refused or a check complained about.
  problem: ['common', 'problem'], problemWarn: ['common', 'warning'],
  // A side that climbs (climb.js).
  climb: ['map', 'climb'],
  // The metamap: a map's cell, and how its boundary sides meet a neighbour's.
  cell: ['map', 'cell'], neighbourShade: ['map', 'neighbour', 'fill'],
  // The open map's own cell, on the shared world's grid: bright and thick.
  cellEdge: ['map', 'cell.edge'],
  seam_joined: ['map', 'seam.joined'], seam_oneway: ['map', 'seam.oneway'], seam_walls: ['map', 'seam.walls'], seam_loose: ['map', 'seam.loose']
}
export const COLORS = {}
export const ALPHA = {}
export const FILL = {}
// How thick the skin draws each, in pixels (lines given a `width` are drawn that thick).
export const WIDTH = {}
// The badge a marker without a picture is drawn as: map.marker's fill, text colour, border, corner and font.
export const BADGE = {}
// Until a skin is worn: the loud magenta of a missing key (runtime.js).
for (const k of Object.keys(SKIN_KEYS)) { COLORS[k] = colorParts('').hex; ALPHA[k] = 1; FILL[k] = 1 }

/** Take the skin's canvas colours into COLORS / ALPHA / FILL / BADGE. */
export function wearSkin (skin) {
  for (const [k, [group, key, part]] of Object.entries(SKIN_KEYS)) {
    const spec = skin.canvas(group, key)
    const c = colorParts(part ? spec[part] ?? spec.color : spec.color)
    COLORS[k] = c.hex
    ALPHA[k] = c.alpha * (spec.alpha ?? 1)
    WIDTH[k] = Number.isFinite(spec.width) ? spec.width : 1
    FILL[k] = colorParts(spec.fill ?? spec.color).alpha
  }
  Object.assign(BADGE, skin.canvas('map', 'marker'))
}

export class Viewport {
  constructor (host = document.body) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio))
    this.renderer.setSize(innerWidth, innerHeight)
    this.renderer.setClearColor(COLORS.stage, ALPHA.stage)
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
    this.grid.add(minor, major)
    this.gridLines = { minor, major }
    this.scene.add(this.grid)

    this.view = null
    this.markers = new THREE.Group()
    this.handles = new THREE.Group()
    this.lines = new THREE.Group()
    // One geometry for the many thin lines a pick offers (every wall, every
    // room outline): a Line per edge would be thousands of draw calls.
    this.segments = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: COLORS.pickable, depthTest: false, transparent: true, opacity: ALPHA.pickable }))
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
    this.reskin()
  }

  get camera () { return this.mode === 'plan' ? this.plan : this.iso }

  /**
   * The skin changed (wearSkin ran): the lasting materials take the new
   * colours in place -- the stage, the grid, the pick lines -- and the
   * badges are drawn again. The furniture itself is rebuilt by the next
   * redraw, as it is on every edit.
   */
  reskin () {
    this.renderer.setClearColor(COLORS.stage, ALPHA.stage)
    const { minor, major } = this.gridLines
    // GridHelper colours its vertices: four per division (a line each way),
    // the middle division in the first colour, every other in the second.
    const paint = (g, centre, lines) => {
      const col = g.geometry.attributes.color
      const a = new THREE.Color(centre); const b = new THREE.Color(lines)
      const mid = (col.count / 4 - 1) / 2
      for (let v = 0; v < col.count; v++) (Math.floor(v / 4) === mid ? a : b).toArray(col.array, v * 3)
      col.needsUpdate = true
    }
    paint(minor, COLORS.gridMajor, COLORS.grid)
    paint(major, COLORS.gridMajor, COLORS.gridMajor)
    minor.material.opacity = ALPHA.grid
    major.material.opacity = ALPHA.gridMajor
    this.segments.material.opacity = ALPHA.pickable
    for (const t of this.labelCache.values()) t.dispose()
    this.labelCache.clear()
    this.dirty = true
  }

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

  /**
   * The client's Sky (render/sky.js) behind the level, as the game draws it.
   * Not in the plan view: looking straight down an orthographic camera there
   * is no direction to see a sky in.
   */
  setSky (sky) {
    this.sky = sky
    this.scene.add(sky.background)
    this.dirty = true
  }

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
    // Animated textures (a sprite sheet, a frame list): the client's animator, on one clock.
    this.texAnimator?.update(performance.now() / 1000)
    this.#place()
    this.#shapeBands()
    if (this.sky) {
      const show = this.mode !== 'plan' && this.sky.sky.kind !== 0
      this.sky.background.visible = show
      if (show) this.sky.update(this.camera)
    }
    // A sprite stands upright in the game's world, so under a pitched camera it
    // shows foreshortened by the pitch's cosine. The markers are screen-aligned
    // sprites, so the same is done to their height here: what the level view
    // shows of a monster's size is what the game will show.
    const squash = this.mode === 'iso' ? Math.cos(this.elevation) : 1
    for (const m of this.markers.children) if (m.userData.h) m.scale.y = m.userData.h * squash
    this.#keepFurnitureSize()
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
    // The nearest corner within reach on screen, before anything a ray hits:
    // a corner drawn ten pixels wide was all but impossible to tap on a phone.
    let best = null; let bestD = CORNER_PX
    for (const h of this.handles.children) {
      const p = h.position.clone().project(this.camera)
      const d = Math.hypot((p.x + 1) / 2 * innerWidth - clientX, (1 - p.y) / 2 * innerHeight - clientY)
      if (d < bestD) { bestD = d; best = h }
    }
    if (best) return best.userData
    const hits = this.raycaster.intersectObjects([...this.handles.children, ...this.markers.children.filter((m) => m.userData.kind !== 'badge' && m.userData.kind !== 'heading')], false)
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
  get animating () { return !!this.fx || !!this.texAnimator }

  /** The world distance one screen pixel covers on the plane at height z. */
  worldPerPixel (z = 0) {
    const a = this.groundPoint(innerWidth / 2, innerHeight / 2, z)
    const b = this.groundPoint(innerWidth / 2 + 10, innerHeight / 2, z)
    return a && b ? Math.hypot(b.x - a.x, b.y - a.y) / 10 : this.viewHeight / innerHeight
  }

  // Corners and badges are sized when set (setHandles, setMarkers), and a wheel
  // or a pinch moves the zoom without setting them again: resized here, every
  // frame the zoom has moved, by furnitureScale.
  #keepFurnitureSize () {
    if (this.viewHeight === this.furnitureAt) return
    this.furnitureAt = this.viewHeight
    const v = furnitureScale(this.viewHeight)
    for (const m of this.handles.children) {
      const k = v / m.userData.at
      m.scale.setScalar(k)
      m.position.y = m.userData.y0 + (m.userData.size * k) / 2
    }
    for (const m of this.markers.children) {
      const k = v / (m.userData.at ?? v)
      if (m.userData.kind === 'heading') { m.scale.set(k, 1, k); m.position.set(m.userData.fx * (1 - k), 0, m.userData.fz * (1 - k)); continue }
      if (!m.userData.badgeH) continue
      const h = m.userData.badgeH * k
      m.scale.set(h * 3, h, 1)
      m.position.y = m.userData.y0 + h / 2
    }
  }

  /** Corner handles: [{ id, x, y, z, hot, color }] -- the selected sector's, and while drawing, everyone else's to snap to. */
  setHandles (points) {
    this.handles.clear()
    const size = furnitureScale(this.viewHeight) / 90 * HANDLE
    for (const p of points) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size),
                               new THREE.MeshBasicMaterial({ color: p.color ?? (p.hot ? COLORS.handleHot : COLORS.handle), depthTest: false, ...opacity(p.alpha) }))
      m.position.set(toThreeX(p.x), toThreeY(p.z) + size / 2, toThreeZ(p.y))
      m.renderOrder = 10
      // A handle says what it belongs to: a sector's corner and a camera
      // path's point are both boxes on the floor and are not the same thing.
      m.userData = { kind: p.kind ?? 'vertex', id: p.id, y0: toThreeY(p.z), size, at: furnitureScale(this.viewHeight) }
      this.handles.add(m)
    }
    this.dirty = true
  }

  /**
   * Closed or open polylines: [{ points: [{x,y,z}], color, closed, width? }].
   * `width`: drawn as a band that many screen pixels thick (WebGL draws every
   * line one pixel wide, whatever it is asked) -- kept that thick as the view
   * zooms (render() rebuilds the bands when the scale moves).
   */
  setLines (lines) {
    for (const l of this.lines.children) { l.geometry.dispose(); l.material.dispose() }
    this.lines.clear()
    this.bands = []
    for (const l of lines) {
      if (l.width) {
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: l.color ?? COLORS.outline, depthTest: false, side: THREE.DoubleSide, ...opacity(l.alpha) }))
        mesh.renderOrder = 10
        mesh.userData.band = l
        this.lines.add(mesh)
        this.bands.push(mesh)
        continue
      }
      const pts = l.points.map((p) => new THREE.Vector3(toThreeX(p.x), toThreeY(p.z) + 0.02, toThreeZ(p.y)))
      if (l.closed && pts.length) pts.push(pts[0].clone())
      const geo = new THREE.BufferGeometry().setFromPoints(pts)
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: l.color ?? COLORS.outline, depthTest: false, ...opacity(l.alpha) }))
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
    this.bandScale = 0
    this.#shapeBands()
    this.dirty = true
  }

  /** World units per screen pixel at the view's target (both cameras frame viewHeight over the window). */
  #worldPerPixel () { return this.viewHeight / Math.max(1, innerHeight) }

  // The bands' geometry for the current scale: each segment a quad, half the
  // width either side and running on past both ends by as much, so corners
  // close without mitres. Rebuilt only when the scale has moved by a tenth.
  #shapeBands () {
    if (!this.bands?.length) return
    const k = this.#worldPerPixel()
    if (this.bandScale && Math.abs(k - this.bandScale) / this.bandScale < 0.1) return
    this.bandScale = k
    for (const mesh of this.bands) {
      const l = mesh.userData.band
      const h = (l.width / 2) * k
      const pts = l.points.slice()
      if (l.closed && pts.length) pts.push(pts[0])
      const pos = []
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i]; const b = pts[i + 1]
        const dx = b.x - a.x; const dy = b.y - a.y
        const len = Math.hypot(dx, dy)
        if (!len) continue
        const ux = dx / len; const uy = dy / len
        const nx = -uy * h; const ny = ux * h
        const ax = a.x - ux * h; const ay = a.y - uy * h; const bx = b.x + ux * h; const by = b.y + uy * h
        const q = [[ax + nx, ay + ny, a.z], [ax - nx, ay - ny, a.z], [bx - nx, by - ny, b.z], [bx + nx, by + ny, b.z]]
        for (const j of [0, 1, 2, 0, 2, 3]) { const [x, y, z] = q[j]; pos.push(toThreeX(x), toThreeY(z) + 0.03, toThreeZ(y)) }
      }
      mesh.geometry.dispose()
      mesh.geometry = new THREE.BufferGeometry()
      mesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    }
  }

  /**
   * Markers: [{ id, kind, x, y, z, label, color, icon }]. With an `icon`
   * ({ texture, w, h, dy } from sprites.js) the thing is drawn as its own
   * picture, standing on its feet; otherwise as a labelled badge.
   */
  setMarkers (list) {
    for (const m of this.markers.children) if (m.userData.own) m.material.dispose()
    this.markers.clear()
    const h = furnitureScale(this.viewHeight) / 22
    for (const m of list) {
      let sprite
      if (m.icon) {
        // alphaTest as the game's props.js has it, so soft edges are cut the same way.
        sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: m.icon.texture, transparent: true, alphaTest: 0.5 }))
        sprite.scale.set(m.icon.w, m.icon.h, 1)
        sprite.position.set(toThreeX(m.x), toThreeY(m.z) + m.icon.dy, toThreeZ(m.y))
        sprite.userData = { kind: m.kind, id: m.id, own: true, h: m.icon.h }
      } else {
        sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.#label(m.label, m.color, m.iconId), depthTest: false, transparent: true, opacity: m.alpha ?? 1 }))
        sprite.scale.set(h * 3, h, 1)
        sprite.position.set(toThreeX(m.x), toThreeY(m.z) + h / 2, toThreeZ(m.y))
        sprite.userData = { kind: m.kind, id: m.id, own: true, label: m.label, badgeH: h, y0: toThreeY(m.z), at: furnitureScale(this.viewHeight) }
      }
      sprite.renderOrder = 11
      this.markers.add(sprite)
      // WHICH WAY IT FACES: a short arrow on the ground from its foot, in its
      // colour (0° is +x, counter-clockwise, as the engine's angles). Never
      // picked: a tap on it is a tap on nothing, not on the thing.
      if (typeof m.heading === 'number') {
        const a = (m.heading * Math.PI) / 180
        const L = Math.max(0.6, h * 1.4)
        const tip = { x: m.x + Math.cos(a) * L, y: m.y + Math.sin(a) * L }
        const side = (s) => ({ x: tip.x - Math.cos(a + s) * L * 0.35, y: tip.y - Math.sin(a + s) * L * 0.35 })
        const pts = [m, tip, tip, side(0.5), tip, side(-0.5)].map((p) => new THREE.Vector3(toThreeX(p.x), toThreeY(m.z) + 0.05, toThreeZ(p.y)))
        const arrow = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: m.color, depthTest: false, transparent: true, opacity: m.alpha ?? 1 }))
        arrow.renderOrder = 12
        // scaled about its foot (#keepFurnitureSize): fx, fz are the foot
        arrow.userData = { kind: 'heading', own: true, fx: toThreeX(m.x), fz: toThreeZ(m.y), at: furnitureScale(this.viewHeight) }
        this.markers.add(arrow)
      }
    }
    this.dirty = true
  }

  /** An icon's picture from the skin, decoded: null until it has loaded (the badges are drawn again then). */
  #iconArt (id) {
    const pic = iconPicture(id)
    if (!pic) return null
    this.iconImages ??= new Map()
    let img = this.iconImages.get(pic.url)
    if (!img) {
      img = new Image()
      img.onload = () => { for (const t of this.labelCache.values()) t.dispose(); this.labelCache.clear(); this.onLabelArt?.() }
      img.src = pic.url
      this.iconImages.set(pic.url, img)
    }
    return img.complete && img.naturalWidth ? { img, tinted: pic.tinted } : null
  }

  #label (text, color, iconId = null) {
    const key = `${text}|${color}|${iconId}`
    if (this.labelCache.has(key)) return this.labelCache.get(key)
    const c = document.createElement('canvas')
    c.width = 192; c.height = 64
    const g = c.getContext('2d')
    // map.marker, drawn at the canvas's scale (the sprite is ~2.2x the skin's px)
    const K = 2.2
    const hex = `#${color.toString(16).padStart(6, '0')}`
    g.fillStyle = BADGE.fill
    g.beginPath(); g.roundRect(4, 8, 184, 48, (BADGE.radius ?? 6) * K); g.fill()
    g.strokeStyle = hex
    g.lineWidth = Math.max(1, (BADGE.width ?? 2) * 4 / 3); g.stroke()
    g.fillStyle = BADGE.color
    g.font = String(BADGE.font ?? '600 11px sans-serif').replace(/(\d+(?:\.\d+)?)px/, (_, n) => `${Math.round(n * K)}px`)
    g.textBaseline = 'middle'
    // The marker's icon (a catalog id): the skin's picture, tinted in the
    // marker's colour, once it has loaded -- the glyph until then, or when the
    // skin draws none.
    const art = iconId ? this.#iconArt(iconId) : null
    const glyph = iconId && !art ? glyphOf(iconId) : ''
    const words = (glyph ? `${glyph} ${text}` : text).trim().slice(0, 12)
    const iw = art ? 30 : 0
    const tw = g.measureText(words).width
    const x0 = 96 - (iw + (art && words ? 6 : 0) + tw) / 2
    if (art) {
      const t = document.createElement('canvas'); t.width = t.height = 60
      const tg = t.getContext('2d')
      tg.drawImage(art.img, 0, 0, 60, 60)
      if (art.tinted) { tg.globalCompositeOperation = 'source-in'; tg.fillStyle = hex; tg.fillRect(0, 0, 60, 60) }
      g.drawImage(t, x0, 33 - iw / 2, iw, iw)
    }
    g.textAlign = 'left'
    g.fillText(words, x0 + iw + (art && words ? 6 : 0), 33)
    const tex = new THREE.CanvasTexture(c)
    this.labelCache.set(key, tex)
    return tex
  }
}

/** A material's opacity, when the skin gives the colour one. */
const opacity = (alpha) => (alpha !== undefined && alpha < 1 ? { transparent: true, opacity: alpha } : {})
