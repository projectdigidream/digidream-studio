//
// The swept collider, and a picture of it.
//
// A swing is a VOLUME MOVING THROUGH TIME: it starts at `sweep_from`, ends at
// `sweep_to` and is live for `ticks`, so a target that steps out of the way
// mid-swing is missed. That is the one attack this engine predicts, and it is
// the same facility for a player's fist and a monster's claw -- the fields are
// the same list (swing_fields in both vocabularies), so this edits both.
//
// WHY A DIAGRAM. Every angle here is a TURN fraction, and six of them
// interact: an arc that is wide but sweeps nowhere, a thrust that does not
// rotate, an overhead chop that misses anything not below you. Reading that
// out of twelve numbers is what the picture is for -- and the picture is drawn
// from the same fields the form writes, so it cannot describe a swing the
// engine would not make.
//
import { el, muted } from './ui.js'
import { sweepOffset, pitchOffset } from '/src/render/swing.js'
import { argFields } from './argform.js'
import { useStroke, useText } from '../vendor/uikit/runtime.js'
import { withAlpha } from './skin.js'

/** A vocabulary `fx` value as a plain number: 12, "0.125" or [1, 8]. */
export function fxValue (v, fallback = 0) {
  if (v === undefined || v === null || v === '') return fallback
  if (Array.isArray(v)) return v.length === 2 && v[1] ? v[0] / v[1] : fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

const TAU = Math.PI * 2

/**
 * The swing, PLAYED.
 *
 * A swing is a volume moving through time, and a still picture of it is the one
 * thing that cannot show that: an arc drawn at full width looks identical
 * whether the collider sweeps across it over sixteen ticks or sits still at one
 * angle for one. So this runs the swing on a loop at the tick rate and draws
 * where the collider IS, with the span it has already covered behind it.
 *
 * The angles come from client/src/render/swing.js -- swingPhase, sweepOffset
 * and pitchOffset, the very functions the game's own overlay uses, which in
 * turn mirror World::resolve_attack. So a shape that reads wrong here reads
 * wrong in play, and the preview cannot describe a swing the engine would not
 * make.
 *
 * Two panels: from above, where reach and arc live, and from the side, where
 * the pitch does. A swing with no `half_pitch` does not check height at all,
 * and the side panel says so rather than drawing a lie.
 */
export class SwingPreview {
  /** @param skin  () => the studio's skin (S.skin), asked for every colour each frame */
  constructor (skin) {
    this.skin = skin
    this.canvas = el('canvas', { class: 'st-swing-canvas', width: 336, height: 172 })
    this.swing = null
    this.radius = 0.35
    this.t = 0
    this.last = 0
    this.raf = 0
  }

  show (swing, { radius = 0.35 } = {}) {
    this.swing = swing
    this.radius = radius
    this.last = performance.now()
    if (!this.raf) this.raf = requestAnimationFrame(() => this.#tick())
  }

  stop () { cancelAnimationFrame(this.raf); this.raf = 0 }

  #tick () {
    this.raf = this.canvas.isConnected ? requestAnimationFrame(() => this.#tick()) : 0
    const now = performance.now()
    const dt = Math.min(0.1, (now - this.last) / 1000)
    this.last = now
    const sw = this.swing
    const c = this.canvas
    const g = c.getContext('2d')
    g.clearRect(0, 0, c.width, c.height)
    if (!sw) return
    // The skin's colours, asked each frame, so a new skin shows at once.
    const k = (key) => this.skin().canvas('preview', `swing.${key}`)
    const range = k('range'); const current = k('current')

    const ticks = Math.max(1, Math.round(Number(sw.ticks) || 12))
    // The gap between swings is the cooldown, so the loop shows the real
    // cadence rather than a collider that never stops.
    const gap = Math.max(6, Math.round(Number(sw.cooldown) || 0))
    const total = ticks + gap
    this.t = (this.t + dt * 60) % total
    const live = this.t < ticks
    const left = live ? ticks - Math.floor(this.t) : 0

    const reach = Math.max(0.1, fxValue(sw.reach, 2))
    const minReach = Math.max(0, fxValue(sw.min_reach, 0))
    const halfArc = fxValue(sw.half_arc, 0.125)
    const from = fxValue(sw.sweep_from, -0.125)
    const to = fxValue(sw.sweep_to, 0.125)
    const halfPitch = fxValue(sw.half_pitch, 0)
    const pitchFrom = fxValue(sw.pitch_from, 0)
    const pitchTo = fxValue(sw.pitch_to, 0)

    const pane = c.width / 2
    const R = 62
    const scale = R / (this.radius + reach)
    const r0 = (this.radius + minReach) * scale
    const r1 = (this.radius + reach) * scale

    // --- from above --------------------------------------------------------
    const cx = pane / 2; const cy = c.height / 2 + 6
    this.#grid(g, cx, cy, scale, reach)
    const nowOffset = live ? sweepOffset({ from, to, ticks, left }) : null
    this.#wedge(g, cx, cy, Math.min(from, to) - halfArc, Math.max(from, to) + halfArc, r0, r1, range.fill)
    if (nowOffset !== null) {
      // A short trail, so the direction of travel is visible in a still frame.
      for (let back = 1; back <= 4; back++) {
        const l = left + back
        if (l > ticks) break
        const o = sweepOffset({ from, to, ticks, left: l })
        if (o === null) continue
        this.#wedge(g, cx, cy, o - halfArc, o + halfArc, r0, r1, withAlpha(current.fill, (0.16 - back * 0.03) / 0.42))
      }
      this.#wedge(g, cx, cy, nowOffset - halfArc, nowOffset + halfArc, r0, r1, current.fill, current.color)
    }
    this.#body(g, cx, cy, scale)
    this.#label(g, 6, 14, 'from above')
    this.#label(g, 6, c.height - 6, live ? `tick ${Math.floor(this.t) + 1}/${ticks}` : `cooldown ${gap}t`)

    // --- from the side -----------------------------------------------------
    const sx = pane + pane / 2
    g.strokeStyle = k('ring').color
    g.beginPath(); g.moveTo(pane + 0.5, 8); g.lineTo(pane + 0.5, c.height - 8); g.stroke()
    this.#grid(g, sx, cy, scale, reach)
    if (halfPitch > 0) {
      this.#wedge(g, sx, cy, Math.min(pitchFrom, pitchTo) - halfPitch, Math.max(pitchFrom, pitchTo) + halfPitch, r0, r1, range.fill)
      const p = live ? pitchOffset({ pitchFrom, pitchTo, ticks, left }) : null
      if (p !== null) this.#wedge(g, sx, cy, p - halfPitch, p + halfPitch, r0, r1, current.fill, current.color)
    } else {
      this.#wedge(g, sx, cy, -0.012, 0.012, r0, r1, range.color)
    }
    g.strokeStyle = k('ring').color
    g.beginPath(); g.moveTo(pane + 8, cy + 0.5); g.lineTo(c.width - 8, cy + 0.5); g.stroke()
    this.#body(g, sx, cy, scale)
    this.#label(g, pane + 6, 14, halfPitch > 0 ? 'from the side' : 'from the side · no height check')
    this.#label(g, pane + 6, c.height - 6, `reach ${reach.toFixed(2)}`)
  }

  #wedge (g, cx, cy, a0, a1, r0, r1, fill, stroke = null) {
    const steps = Math.max(2, Math.ceil(Math.abs(a1 - a0) * 64))
    g.beginPath()
    for (let i = 0; i <= steps; i++) {
      const t = a0 + (a1 - a0) * (i / steps)
      const x = cx + Math.cos(t * TAU) * r1
      const y = cy - Math.sin(t * TAU) * r1
      i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)
    }
    for (let i = steps; i >= 0; i--) {
      const t = a0 + (a1 - a0) * (i / steps)
      g.lineTo(cx + Math.cos(t * TAU) * r0, cy - Math.sin(t * TAU) * r0)
    }
    g.closePath()
    g.fillStyle = fill
    g.fill()
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke() }
  }

  /** A ring every world unit, so reach is read off the picture rather than trusted. */
  #grid (g, cx, cy, scale, reach) {
    const skin = this.skin()
    useStroke(g, skin.canvas('preview', 'swing.ring'))
    for (let u = 1; u <= Math.ceil(reach + this.radius); u++) {
      g.beginPath(); g.arc(cx, cy, u * scale, 0, TAU); g.stroke()
    }
    useStroke(g, skin.canvas('preview', 'swing.reach'))
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + (this.radius + reach) * scale + 8, cy); g.stroke()
    g.setLineDash([])
  }

  #body (g, cx, cy, scale) {
    g.fillStyle = this.skin().canvas('preview', 'swing.body').fill
    g.beginPath(); g.arc(cx, cy, Math.max(2, this.radius * scale), 0, TAU); g.fill()
  }

  #label (g, x, y, t) {
    useText(g, this.skin().canvas('common', 'text'))
    g.fillText(t, x, y)
  }
}

/**
 * The swing's form: the picture, then every field the vocabulary declares.
 *
 * `owner` is the thing that has a `swing` -- a mob, a weapon or one of a
 * weapon's phases -- so the same rows serve all three.
 */
export function swingRows (vocab, owner, ctx, { radius = 0.35, onRemove = null, preview = null } = {}) {
  const fields = vocab?.swing_fields ?? []
  if (!owner.swing) {
    return [muted('No swing. A swept collider is the one attack the client predicts, so it appears the tick the button goes down rather than a round trip later.')]
  }
  const rows = []
  if (preview) { preview.show(owner.swing, { radius }); rows.push(preview.canvas) }
  rows.push(...argFields(fields, owner.swing, ctx))
  rows.push(muted('Angles are turns: 0.125 is 45°. `sweep_from` equal to `sweep_to` is a thrust that does not rotate. `half_pitch` of 0 means no height check at all.'))
  if (onRemove) rows.push(el('div', { class: 'st-row' }, [el('button', { class: 'st-danger', text: 'remove the swing', onclick: onRemove })]))
  return rows
}

/** A swing with the shape of a short jab, ready to tune. */
export function newSwing () {
  return { damage: 10, reach: '1.5', half_arc: [1, 8], sweep_from: [-1, 8], sweep_to: [1, 8], ticks: 12, cooldown: 20 }
}
