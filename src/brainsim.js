//
// The preview's simulation: a COMPILED brain (brainc.js) run the way the
// engine runs it, against a stand-in for its target, so what the editor shows
// is what the module will do.
//
// A copy of maps/scripts/mobs.lua's loop, kept to its rules:
//   - a monster decides every THINK-th tick (8): its due steps first (in `at`
//     order, measured from when it entered), then its transitions in order --
//     the first that holds wins -- then its time running out (`next`);
//   - entering a state remembers where it was in the one it leaves, unless
//     that one is a reaction (`next = "@previous"`); a reaction that runs out
//     RESUMES that state: its elapsed time and its place in its sequence, so
//     no step runs twice;
//   - a hit flinches when the state may be cut short and a roll under
//     pain_chance (of 256) comes up; death ignores both.
// A weapon runs every tick on the player's input, by the same rules
// (maps/scripts/weapons.lua), with no flinch.
//
// What it does NOT simulate, by decision: other monsters (`mob_within`,
// `count_within`, `prop_within`, `ally_in_front` read as nobody there), walls,
// sight lines and paths. Those are checked in a level.
//
// Pure: no DOM. Distances in metres, time in ticks.
//
import { fxNum, TPS } from './phrases.js'

export const THINK = 8
const PREVIOUS = '@previous'
const num = (v, d = 0) => fxNum(v) ?? d

export class BrainSim {
  /**
   * @param brain    a compiled brain (brainc.compileMob) or weapon (compileWeapon)
   * @param opts     { kind: 'mob' | 'weapon', speed: the body's m/s, ammo: 50 | null (never runs out),
   *                   missiles: { name: { speed } } }
   */
  constructor (brain, opts = {}) {
    this.brain = brain
    this.kind = opts.kind ?? 'mob'
    this.nodes = (this.kind === 'mob' ? brain.states : brain.phases) ?? {}
    this.baseSpeed = opts.speed ?? 4
    this.ammoMax = opts.ammo === undefined ? 50 : opts.ammo
    this.missiles = opts.missiles ?? {}
    this.reset()
  }

  reset (start = null) {
    this.tick = 0
    this.vars = { ...(this.brain.vars ?? {}) }
    this.cools = {}
    this.hp = Number(this.brain.hp ?? 100)
    this.maxHp = this.hp
    this.speed = this.baseSpeed
    this.dist = 8
    this.seen = true
    this.grounded = true
    this.ammo = this.ammoMax
    this.fire = false
    this.pressedAt = -1
    this.releasedAt = -1
    this.heldFrom = -1
    this.hurtAt = -1e9
    this.dead = false
    this.prev = null
    this.adds = {}
    this.shots = []
    this.events = []
    this.why = ''
    this.state = null
    this.enter(start && this.nodes[start] ? start : (this.brain.initial ?? Object.keys(this.nodes)[0]))
    this.events = []
  }

  get node () { return this.nodes[this.state] }
  get elapsed () { return this.tick - this.entered }

  enter (name) {
    const st = this.nodes[name]
    if (!st) return
    if (this.node && this.node.next !== PREVIOUS) {
      this.prev = { name: this.state, elapsed: this.tick - this.entered, seq: this.seq, ticks: this.stateTicks }
    }
    this.state = name
    this.entered = this.tick
    this.seq = 0
    this.stateTicks = st.ticks === undefined ? null : Number(st.ticks)
    this.say(`enters ${name}`)
  }

  resume () {
    const p = this.prev
    if (!p || !this.nodes[p.name]) return false
    this.prev = null
    this.state = p.name
    this.entered = this.tick - p.elapsed
    this.seq = p.seq
    this.stateTicks = p.ticks
    this.say(`back to ${p.name}, from ${Math.round((p.elapsed / TPS) * 100) / 100} s`)
    return true
  }

  say (what) { this.events.push(what) }

  // ---- input ----
  press () { this.fire = true; this.pressedAt = this.tick; this.heldFrom = this.tick }
  release () { if (this.fire) { this.fire = false; this.releasedAt = this.tick; this.heldFrom = -1 } }

  /**
   * A hit of `amount` (Hit), or a flinch forced with no damage (Flinch).
   * @returns what happened, in words
   */
  hurt (amount, { force = false } = {}) {
    if (this.dead || this.kind !== 'mob') return ''
    this.hp -= amount
    this.hurtAt = this.tick
    if (this.hp <= 0) { this.dead = true; this.enter('death'); this.why = '→ death: no health left'; return this.why }
    const chance = Number(this.brain.pain_chance ?? 0)
    const st = this.node
    const may = st && st.interruptible !== false && this.nodes.pain
    if (may && (force || Math.random() * 256 < chance)) { this.enter('pain'); this.why = `${force ? 'flinch' : 'hit'} → pain`; return this.why }
    this.why = `hit for ${amount} · no flinch (${Math.round((chance / 256) * 100)}% chance${st?.interruptible === false ? ', and this state cannot be cut short' : ''})`
    return this.why
  }

  // ---- one tick ----
  step () {
    this.tick++
    for (const v of Object.keys(this.cools)) if (this.cools[v] > 0) this.cools[v]--
    this.flyShots()
    if (this.kind === 'mob') this.move()
    if (this.kind === 'mob' && this.dead) { this.runDue(); return }
    if (this.kind === 'weapon' || this.tick % THINK === 0) this.think()
  }

  think () {
    if (this.runDue()) return
    const st = this.node
    for (const [i, t] of (st.transitions ?? []).entries()) {
      if (this.holdsAll(t.when)) { this.why = `→ ${t.to}: rule ${i + 1} of ${this.state}`; this.enter(t.to); return }
    }
    if (this.stateTicks !== null && this.elapsed >= this.stateTicks) {
      if (st.next === PREVIOUS) { if (!this.resume()) this.enter(this.brain.initial) } else if (st.next) { this.why = `→ ${st.next}: time up`; this.enter(st.next) }
    }
  }

  /** The steps now due; true when one sent it elsewhere. */
  runDue () {
    const st = this.node
    const seq = st.sequence ?? []
    const entered = this.entered
    while (this.seq < seq.length && Number(seq[this.seq].at ?? 0) <= this.elapsed) {
      const a = seq[this.seq++]
      this.act(a)
      if (this.node !== st || this.entered !== entered) return true
    }
    return false
  }

  move () {
    const st = this.node
    if (!st || !this.seen) return
    const run = this.speed / TPS
    if (st.move === 'chase') this.dist = Math.max(1.2, this.dist - run)
    else if (st.move === 'charge') this.dist = Math.max(1.2, this.dist - run * 2)
    else if (st.move === 'flee') this.dist = Math.min(30, this.dist + run)
  }

  flyShots () {
    for (const s of this.shots) s.p += s.step
    const landed = this.shots.filter((s) => s.p >= 1)
    this.shots = this.shots.filter((s) => s.p < 1)
    for (const s of landed) this.say(`${s.missile} lands`)
    this.landed = landed
  }

  act (a) {
    const k = a.action
    const said = (w) => this.say(w)
    switch (k) {
      case 'set_cooldown': this.cools[a.var] = Number(a.ticks ?? 0); break
      case 'set_var': this.vars[a.var] = Number(a.value ?? 0); break
      case 'add_var': this.vars[a.var] = Number(this.vars[a.var] ?? 0) + Number(a.by ?? a.value ?? 1); break
      case 'var_random': { const lo = Number(a.min ?? 0); const hi = Number(a.max ?? lo); this.vars[a.var] = lo + Math.floor(Math.random() * (hi - lo + 1)); break }
      case 'set_param': if (a.param === 'move_speed') this.speed = num(a.value, this.speed); break
      case 'spawn': { const n = Number(a.count ?? 1); this.adds[a.mob] = (this.adds[a.mob] ?? 0) + n; said(`summons ${n} ${a.mob}`); break }
      case 'missile': case 'launch': {
        const name = a.kind ?? a.missile
        const sp = num(this.missiles[name]?.speed, 15)
        for (let i = 0; i < Number(a.count ?? 1); i++) this.shots.push({ missile: name, p: 0, step: sp / TPS / Math.max(1, this.kind === 'mob' ? this.dist : 12) })
        said(`fires ${name}`); break
      }
      case 'consume': if (this.ammo !== null) this.ammo = Math.max(0, this.ammo - Number(a.n ?? 1)); break
      case 'teleport': { const d = num(a.distance, 3); this.dist = a.to === 'near' ? Math.max(num(a.min, 1), d * 0.75) : d; said(`teleports ${a.to ?? 'behind'} the target`); break }
      case 'impulse': if (this.kind === 'mob' && (a.towards ?? 'target') === 'target') this.dist = Math.max(1.2, this.dist - num(a.speed) * 0.25); break
      case 'melee': if (this.kind === 'mob' && this.dist <= num(a.range) + 0.05) { said(`hits for ${a.damage}`); if (a.knockback) this.dist = Math.min(30, this.dist + num(a.knockback) * 0.25) } else said(`swings and misses (${Math.round(this.dist * 10) / 10} m)`); break
      case 'goto': { const to = a.state ?? a.phase; if (this.nodes[to]) { this.why = `→ ${to}: a "leave now" step`; this.enter(to) } break }
      case 'despawn': this.dead = true; said('vanishes'); break
      default: break
    }
    this.lastAct = a
  }

  // ---- conditions ----
  holdsAll (when) { return Array.isArray(when) ? when.every((c) => this.holds(c)) : true }
  holds (c) {
    const v = this.raw(c)
    return c.negate ? !v : v
  }
  raw (c) {
    const target = this.seen
    switch (c.cond) {
      // both kinds
      case 'chance': return false
      case 'var_at_least': return Number(this.vars[c.var] ?? 0) >= Number(c.value ?? 0)
      case 'var_is': return Number(this.vars[c.var] ?? 0) === Number(c.value ?? 0)
      case 'cooldown_ready': return (this.cools[c.var] ?? 0) <= 0
      case 'lua': return false
      case 'grounded': return c.value === false ? !this.grounded : this.grounded
      // a monster's
      case 'has_target': case 'target_visible': case 'target_in_front': case 'can_reach': return target
      case 'target_within': return target && this.dist <= num(c.distance)
      case 'target_is': return target && (c.kind ?? 'player') === 'player'
      case 'hp_below': return this.hp * 100 < Number(c.percent ?? 0) * this.maxHp
      case 'state_elapsed': return this.elapsed >= Number(c.ticks ?? 0)
      case 'was_hurt': return this.tick - this.hurtAt <= Number(c.within ?? 18)
      case 'mob_within': case 'count_within': case 'prop_within': case 'ally_in_front': case 'hurt_by_mob':
      case 'target_above': case 'target_below': case 'stuck': return false
      // a weapon's
      case 'always': return true
      case 'button_pressed': return this.pressedAt === this.tick || (this.pressedAt === this.tick - 1)
      case 'button_released': return this.releasedAt === this.tick || this.releasedAt === this.tick - 1
      case 'button_held': return this.fire
      case 'held_for': return this.fire && this.tick - this.heldFrom >= Number(c.ticks ?? 0)
      case 'has_ammo': return this.ammo === null || this.ammo >= Number(c.n ?? 1)
      case 'no_ammo': return this.ammo !== null && this.ammo < 1
      case 'phase_elapsed': return this.elapsed >= Number(c.ticks ?? 0)
      case 'moving': case 'falling': return false
      default: return false
    }
  }

  /** Runs n ticks; returns the states entered on the way, in order. */
  run (n) {
    const path = []
    for (let i = 0; i < n; i++) { const was = this.state; this.step(); if (this.state !== was) path.push(this.state) }
    return path
  }
}
