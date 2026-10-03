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
import { el, row, number, select, muted, button, text } from './ui.js'
import { emitBurst, stepParticles, rampColour } from '/src/render/vfx.js'

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
    rows.push(number(f.label ?? f.name, v[f.name] ?? 0, { min: f.min, max: f.max, step: f.step }, (n) => { v[f.name] = n; ctx.changed() }))
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
 * A canvas that fires the kind over and over, integrated by the client's own
 * emitBurst and stepParticles -- so a burst that looks wrong here looks wrong
 * in the game, and one that looks right is right.
 *
 * Drawn side-on: x across, z up, which is the view a person judges a spray of
 * blood or a muzzle flash in. Gravity pulls down the screen because it pulls
 * down in the world.
 */
export class VfxPreview {
  constructor () {
    this.canvas = el('canvas', { class: 'st-vfx-canvas', width: 320, height: 200 })
    this.def = null
    this.parts = []
    this.radius = 0
    this.last = 0
    this.next = 0
    this.raf = 0
  }

  show (def, { radius = 0 } = {}) {
    this.def = def
    this.radius = radius
    this.parts = []
    this.next = 0
    this.last = performance.now()
    if (!this.raf) this.raf = requestAnimationFrame(() => this.#tick())
  }

  stop () { cancelAnimationFrame(this.raf); this.raf = 0 }

  #tick () {
    this.raf = this.canvas.isConnected ? requestAnimationFrame(() => this.#tick()) : 0
    const now = performance.now()
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    const def = this.def
    const c = this.canvas
    const g = c.getContext('2d')
    g.clearRect(0, 0, c.width, c.height)
    g.fillStyle = '#0b0d12'
    g.fillRect(0, 0, c.width, c.height)
    if (!def || def.type === 'tracer') { this.#tracer(g, def); return }

    // An attached emitter runs continuously; a burst repeats so the shape can
    // be judged more than once. Either way the specks are the game's own.
    if (def.attach) {
      this.carry = (this.carry ?? 0) + (def.rate ?? 40) * dt
      const n = Math.floor(this.carry)
      this.carry -= n
      for (let i = 0; i < n; i++) this.parts.push(...emitBurst({ ...def, count: 1 }, { x: 0, y: 0, z: 0 }, 0, this.radius))
    } else {
      this.next -= dt
      if (this.next <= 0) {
        this.parts.push(...emitBurst(def, { x: 0, y: 0, z: 0 }, 0, this.radius))
        this.next = Math.max(0.6, (def.life ?? 0.5) + (def.lifeVar ?? 0))
      }
    }
    stepParticles(this.parts, dt, def)

    const scale = 14
    const ox = c.width * 0.36
    const oy = c.height * 0.62
    g.strokeStyle = '#1b2230'
    g.beginPath(); g.moveTo(0, oy + 0.5); g.lineTo(c.width, oy + 0.5); g.stroke()
    for (const p of this.parts) {
      const t = Math.min(1, p.age / p.life)
      const size = Math.max(0.5, ((def.size ?? 0.1) + (((def.sizeEnd ?? 0) - (def.size ?? 0.1)) * t)) * scale)
      const col = rampColour(def.colour ?? 0xffaa33, def.colourEnd ?? 0, t)
      g.globalAlpha = def.blend === 'alpha' ? 1 - t : 1
      g.globalCompositeOperation = def.blend === 'alpha' ? 'source-over' : 'lighter'
      g.fillStyle = hex(col)
      g.fillRect(ox + p.x * scale - size / 2, oy - p.y * scale - size / 2, size, size)
    }
    g.globalAlpha = 1
    g.globalCompositeOperation = 'source-over'
    g.fillStyle = '#5f7fa8'
    g.font = '10px ui-monospace, Menlo, monospace'
    g.fillText(`${this.parts.length} live`, 6, 14)
  }

  #tracer (g, def) {
    const c = this.canvas
    if (!def) return
    g.strokeStyle = hex(def.colour ?? 0xffdd55)
    g.lineWidth = Math.max(1, (def.width ?? 0.04) * 60)
    g.beginPath(); g.moveTo(30, c.height / 2); g.lineTo(c.width - 30, c.height / 2); g.stroke()
    g.fillStyle = '#5f7fa8'
    g.font = '10px ui-monospace, Menlo, monospace'
    g.fillText(`${def.life ?? 0.12}s`, 6, 14)
  }
}

/** What a picker offers: the module's own kinds, then the ones the app serves. */
export function vfxChoices (module, served = new Map()) {
  const out = []
  for (const v of module.vfx ?? []) out.push([String(v.id), `${v.id} · ${v.type === 'tracer' ? 'tracer' : 'particles'} (this module)`])
  for (const [id, d] of served) {
    if ((module.vfx ?? []).some((v) => v.id === id)) continue
    out.push([String(id), `${id} · ${d.type}`])
  }
  return out.sort((a, b) => Number(a[0]) - Number(b[0]))
}
