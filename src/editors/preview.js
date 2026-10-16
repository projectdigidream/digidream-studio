//
// The editors' preview: the monster (or the weapon) running its compiled brain
// against a stand-in target, drawn as the game draws it -- the body's own
// sheet frame (the client's atlas code), the engine's particle kinds (the
// client's vfx code) -- with why it does what it does, in words.
//
// The simulation is brainsim.js; this only draws it and feeds it input.
//
import { el, button, withIcon } from '../ui.js'
import { useStroke, useText } from '../../vendor/uikit/runtime.js'
import { parseAtlas, frameKey, quadFor } from '/src/render/atlas.js'
import { rotationFor } from '/src/render/props.js'
import { emitBurst, stepParticles, rampColour, parseVfx } from '/src/render/vfx.js'
import { vfxLine } from '../props_emit.js'
import { BrainSim } from '../brainsim.js'
import { TPS, secs } from '../phrases.js'
import { ViewPreview } from '../viewform.js'

/** The parsed atlas and picture for a sheet name: the module's, or the served catalogue's. */
export class Sheets {
  constructor (S) { this.S = S; this.images = new Map(); this.atlases = new Map() }
  image (url) {
    if (this.images.has(url)) return this.images.get(url)
    const img = new Image(); img.src = url; this.images.set(url, img); return img
  }
  get (name) {
    if (!name) return null
    const own = this.S.sheets?.get(name)
    if (own) return { atlas: own.atlas, img: this.image(own.imageUrl) }
    if (this.atlases.has(name)) { const a = this.atlases.get(name); return a ? { atlas: a, img: this.image(`/sprites/${a.image}`) } : null }
    this.atlases.set(name, null)
    fetch(`/sprites/${name}.json`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j) this.atlases.set(name, parseAtlas(j, name)) }).catch(() => {})
    return null
  }
  /** Draws one frame of `animName`, feet at (x, floor), `px` pixels a world unit. Returns the frame's label or null. */
  draw (ctx, sheet, animName, seconds, facing, x, floor, px, scale = 1) {
    const src = this.get(sheet)
    if (!src || !src.img.complete || !src.img.naturalWidth) return null
    const anim = src.atlas.byName.get(animName) ?? src.atlas.animations[0]
    if (!anim) return null
    const n = anim.frames.length
    const i = n <= 1 || !anim.fps ? 0 : (anim.loop === false ? Math.min(n - 1, Math.floor(seconds * anim.fps)) : Math.floor(seconds * anim.fps) % n)
    const view = rotationFor(facing, 0, src.atlas.views.count)
    const key = frameKey(src.atlas, anim.name, i, view)
    const f = src.atlas.frames[key]
    const q = f ? quadFor(src.atlas, key, src.atlas.worldHeight * scale) : null
    if (!q) return null
    ctx.drawImage(src.img, f.rect.x, f.rect.y, f.rect.w, f.rect.h, x + q.dx * px - q.w * px / 2, floor - (q.dy + q.h / 2) * px, q.w * px, q.h * px)
    return { anim: anim.name, frame: i, frames: n, view, views: src.atlas.views.count, fps: anim.fps, loop: anim.loop !== false, tall: src.atlas.worldHeight * scale }
  }
  height (sheet) { return this.get(sheet)?.atlas.worldHeight ?? 1 }
  animations (sheet) { return this.get(sheet)?.atlas.animations.map((a) => a.name) ?? this.S.module.sprites?.[sheet]?.animations ?? [] }
}

/** A particle kind's definition: the module's own first, then the served ones. */
export function vfxDef (S, id) {
  const own = (S.module.vfx ?? []).find((v) => Number(v.id) === Number(id))
  if (own) return parseVfx(vfxLine(own)).kinds.get(Number(own.id)) ?? null
  return S.servedVfx?.get(Number(id)) ?? null
}

export class Preview {
  /**
   * @param S     the studio
   * @param host  { kind: 'mob'|'weapon', subject(): { compiled, prop, initial, missiles }, animOf(stateName) -> sheet animation,
   *                onChange(), sheets: Sheets }
   */
  constructor (S, host) {
    this.S = S
    this.host = host
    this.kind = host.kind
    this.running = false
    this.parts = []         // particles alive: { def, list, at: 'self'|'target' }
    this.raf = 0
    this.last = 0
    this.acc = 0
    this.canvas = el('canvas', { class: 'me-stage', width: 380, height: 150, 'aria-label': this.kind === 'mob' ? 'The monster, as the game draws it' : 'The weapon, held' })
    this.nowEl = el('span', { class: 'me-now' })
    this.varsEl = el('span', { class: 'me-vars' })
    this.evEl = el('span', { class: 'me-muted' })
    this.stateEl = el('span', { class: 'me-mono me-muted' })
    // A weapon is seen as it is held: its first-person view model playing the
    // state's picture (viewform.js), with shots and sparks drawn over it.
    this.stage = this.canvas
    if (this.kind === 'weapon' && host.view?.()) {
      this.vp = new ViewPreview(S)
      this.vp.show(host.view())
      this.canvas.classList.add('me-over')
      this.stage = el('div', { class: 'me-fp' }, [this.vp.canvas, this.canvas])
    }
    this.rebuild()
  }

  /** A new compiled brain (after an edit): the run carries on where it was. */
  rebuild (startAt = null) {
    const sub = this.host.subject()
    if (!sub) { this.stop(); return }
    const old = this.sim
    this.sim = new BrainSim(sub.compiled, { kind: this.kind, speed: Number(sub.prop?.speed ?? 4), ammo: sub.ammo === undefined ? 50 : sub.ammo, missiles: sub.missiles })
    if (old && !startAt && this.sim.nodes[old.state]) {
      for (const k of ['tick', 'vars', 'cools', 'hp', 'dist', 'seen', 'grounded', 'ammo', 'fire', 'pressedAt', 'releasedAt', 'heldFrom', 'hurtAt', 'dead', 'prev', 'adds', 'shots', 'state', 'entered', 'seq', 'stateTicks', 'why', 'speed']) this.sim[k] = old[k]
      this.sim.maxHp = Number(sub.compiled.hp ?? old.maxHp)
    } else if (startAt) this.sim.reset(startAt)
    // a "show the effect" step bursts at the monster (or the muzzle), as the game draws it
    this.sim.onAct = (a) => { if (a.action === 'vfx') this.burst(a.kind ?? a.effect, a.at === 'target' ? 'target' : 'self') }
  }

  /** Back to where it begins: a fresh run. */
  reset () { const sub = this.host.subject(); if (!sub) return; this.parts = []; this.rebuild(sub.initial ?? Object.keys(this.sim.nodes)[0]); this.draw() }

  start () { this.running = true; this.last = performance.now(); this.loop() }
  pause () { this.running = false }
  /** For good: the editor closed, or made another. */
  stop () { this.running = false; this.stopped = true; cancelAnimationFrame(this.raf); this.raf = 0; this.vp && (this.vp.view = null) }
  toggle () { if (this.running) this.pause(); else this.start() }

  loop () {
    cancelAnimationFrame(this.raf)
    const frame = (now) => {
      if (this.stopped || !this.canvas.isConnected) { this.raf = 0; return }
      const dt = Math.min(0.1, (now - this.last) / 1000)
      this.last = now
      if (this.running) {
        this.acc += dt
        while (this.acc >= 1 / TPS) { this.acc -= 1 / TPS; this.tickOnce() }
      }
      for (const b of this.parts) stepParticles(b.list, dt, b.def)
      this.parts = this.parts.filter((b) => b.list.length)
      this.draw()
      this.raf = requestAnimationFrame(frame)
    }
    this.raf = requestAnimationFrame(frame)
  }

  tickOnce () {
    const s = this.sim
    const before = s.state
    const nEv = s.events.length
    s.step()
    // what the steps showed: effects at the monster; a missile that lands bursts at the target with its own
    for (const ev of s.events.slice(nEv)) this.say(ev)
    if (s.state !== before) { this.host.onState?.(s.state); if (this.vp) { this.vp.show(this.host.view()); this.vp.play(s.node?.anim ?? 0) } }
    for (const l of s.landed ?? []) {
      const m = this.host.subject()?.missiles?.[l.missile]
      for (const p of m?.on_hit ?? []) if (p.action === 'vfx') this.burst(p.kind, 'target')
    }
    s.landed = []
  }

  say (text) { this.evEl.textContent = text; this.evAt = performance.now() }

  burst (id, at) {
    const def = vfxDef(this.S, id)
    if (!def || def.type !== 'particles') return
    this.parts.push({ def, at, list: emitBurst(def, { x: 0, y: 1, z: 0 }, at === 'target' ? 0.5 : 0, 0.2) })
  }

  // ---- input ----
  hit (force) { this.say(this.sim.hurt(force ? 0 : 25, { force })); if (!this.running) this.start() }
  kill () { this.sim.hurt(1e9); if (!this.running) this.start() }
  press () {
    const s = this.sim
    const st = s.node
    // a press that starts the preview skips the draw: a press during the draw is lost, in the game as here
    if (!this.running && s.state === this.host.subject()?.initial && st?.ticks !== undefined && st.next && s.nodes[st.next]) { s.enter(st.next) }
    s.press(); if (!this.running) this.start()
  }
  release () { this.sim.release() }

  // ---- drawing ----
  draw () {
    const c = this.canvas
    const w = c.clientWidth || 380
    const h = c.clientHeight || 150
    if (c.width !== w * devicePixelRatio) { c.width = w * devicePixelRatio; c.height = h * devicePixelRatio }
    const ctx = c.getContext('2d')
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.imageSmoothingEnabled = false
    const skin = this.S.skin
    const s = this.sim
    const sub = this.host.subject()
    if (!sub) return
    const floor = h - 16
    if (!this.vp) {
      useStroke(ctx, skin.canvas('preview', 'floor'))
      ctx.beginPath(); ctx.moveTo(0, floor + 0.5); ctx.lineTo(w, floor + 0.5); ctx.stroke()
    }
    useText(ctx, skin.canvas('common', 'text'))
    ctx.textAlign = 'left'
    ctx.fillText(`${s.state} · ${this.host.animOf(s.state) ?? ''}`, 6, 14)
    const selfX = w * 0.15
    const tgtX = w * (0.3 + Math.min(20, s.dist) / 20 * 0.62)
    const px = this.kind === 'mob' ? Math.min(60, (floor - 22) / Math.max(1.2, this.host.sheets.height(sub.prop?.art?.sheet) * Number(sub.prop?.scale ?? 1) * 1.1)) : 40
    if (this.kind === 'mob') {
      const hover = sub.flying ? Math.min(30, Number(sub.hover ?? 2) * px * 0.4) : 0
      const drew = this.host.sheets.draw(ctx, sub.prop?.art?.sheet, this.host.animOf(s.state), s.elapsed / TPS, 0, selfX, floor - hover, px, Number(sub.prop?.scale ?? 1))
      if (!drew) { ctx.fillText('no picture: pick a sprite on Looks', selfX - 20, floor - 30) }
      // what it summoned, drawn small beside it
      let i = 0
      for (const [mob, n] of Object.entries(s.adds)) {
        const prop = (this.S.module.props ?? []).find((p) => p.name === mob)
        for (let k = 0; k < Math.min(n, 8 - i); k++, i++) {
          const ok = prop && this.host.sheets.draw(ctx, prop.art?.sheet, prop.art?.states?.[1] ?? prop.art?.states?.[0], s.tick / TPS + i * 0.13, 0, 10 + i * 14, floor, px * 0.45)
          if (!ok) { ctx.beginPath(); ctx.arc(10 + i * 14, floor - 8, 5, 0, Math.PI * 2); ctx.stroke() }
        }
      }
      // the stand-in target
      ctx.globalAlpha = s.seen ? 1 : 0.35
      useStroke(ctx, skin.canvas('common', 'grid.major'))
      const hy = floor - 1.7 * px * 0.6
      ctx.beginPath(); ctx.arc(tgtX, hy, 5, 0, Math.PI * 2); ctx.moveTo(tgtX, hy + 5); ctx.lineTo(tgtX, floor - 14); ctx.moveTo(tgtX - 9, hy + 12); ctx.lineTo(tgtX + 9, hy + 12)
      ctx.moveTo(tgtX, floor - 14); ctx.lineTo(tgtX - 6, floor); ctx.moveTo(tgtX, floor - 14); ctx.lineTo(tgtX + 6, floor); ctx.stroke()
      ctx.globalAlpha = 1
      ctx.textAlign = 'center'
      ctx.fillText(`${Math.round(s.dist * 10) / 10} m`, tgtX, floor + 13)
      // missiles in flight
      for (const sh of s.shots) {
        const x = selfX + (tgtX - selfX) * sh.p
        ctx.beginPath(); ctx.arc(x, floor - 1.2 * px * 0.6, 5, 0, Math.PI * 2); ctx.fill()
      }
    } else {
      ctx.textAlign = 'center'
      if (!this.vp) ctx.fillText(s.fire ? 'fire held' : 'fire up — this weapon has no first-person picture yet (Looks)', w * 0.5, h * 0.4)
      ctx.beginPath(); ctx.arc(w * 0.5, h * 0.5, 6, 0, Math.PI * 2); useStroke(ctx, skin.canvas('common', 'grid.major')); ctx.stroke()
      for (const sh of s.shots) { ctx.beginPath(); ctx.arc(w * (0.6 - 0.1 * sh.p), h * (0.85 - 0.35 * sh.p), 7 * (1 - sh.p * 0.6), 0, Math.PI * 2); ctx.fill() }
    }
    // particles: the module's colours, as the game draws them (content)
    for (const b of this.parts) {
      const ox = b.at === 'target' ? tgtX : this.kind === 'mob' ? selfX + 14 : w * 0.6
      const oy = this.kind === 'mob' ? floor : h * 0.85
      for (const p of b.list) {
        const t = p.age / p.life
        const col = rampColour(b.def.colour, b.def.colourEnd ?? b.def.colour, t)
        const size = Math.max(1.5, ((b.def.size ?? 0.1) + ((b.def.sizeEnd ?? 0) - (b.def.size ?? 0.1)) * t) * px)
        ctx.globalAlpha = b.def.blend === 'alpha' ? 0.9 * (1 - t) : 1
        ctx.fillStyle = `rgb(${Math.round(col.r * 255)} ${Math.round(col.g * 255)} ${Math.round(col.b * 255)})` // content: the module's particle colour
        ctx.beginPath(); ctx.arc(ox + p.x * px, oy - p.y * px, size / 2, 0, Math.PI * 2); ctx.fill()
      }
    }
    ctx.globalAlpha = 1
    this.nowEl.textContent = this.why()
    this.stateEl.textContent = s.state ?? ''
    const vars = Object.entries(s.vars).filter(([k]) => !k.startsWith('__')).map(([k, v]) => `${k} = ${v}`)
    const cools = Object.entries(s.cools).filter(([, v]) => v > 0).map(([k, v]) => `${k} cooling ${secs(v)} s`)
    const ammo = this.kind === 'weapon' ? [s.ammo === null ? 'ammo: never runs out' : `ammo: ${s.ammo} (Reset refills 50)`] : []
    this.varsEl.textContent = [...ammo, ...vars, ...cools].join(' · ') || 'numbers: none set, no cooldown running'
    if (this.evAt && performance.now() - this.evAt > 2200) { this.evEl.textContent = ''; this.evAt = 0 }
  }

  /** What it would do now, in words. */
  why () {
    const s = this.sim
    const st = s.node
    if (!st) return ''
    const lead = this.running ? `Now in ${s.state}` : `In ${s.state}`
    const i = (st.transitions ?? []).findIndex((t) => s.holdsAll(t.when))
    if (i >= 0) return `${lead}: goes to ${st.transitions[i].to} (rule ${i + 1}).`
    if (s.stateTicks !== null) return `${lead}: no rule holds; after ${secs(s.stateTicks)} s, ${st.next === '@previous' ? 'back to what it was doing' : st.next ? `on to ${st.next}` : 'it stays'}.`
    return `${lead}: no rule holds, so it stays.`
  }

  controls () {
    if (this.kind === 'mob') {
      return el('div', { class: 'me-ctl' }, [
        button(this.running ? 'Pause' : 'Run', (e) => { this.toggle(); e.currentTarget.textContent = this.running ? 'Pause' : 'Run' }),
        button('Hit', () => this.hit(false)), button('Flinch', () => this.hit(true)), button('Kill', () => this.kill()), button('Reset', () => this.reset()),
        button(this.sim.seen ? 'in sight' : 'hidden', (e) => { this.sim.seen = !this.sim.seen; e.currentTarget.textContent = this.sim.seen ? 'in sight' : 'hidden' }),
        el('span', { class: 'me-muted', text: 'target' }),
        el('button', { icon: 'action.zoomout', 'aria-label': 'Target nearer', onclick: () => { this.sim.dist = Math.max(0, Math.round((this.sim.dist - 1) * 10) / 10) } }),
        el('button', { text: '+', 'aria-label': 'Target further', onclick: () => { this.sim.dist = Math.min(20, Math.round((this.sim.dist + 1) * 10) / 10) } }),
        el('span', { class: 'me-muted', text: 'health' }),
        (() => { const r = el('input', { type: 'range', min: 0, max: 100, step: 5, value: 100, 'aria-label': 'Its health, in percent' }); r.addEventListener('input', () => { this.sim.hp = this.sim.maxHp * Number(r.value) / 100 }); return r })()
      ])
    }
    const hold = el('button', { class: 'me-hold', text: 'Hold to fire' })
    const down = (e) => { e.preventDefault(); this.press(); hold.textContent = 'Firing…' }
    const up = () => { this.release(); hold.textContent = 'Hold to fire' }
    hold.addEventListener('pointerdown', down); hold.addEventListener('pointerup', up); hold.addEventListener('pointerleave', up)
    return el('div', { class: 'me-ctl' }, [hold,
      button(this.sim.grounded ? 'on the ground' : 'in the air', (e) => { this.sim.grounded = !this.sim.grounded; e.currentTarget.textContent = this.sim.grounded ? 'on the ground' : 'in the air' }),
      button('Reset', () => this.reset())])
  }
}

export { withIcon }
