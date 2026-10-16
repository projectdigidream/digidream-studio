//
// Particle kinds: the catalogue's `vfx` records, and a preview that runs them.
//
// A burst is ENTIRELY THE CLIENT'S (client/src/render/vfx.js): the server says
// an effect happened somewhere, nothing about a particle crosses the wire and
// none of them is in any hash. So there is no bake to wait for and no server
// to ask -- the preview below integrates the very functions the game does,
// which is why what it shows is what will be drawn.
//
// A kind is a NUMBER anything can name: a swing's `hit_vfx`, a hitscan's, a
// blast's, a mob's `blood`, a missile's `on_hit`, a `vfx` action in either
// vocabulary. That is why one editor here serves all of them and why the
// pickers elsewhere only have to offer an id.
//
import { colorParts } from '../vendor/uikit/runtime.js'
import { el, row, number, select, muted, button, text, addHelp } from './ui.js'
import * as THREE from 'three'
import { emitBurst, stepParticles, VfxView } from '/src/render/vfx.js'

// The fields the client's parser reads, with its own defaults. Written here
// rather than generated, because a vfx record has no vocabulary of its own --
// it is the one catalogue line whose reader IS the renderer.
export const PARTICLE_FIELDS = [
  { name: 'count', type: 'int', min: 1, max: 512, step: 1, doc: 'Specks in one burst. Unused by an attached emitter, which uses `rate`.' },
  { name: 'life', type: 'num', min: 0.02, max: 6, step: 0.02, doc: 'Seconds each speck lasts.' },
  { name: 'lifeVar', label: 'life_var', type: 'num', min: 0, max: 3, step: 0.01, doc: 'Spread on that, either way.' },
  { name: 'speed', type: 'num', min: 0, max: 60, step: 0.5, doc: 'World units a second, outward.' },
  { name: 'speedVar', label: 'speed_var', type: 'num', min: 0, max: 30, step: 0.5 },
  { name: 'cone', type: 'num', min: 0, max: 0.5, step: 0.01, doc: 'Turns: 0 is a beam along the event, 0.25 a hemisphere, 0.5 a full sphere.' },
  { name: 'gravity', type: 'num', min: -20, max: 60, step: 1, doc: 'Units per second squared, downward. Negative rises, which is what smoke does.' },
  { name: 'drag', type: 'num', min: 0, max: 8, step: 0.1 },
  { name: 'size', type: 'num', min: 0.01, max: 2, step: 0.01 },
  { name: 'sizeEnd', label: 'size_end', type: 'num', min: 0, max: 2, step: 0.01, doc: 'Size at the end of a speck\'s life. Smoke grows; sparks shrink.' },
  { name: 'rate', type: 'int', min: 1, max: 400, step: 5, attachedOnly: true, doc: 'Specks a second, for an attached emitter.' },
  { name: 'linger', type: 'num', min: 0, max: 3, step: 0.02, attachedOnly: true, doc: 'How long it keeps going after the last event. The chainsaw re-sends every few ticks; letting go lets it lapse.' }
]

/** The next id nothing has taken, in the module's own range and above the engine's. */
export function nextVfxId (module, served = []) {
  const used = new Set([...(module.vfx ?? []).map((v) => v.id), ...served])
  let id = 20
  while (used.has(id)) id++
  return id
}

export function newVfx (module, type = 'particles', served = []) {
  module.vfx ??= []
  const id = nextVfxId(module, served)
  const v = type === 'tracer'
    ? { id, type: 'tracer', colour: 0xffdd55, width: 0.06, life: 0.2 }
    : {
        id,
        type: 'particles',
        count: 16, life: 0.5, lifeVar: 0.25, speed: 6, speedVar: 3, cone: 0.25,
        gravity: 18, drag: 1.5, size: 0.1, sizeEnd: 0, colour: 0xffaa33, colourEnd: 0x662200,
        blend: 'additive'
      }
  module.vfx.push(v)
  return v
}

const hex = (n) => `#${(Number(n) >>> 0).toString(16).padStart(6, '0')}`
const unhex = (s) => parseInt(String(s).replace(/^#/, ''), 16) >>> 0

/** The form for one kind. `ctx.changed()` after every write. */
export function vfxRows (v, ctx) {
  const rows = []
  if (v.type === 'tracer') {
    rows.push(colourRow('colour', v.colour ?? 0xffdd55, (n) => { v.colour = n; ctx.changed() }))
    rows.push(number('width', v.width ?? 0.04, { min: 0.01, max: 1, step: 0.01 }, (n) => { v.width = n; ctx.changed() }))
    rows.push(number('life', v.life ?? 0.12, { min: 0.02, max: 3, step: 0.01 }, (n) => { v.life = n; ctx.changed() }))
    rows.push(muted('A tracer is a line drawn from where the shot started, along its heading, for as long as the event says. Nothing collides with it.'))
    return rows
  }
  const attached = !!v.attach
  rows.push(row('emits', select('', attached ? 'attach' : 'burst',
    [['burst', 'a burst, where the event happened'], ['attach', 'attached: follows the body it came from']],
    (val) => { v.attach = val === 'attach' ? 1 : 0; ctx.changed() }).lastChild))
  for (const f of PARTICLE_FIELDS) {
    if (f.attachedOnly && !attached) continue
    if (f.name === 'count' && attached) continue
    rows.push(addHelp(number(f.label ?? f.name, v[f.name] ?? 0, { min: f.min, max: f.max, step: f.step }, (n) => { v[f.name] = n; ctx.changed() }), f.doc))
  }
  rows.push(colourRow('colour', v.colour ?? 0xffaa33, (n) => { v.colour = n; ctx.changed() }))
  rows.push(colourRow('colour_end', v.colourEnd ?? 0x662200, (n) => { v.colourEnd = n; ctx.changed() }))
  rows.push(row('blend', select('', v.blend ?? 'additive',
    [['additive', 'additive: black is invisible, so the ramp is the fade'], ['alpha', 'alpha: the whole burst fades (smoke)']],
    (val) => { v.blend = val; ctx.changed() }).lastChild))
  rows.push(muted(v.blend === 'alpha'
    ? 'Alpha is for smoke: fading to black would be soot rather than absence.'
    : 'Under additive blending black IS invisible, so the colour ramp doubles as the fade and a dark `colour_end` is how a spark dies.'))
  return rows
}

function colourRow (label, value, onChange) {
  const input = el('input', { type: 'color', value: hex(value) })
  input.style.height = '32px'
  input.addEventListener('change', () => onChange(unhex(input.value)))
  return row(label, input)
}

/**
 * A view that fires the kind over and over, drawn by the client's own VfxView
 * (render/vfx.js) -- the same points, sizes, soft disc and blending the game
 * draws, so a burst that looks wrong here looks wrong in the game, and one
 * that looks right is right.
 *
 * In the world, at the game's scale: a floor grid of one-unit squares and a
 * player-sized figure (0.5 × 2) beside the event, which happens at chest
 * height heading east (+x, the arrow). The camera frames what the kind
 * reaches, worked out by running the burst once ahead of time; drag to look
 * round it, pinch or wheel to come closer.
 */
export class VfxPreview {
  /** @param skin  () => the studio's skin (S.skin): the stage, grid and figure colours */
  constructor (skin = null) {
    this.skin = skin
    this.wrap = el('div', { class: 'st-vfx-wrap' })
    this.renderer = null
    this.def = null
    this.view = null
    this.yaw = -0.6
    this.pitch = 0.32
    this.zoom = 1
    this.fit = 4
    this.raf = 0
    this.label = el('div', { class: 'st-vfx-label' })
    // Its own clock, so it can run slowly: half a second of sparks is over
    // before an eye has judged it. The game's code is stepped at that clock.
    this.rate = 1
    this.clock = 0
    this.real = null
    const slow = el('button', { class: 'st-vfx-slow', text: '1×', title: 'slow motion', onclick: () => { this.rate = this.rate === 1 ? 0.25 : 1; slow.textContent = this.rate === 1 ? '1×' : '¼×'; slow.dataset.on = this.rate === 1 ? '0' : '1' } })
    this.wrap.append(this.label, el('div', { class: 'st-vfx-tools' }, [slow, el('button', { icon: 'action.fit', title: 'frame it again', onclick: () => { this.zoom = 1; this.yaw = -0.6; this.pitch = 0.32 } })]))
  }

  /** The element to put on the page (the canvas inside its frame). */
  get canvas () { this.#ensure(); return this.wrap }

  /** Every speck alive now, across bursts and an attached emitter. */
  get parts () {
    const v = this.view
    if (!v) return []
    return [...v.parts.flatMap((b) => b.parts), ...[...v.emitters.values()].flatMap((e) => e.parts)]
  }

  #ensure () {
    if (this.renderer) return
    const r = new THREE.WebGLRenderer({ antialias: true })
    r.setPixelRatio(Math.min(2, devicePixelRatio))
    r.setClearColor(colorParts(this.skin().canvas('common', 'stage').color).hex)
    this.renderer = r
    const c = r.domElement
    c.classList.add('st-vfx-canvas')
    c.style.touchAction = 'none'
    this.wrap.prepend(c)
    this.camera = new THREE.PerspectiveCamera(50, 16 / 10, 0.05, 200)
    // Drag to look round; two fingers or the wheel to zoom.
    const pts = new Map()
    let pinch = 0
    c.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); c.setPointerCapture?.(e.pointerId) })
    c.addEventListener('pointermove', (e) => {
      const last = pts.get(e.pointerId)
      if (!last) return
      if (pts.size === 1) {
        this.yaw -= (e.clientX - last.x) * 0.008
        this.pitch = Math.max(-0.2, Math.min(1.45, this.pitch + (e.clientY - last.y) * 0.008))
      }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 2) {
        const [a, b] = [...pts.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (pinch) this.zoom = Math.max(0.15, Math.min(6, this.zoom * pinch / d))
        pinch = d
      }
    })
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0 }
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up)
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom = Math.max(0.15, Math.min(6, this.zoom * Math.exp(e.deltaY * 0.0015))) }, { passive: false })
  }

  /** The world the kind plays in: floor, figure, arrow, and a fresh VfxView. */
  #scene () {
    const old = this.scene
    if (old) old.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.() })
    const scene = new THREE.Scene()
    const skin = this.skin()
    const major = colorParts(skin.canvas('common', 'grid.major').color)
    const minor = colorParts(skin.canvas('common', 'grid.minor').color)
    const grid = new THREE.GridHelper(24, 24, major.hex, minor.hex)
    grid.material.transparent = true
    grid.material.opacity = minor.alpha
    scene.add(grid)
    const figure = colorParts(skin.canvas('preview', 'figure').color)
    // A player: 0.5 radius, 2 tall, a little behind and to the side of the event.
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: figure.hex, wireframe: true, transparent: true, opacity: figure.alpha }))
    body.position.set(-1, 1, 0.9)
    scene.add(body)
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), 0.8, figure.hex, 0.18, 0.1)
    scene.add(arrow)
    this.scene = scene
    this.view = new VfxView({ THREE, scene, catalogue: { kinds: new Map([[this.def.id ?? 0, this.def]]) }, poolSize: 4 })
  }

  /**
   * How far the BULK of the kind reaches, run once ahead of time: the camera
   * frames that. Not the furthest speck ever -- a spark that falls for its
   * whole life would pull the camera back until the burst is a few dots --
   * but where most of them are over the first half of their lives.
   */
  #reach (def) {
    if (def.type === 'tracer') return 2.6
    const at = { x: 0, y: 1, z: 0 }
    const parts = emitBurst({ ...def, count: Math.min(96, Math.max(32, def.count ?? 32)) }, at, 0, def.attach ? 0 : 0.4)
    const dist = []
    const dt = 1 / 30
    const half = Math.max(0.1, ((def.life ?? 0.5) + (def.lifeVar ?? 0)) / 2)
    for (let t = 0; t < half && parts.length; t += dt) {
      stepParticles(parts, dt, def)
      for (const p of parts) dist.push(Math.hypot(p.x - at.x, p.y - at.y, p.z - at.z))
    }
    dist.sort((x, y) => x - y)
    const r = dist.length ? dist[Math.floor(dist.length * 0.8)] : 0.5
    // An attached emitter's body goes round a circle as well.
    return Math.max(0.6, def.attach ? r + 1.2 : r) + (def.sizeEnd ?? def.size ?? 0.1)
  }

  /** The skin changed: the stage colour, and the scene drawn again in the new one. */
  reskin () {
    if (!this.renderer) return
    this.renderer.setClearColor(colorParts(this.skin().canvas('common', 'stage').color).hex)
    if (this.def) this.#scene()
  }

  show (def, { radius = 0 } = {}) {
    this.#ensure()
    this.def = def
    this.radius = radius
    this.#scene()
    this.fit = this.#reach(def)
    this.next = 0
    this.t0 = this.clock
    if (!this.raf) this.raf = requestAnimationFrame(() => this.#tick())
  }

  stop () { cancelAnimationFrame(this.raf); this.raf = 0 }

  /** Fire it again now (the page test; a fresh burst to judge). */
  fire () { this.next = this.clock }

  #size () {
    const c = this.renderer.domElement
    const w = Math.max(1, Math.round(c.clientWidth))
    const h = Math.max(1, Math.round(c.clientHeight))
    if (c.width !== Math.round(w * this.renderer.getPixelRatio()) || c.height !== Math.round(h * this.renderer.getPixelRatio())) {
      this.renderer.setSize(w, h, false)
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
    }
  }

  /** One frame: fire what is due, step the client's view, draw. */
  frame () {
    const def = this.def
    if (!def || !this.view) return
    const real = performance.now() / 1000
    this.clock += this.real === null ? 0 : Math.min(0.1, real - this.real) * this.rate
    this.real = real
    const now = this.clock
    const from = new THREE.Vector3(0, 1, 0)
    if (def.type === 'tracer') {
      if (now >= (this.next ?? 0)) {
        this.view.spawn(def.id ?? 0, { x: -0.6, y: 1.2, z: 0.9 }, { x: 4, y: 1.2, z: -0.6 }, now)
        this.next = now + (def.life ?? 0.12) + 0.5
      }
    } else if (def.attach) {
      // Round a circle, so it can be seen to follow the body it is on.
      const a = (now - this.t0) * Math.PI * 0.5
      const at = { x: Math.cos(a) * 1.2, y: 1, z: Math.sin(a) * 1.2 }
      this.view.attach(def.id ?? 0, 1, -a / (Math.PI * 2) + 0.25, now)
      this.view.update(now, () => at)
    } else if (now >= (this.next ?? 0)) {
      this.view.spawn(def.id ?? 0, from, { x: this.radius || 0, y: 1, z: 0 }, now)
      this.next = now + Math.max(0.8, (def.life ?? 0.5) + (def.lifeVar ?? 0) + 0.3)
    }
    if (!def.attach) this.view.update(now)
    this.#size()
    // The reach fills most of the view's height.
    const d = this.fit * this.zoom / Math.tan((this.camera.fov / 2) * Math.PI / 180) / 0.8
    const cy = def.type === 'tracer' ? 1.2 : 1
    this.camera.position.set(Math.cos(this.pitch) * Math.cos(this.yaw) * d, cy + Math.sin(this.pitch) * d, -Math.cos(this.pitch) * Math.sin(this.yaw) * d)
    this.camera.lookAt(def.type === 'tracer' ? 1.7 : 0, cy, 0)
    this.renderer.render(this.scene, this.camera)
    this.label.textContent = def.type === 'tracer' ? `tracer · ${def.life ?? 0.12}s` : `${this.parts.length} live · drag to look round`
  }

  /** How many pixels of the last frame are lit (what the page test asks). */
  litPixels () {
    this.frame()
    const gl = this.renderer.getContext()
    const w = gl.drawingBufferWidth; const h = gl.drawingBufferHeight
    const px = new Uint8Array(w * h * 4)
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px)
    let lit = 0
    for (let i = 0; i < px.length; i += 4) if (px[i] > 120 && px[i] > px[i + 2] + 40) lit++
    return lit
  }

  #tick () {
    const c = this.renderer?.domElement
    this.raf = c?.isConnected ? requestAnimationFrame(() => this.#tick()) : 0
    if (this.raf) this.frame()
  }
}

/** What a picker offers: the module's own kinds, then the ones the app serves. */
/**
 * A kind in a word, by how it looks -- the catalogue gives kinds numbers and no
 * names, and "11 · particles" says nothing about which one is the explosion.
 */
export function vfxLook (d) {
  if (!d) return 'unknown'
  if (d.type === 'tracer') return 'tracer'
  if (d.attach) return 'trail that follows'
  if (d.blend === 'alpha') return 'smoke'
  const c = Number(d.colour ?? 0)
  const r = (c >> 16) & 255; const g = (c >> 8) & 255; const b = c & 255
  if ((d.size ?? 0.1) >= 0.3) return 'fireball'
  if (g > r * 1.3 && g > b) return 'green specks'
  if (r > g * 2 && r > b * 2) return 'red specks'
  if ((d.speed ?? 0) >= 9) return 'sparks'
  return 'specks'
}

export function vfxChoices (module, served = new Map()) {
  const out = []
  for (const v of module.vfx ?? []) out.push([String(v.id), `${v.id} · ${vfxLook(v)} (this module)`])
  for (const [id, d] of served) {
    if ((module.vfx ?? []).some((v) => v.id === id)) continue
    out.push([String(id), `${id} · ${vfxLook(d)}`])
  }
  return out.sort((a, b) => Number(a[0]) - Number(b[0]))
}
