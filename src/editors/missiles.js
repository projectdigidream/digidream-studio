//
// Missiles: the module's, shared by every monster and weapon
// (module.mobs.missiles, docs/MOBS.md "Missiles"). A side view of its flight as
// the engine flies it (missileflight.js), fired at a stand-in target, with the
// engine's particle kinds bursting where it lands; what it does when it hits,
// runs out, bounces and on its way; and who fires it.
//
import { el, button, confirmDialog } from '../ui.js'
import { MISSILE_ACTIONS, groupsWithMore, unphrased, newAct, sentence, secs, ticksOf, fxNum, fxOf } from '../phrases.js'
import { flight } from '../missileflight.js'
import { emitBurst, stepParticles, rampColour } from '/src/render/vfx.js'
import { injectCss, sentenceEl, chooser, numField, selectField } from './common.js'
import { vfxDef } from './preview.js'

const SVG = 'http://www.w3.org/2000/svg'
const toName = (v) => String(v ?? '').toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '')

const CSS = `
.mi-body{flex:1 1 auto;display:flex;gap:12px;padding:10px 12px;min-height:0;overflow:auto;align-items:flex-start}
.mi-list{flex:0 0 220px;display:flex;flex-direction:column;gap:8px}
.mi-main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:10px}
.mi-svg{width:100%;height:auto;max-height:240px;background:var(--dnp-color-bg-sunken);border:1px solid var(--dnp-color-line-main);border-radius:10px;display:block}
.mi-floor{stroke:var(--dnp-color-line-strong)}
.mi-tick{fill:var(--dnp-color-text-secondary);font-size:11px}
.mi-path{fill:none;stroke:var(--dnp-color-warn);stroke-width:2;stroke-dasharray:6 5}
.mi-shooter{fill:var(--dnp-color-line-strong)}
.mi-target{fill:none;stroke:var(--dnp-color-warn);stroke-width:2}
.mi-blast{fill:none;stroke:var(--dnp-color-error);stroke-dasharray:3 3}
.mi-dot{fill:var(--dnp-color-warn)}
.mi-ok{color:var(--dnp-color-ok);font-size:12px}
.me .me-gcard{height:auto !important;min-height:0;align-items:flex-start !important;justify-content:flex-start !important;white-space:normal}
@media (max-height:560px) and (orientation:landscape){ .mi-body{flex-direction:column} .mi-list{flex:0 0 auto;flex-direction:row;overflow-x:auto;width:100%} .mi-list>*{min-width:170px} }
`

export class MissileEditor {
  constructor (S) {
    this.S = S
    injectCss()
    if (!document.querySelector('style[data-mi]')) document.head.appendChild(el('style', { 'data-mi': '1', text: CSS }))
    this.root = el('div', { class: 'me', 'data-kind': 'missile' })
    this.name = null
    this.dist = 8
    this.fromPlayer = false
    this.sel = null       // { list, i }
    this.picking = null   // list name
    this.newName = ''
    this.shot = null      // { t0, F }
    this.parts = []
  }

  get all () { this.S.module.mobs ??= { missiles: {}, mobs: {} }; return this.S.module.mobs.missiles }
  get m () { return this.name ? this.all[this.name] : null }

  open (name = null) {
    const names = Object.keys(this.all)
    this.name = name && this.all[name] ? name : (this.name && this.all[this.name] ? this.name : names[0] ?? null)
    this.root.hidden = false
    this.render()
    this.loop()
  }
  close () { this.root.hidden = true; cancelAnimationFrame(this.raf) }
  changed () { this.S.moduleChanged(); this.render() }
  say (m, l = 'ok') { this.S.status(m, l) }

  /** Who fires it: monster states, weapon states, other missiles. */
  users (name) {
    const S = this.S
    const out = []
    for (const [mn, b] of Object.entries(S.module.mobs?.mobs ?? {})) for (const [sn, st] of Object.entries(b.states ?? {})) if ((st.sequence ?? []).some((p) => p.action === 'missile' && p.kind === name)) out.push({ label: `${mn} · ${sn}`, go: () => S.go('monsters', mn) })
    for (const [wn, w] of Object.entries(S.module.weapons?.weapons ?? {})) for (const [pn, ph] of Object.entries(w.phases ?? {})) if ((ph.sequence ?? []).some((p) => p.action === 'launch' && p.missile === name)) out.push({ label: `${wn} · ${pn}`, go: () => S.go('weapons', wn) })
    for (const [on, o] of Object.entries(this.all)) for (const list of ['on_hit', 'on_expire', 'on_bounce', 'sequence']) if ((o[list] ?? []).some((p) => p.action === 'missile' && p.kind === name)) out.push({ label: `${on} · ${list.replace('_', ' ')}`, go: () => this.open(on) })
    return out
  }

  create (copy) {
    const name = toName(this.newName)
    if (!/^[a-z][a-z0-9_]{0,23}$/.test(name)) { this.say(!name ? 'Type a name first.' : 'A name starts with a letter.', 'warn'); return }
    if (this.all[name]) { this.say(`There is already a missile called ${name}.`, 'warn'); return }
    this.all[name] = copy && this.m ? JSON.parse(JSON.stringify(this.m)) : { speed: '15', life: 180, z_offset: '1.4', on_hit: [{ action: 'damage', amount: 10 }] }
    this.newName = ''
    this.name = name
    this.changed()
    this.say(`${name}: ${copy ? 'a copy' : 'a new missile'}. A monster fires it with a "fire the missile" step, a weapon with "launch the missile".`)
  }

  render () {
    const S = this.S
    const names = Object.keys(this.all)
    const input = el('input', { type: 'text', placeholder: 'new missile, named', value: this.newName, 'aria-label': "The new missile's name", style: 'max-width:190px' })
    input.addEventListener('input', () => { const n = toName(input.value); if (n !== input.value) input.value = n; this.newName = n })
    const top = el('div', { class: 'me-top' }, [el('b', { text: 'Missiles' }), el('span', { class: 'me-muted', text: 'shared by every monster and weapon of the module' }), el('span', { class: 'me-grow' }),
      input, button('New', () => this.create(false)), this.m ? button(`Copy of ${this.name}`, () => this.create(true)) : null])
    const list = el('div', { class: 'mi-list' }, names.map((n) => {
      const q = this.all[n]
      const u = this.users(n)
      return el('button', { class: 'me-gcard', 'data-on': n === this.name ? '1' : '0', onclick: () => { this.name = n; this.sel = null; this.picking = null; this.shot = null; this.render() } }, [
        el('b', { class: 'me-mono', text: n }),
        el('span', { class: 'me-muted', text: `${fxNum(q.speed) ?? '?'} m/s${fxNum(q.gravity) ? ', falls' : ', flies straight'}${q.homing ? ', homing' : ''}${q.bounces ? `, bounces ${q.bounces}` : ''}` }),
        el('span', { class: 'me-muted', text: u.length ? `used by ${u.map((x) => x.label).join(', ')}` : 'not used yet' })])
    }))
    if (!names.length) list.append(el('span', { class: 'me-muted', text: 'No missiles yet: name one above and press New.' }))
    const main = el('div', { class: 'mi-main' }, this.m ? this.mainPanels() : [])
    this.root.replaceChildren(top, el('div', { class: 'mi-body' }, [list, main]))
  }

  mainPanels () {
    const S = this.S
    const m = this.m
    const set = () => this.changed()
    const say = (t) => this.say(t, 'warn')
    const F = flight(m, { dist: this.dist, fromPlayer: this.fromPlayer })
    this.F = F
    this.svg = this.picture(F)
    const blast = (m.on_hit ?? []).find((p) => p.action === 'damage_area')
    const used = this.users(this.name)
    const checks = []
    if (m.life === undefined) checks.push('No lifetime: a shot that misses stays in the world for ever, and each one keeps a prop slot.')
    if (F.end === 'floor') checks.push(`It does not reach the target at ${this.dist} m: it ${F.bounced ? `bounces ${F.bounced} time(s) and ` : ''}comes down at ${F.endX.toFixed(1)} m.`)
    if (F.end === 'up') checks.push('It climbs out of reach.')
    if (F.end === 'over') checks.push(`It passes over the target at ${F.endZ.toFixed(1)} m.`)
    if (F.end === 'expired') checks.push(`It runs out after ${F.endX.toFixed(1)} m, before the target at ${this.dist} m: make it last longer, or fly faster.`)
    if (blast?.hurts_owner && fxNum(blast.radius) >= this.dist) checks.push(`The blast (${fxNum(blast.radius)} m) reaches its shooter ${this.dist} m away: it hurts itself.`)
    if (!used.length) checks.push('Nothing fires it yet: give a monster\'s state a "fire the missile" step, or a weapon\'s a "launch the missile".')
    const info = F.end === 'hit' ? `${this.fromPlayer ? 'fired level' : g(m) ? 'thrown to land on the target\'s middle' : 'aimed at the target\'s middle'} · reaches ${this.dist} m in ${F.T.toFixed(2)} s (${F.ticks} ticks)${g(m) ? ` · peaks ${F.peak.toFixed(1)} m up` : ''}`
      : `${F.end === 'floor' ? 'lands' : F.end} at ${F.endX.toFixed(1)} m after ${F.T.toFixed(2)} s`
    const fxIds = (m.on_hit ?? []).filter((p) => p.action === 'vfx').map((p) => Number(p.kind))
    const range = el('input', { type: 'range', min: 2, max: 30, step: 1, value: this.dist, 'aria-label': 'Distance to the target' })
    range.addEventListener('input', () => { this.dist = Number(range.value); this.shot = null; this.render() })
    const pv = el('div', { class: 'me-panel' }, [
      el('div', { class: 'me-row' }, [el('b', { class: 'me-mono', text: this.name }), el('span', { class: 'me-muted', text: info })]),
      this.svg,
      el('div', { class: 'me-row' }, [button('Fire', () => { this.shot = { t0: performance.now() }; this.parts = [] }),
        el('label', { class: 'me-muted' }, ['target at ', range, ` ${this.dist} m`]),
        el('label', { class: 'me-muted' }, [(() => { const c = el('input', { type: 'checkbox' }); c.checked = this.fromPlayer; c.addEventListener('change', () => { this.fromPlayer = c.checked; this.render() }); return c })(), ' fired by a player (level, no throw)'])]),
      ...(checks.length ? checks.map((t) => el('span', { class: 'me-warn', icon: 'status.warning', text: ` ${t}` })) : [el('span', { class: 'mi-ok', text: 'nothing to worry about at this distance' })])
    ])
    const flightRows = [
      numField('Speed', fxNum(m.speed) ?? '', 'm/s', (v) => { m.speed = fxOf(v ?? 1); set() }, { hint: m.throw ? 'its launch speed: the angle is solved to land' : 'how fast it flies along the ground', lo: 0.1, hi: 200, say }),
      numField('Falls', fxNum(m.gravity) ?? '', 'm/s²', (v) => { if (!v) delete m.gravity; else m.gravity = fxOf(v); set() }, { hint: 'empty or 0: flies straight. A monster throws a falling missile on the arc that lands on you.', placeholder: 'flies straight' }),
      fxNum(m.gravity) ? selectField('Thrown', m.throw ?? '', [['', 'at its speed, on the one arc that lands'], ['low', 'low: the flat angle at a launch speed'], ['high', 'high: the lob']], (v) => { if (v) m.throw = v; else delete m.throw; set() }) : null,
      numField('Homing', m.homing ? Math.round(Number(m.homing) * 60) : '', '°/s', (v) => { if (!v) delete m.homing; else m.homing = Math.max(1, Math.round(v / 60)); set() }, { hint: `0 flies on; more turns after the target${m.homing ? ` (${m.homing}° a tick)` : ''}. A player's homes on what their auto-aim picks.`, placeholder: 'none' }),
      m.homing ? numField('Homing starts after', m.homing_after ? secs(m.homing_after) : '', 's', (v) => { if (!v) delete m.homing_after; else m.homing_after = ticksOf(v); set() }, { placeholder: 'at once' }) : null,
      m.homing ? numField('Gives up beyond', m.homing_cone ?? '', '°', (v) => { if (!v) delete m.homing_cone; else m.homing_cone = Math.round(v); set() }, { hint: 'a target further off its heading than this is not chased', placeholder: 'never' }) : null,
      numField('Lasts', m.life === undefined ? '' : secs(m.life), 's', (v) => { if (v === null) delete m.life; else m.life = ticksOf(v); set() }, { hint: m.life !== undefined ? `${m.life} ticks; then "when it runs out" happens` : 'for ever', placeholder: 'for ever' }),
      numField('Launch height', fxNum(m.z_offset) ?? '', 'm', (v) => { if (v === null) delete m.z_offset; else m.z_offset = fxOf(v); set() }, { hint: 'above the shooter\'s feet' }),
      numField('Hit size', fxNum(m.radius) ?? '', 'm', (v) => { if (v === null) delete m.radius; else m.radius = fxOf(v); set() }, { hint: 'what it collides with; empty: its prop\'s size', placeholder: "the prop's" }),
      numField('Bounces', m.bounces ?? '', '', (v) => { if (!v) { delete m.bounces; delete m.bounce_keep } else m.bounces = Math.round(v); set() }, { hint: 'off walls and floors before it bursts', placeholder: 'none' }),
      m.bounces ? numField('Keeps of its speed', Math.round((fxNum(m.bounce_keep) ?? 0.6) * 100), '%', (v) => { m.bounce_keep = fxOf((v ?? 60) / 100); set() }, { lo: 0, hi: 100, say }) : null,
      numField('At most', m.max_children ?? '', 'missiles from one shot', (v) => { if (!v) delete m.max_children; else m.max_children = Math.round(v); set() }, { hint: 'the budget for splits and their splits (default 16)', placeholder: '16' })
    ].filter(Boolean)
    const effects = el('div', { class: 'me-row' }, [el('span', { class: 'me-muted', text: 'effects' }), ...(S.vfxChoices?.() ?? []).filter(([, label]) => !/tracer/.test(label)).slice(0, 12).map(([id, label]) => {
      const on = fxIds.includes(Number(id))
      return el('button', { class: 'me-vbtn', 'data-on': on ? '1' : '0', 'aria-pressed': on ? 'true' : 'false', title: label, text: label.replace(/^\d+ · /, ''),
        onclick: () => { m.on_hit ??= []; const i = m.on_hit.findIndex((p) => p.action === 'vfx' && Number(p.kind) === Number(id)); if (i >= 0) m.on_hit.splice(i, 1); else m.on_hit.push({ action: 'vfx', kind: Number(id), at: 'impact' }); set() } })
    })])
    const looks = [
      selectField('Drawn as', m.prop ?? '', [['', '(nothing: an unseen shot)'], ...(S.propNames?.() ?? []).map((p) => [p, p])], (v) => { if (v) m.prop = v; else delete m.prop; set() }, 'a prop of the module (Props), drawn with its own sprite and scale'),
      numField('While flying, plays state', m.anim_fly ?? '', '', (v) => { if (v === null) delete m.anim_fly; else m.anim_fly = Math.round(v); set() }, { placeholder: "the prop's" }),
      numField('When it bursts, plays state', m.anim_burst ?? '', '', (v) => { if (v === null) delete m.anim_burst; else m.anim_burst = Math.round(v); set() }, { placeholder: 'none' }),
      numField('Burst lasts', m.burst_ticks ? secs(m.burst_ticks) : '', 's', (v) => { if (!v) delete m.burst_ticks; else m.burst_ticks = ticksOf(v); set() }, { placeholder: 'none' })
    ]
    const prop = (S.module.props ?? []).find((p) => p.name === m.prop)
    if (prop) looks.push(numField('Drawn at', Number(prop.scale ?? 1), '× size', (v) => { if (v === null || v === 1) delete prop.scale; else prop.scale = fxOf(v); set() }, { hint: `the picture only: "Hit size" is what it collides with. Every missile drawn as ${m.prop} shares it.`, lo: 0.25, hi: 6, say }))
    return [pv,
      el('div', { class: 'me-ov' }, [
        el('div', { class: 'me-panel' }, [el('div', { class: 'me-h first', text: 'Flight' }), el('div', { class: 'me-form' }, flightRows)]),
        el('div', { class: 'me-panel' }, [el('div', { class: 'me-h first', text: 'When it hits' }), el('span', { class: 'me-muted', text: 'What it reached is the target; a blast hurts everything in range.' }), effects, ...this.actions('on_hit')]),
        el('div', { class: 'me-panel' }, [el('div', { class: 'me-h first', text: 'When it runs out' }), el('span', { class: 'me-muted', text: 'A split in the air is a short life and missiles here.' }), ...this.actions('on_expire')]),
        m.bounces ? el('div', { class: 'me-panel' }, [el('div', { class: 'me-h first', text: 'When it bounces' }), ...this.actions('on_bounce')]) : null,
        el('div', { class: 'me-panel' }, [el('div', { class: 'me-h first', text: 'On its way' }), el('span', { class: 'me-muted', text: 'Steps at moments of its flight: bomblets dropped as it flies, a split part way.' }), ...this.actions('sequence')]),
        el('div', { class: 'me-panel' }, [el('div', { class: 'me-h first', text: 'Looks' }), el('div', { class: 'me-form' }, looks)]),
        el('div', { class: 'me-panel' }, [el('div', { class: 'me-h first', text: 'Fired by' }), ...(used.length ? used.map((u) => el('button', { class: 'me-lnk', text: u.label, onclick: u.go })) : [el('span', { class: 'me-muted', text: 'Nothing fires it yet.' })]),
          el('div', { class: 'me-row' }, [el('span', { class: 'me-grow' }), el('button', { class: 'me-lnk danger', text: 'delete this missile', onclick: async () => {
            if (!(await confirmDialog(`Delete ${this.name}? ${used.length ? `${used.length} step(s) fire it and will name nothing.` : 'Nothing fires it.'}`))) return
            delete this.all[this.name]; this.name = Object.keys(this.all)[0] ?? null; this.changed()
          } })])])
      ].filter(Boolean))]
  }

  /** One of its action lists, each a sentence with its fields. */
  actions (key) {
    const m = this.m
    const list = m[key] ?? []
    const ctx = {
      live: true, mobs: Object.keys(this.S.module.mobs?.mobs ?? {}), missiles: Object.keys(this.all), fx: this.S.vfxChoices?.() ?? [], vars: [], states: [], props: this.S.propNames?.() ?? [],
      argCtx: { missiles: Object.keys(this.all), mobs: Object.keys(this.S.module.mobs?.mobs ?? {}), vfxChoices: this.S.vfxChoices, soundField: this.S.soundField, suggest: this.S.suggest, props: this.S.propNames?.() ?? [] },
      soundField: this.S.soundField, changed: () => this.changed(), actSpec: (n) => this.S.vocab?.mobActions?.get(n)
    }
    const rows = list.map((p, i) => el('div', { class: 'me-crow' }, [
      key === 'sequence' ? (() => { const at = el('input', { type: 'text', inputmode: 'decimal', value: String(secs(p.at ?? 0)), 'aria-label': 'at, in seconds of flight', style: 'width:56px' }); at.addEventListener('change', () => { const t = ticksOf(at.value); if (t !== undefined) { p.at = t; this.changed() } }); return el('span', { class: 'me-numw' }, [el('span', { class: 'me-muted', text: 'at' }), at, el('span', { class: 'me-muted', text: 's' })]) })() : null,
      sentenceEl(MISSILE_ACTIONS, p, ctx),
      el('button', { class: 'me-x', 'aria-label': 'Remove', icon: 'action.close', onclick: () => { list.splice(i, 1); if (!list.length) delete m[key]; this.changed() } })
    ]))
    if (!list.length) rows.push(el('span', { class: 'me-muted', text: key === 'on_hit' ? 'Nothing happens when it hits: add damage, or a blast.' : 'Nothing.' }))
    rows.push(this.picking === key
      ? chooser('Add', '', groupsWithMore(MISSILE_ACTIONS, 'act', unphrased(MISSILE_ACTIONS, (this.S.vocab?.mob?.actions ?? []).map((a) => a.name)), { missile: Object.keys(this.all).find((n) => n !== this.name) ?? this.name }), (k) => {
        const a = newAct(MISSILE_ACTIONS, k, 0, { missile: Object.keys(this.all).find((n) => n !== this.name) ?? this.name })
        if (key !== 'sequence') delete a.at
        m[key] = [...list, a]; this.picking = null; this.changed()
      }, () => { this.picking = null; this.render() })
      : el('button', { class: 'me-lnk', text: { on_hit: '+ when it hits', on_expire: '+ when it runs out', on_bounce: '+ when it bounces', sequence: '+ a step on its way' }[key], onclick: () => { this.picking = key; this.render() } }))
    return rows
  }

  /** The side view: floor, metres, shooter, target, the path, the blast. */
  picture (F) {
    const s = document.createElementNS(SVG, 'svg')
    s.setAttribute('class', 'mi-svg'); s.setAttribute('viewBox', '0 0 640 220'); s.setAttribute('role', 'img'); s.setAttribute('aria-label', 'Its flight, seen from the side')
    const Wm = Math.max(this.dist, F.endX) * 1.15 + 2
    const sx = 600 / Wm
    const sy = Math.min(sx, 150 / (Math.max(...F.pts.map((p) => p[1]), 2.2) + 0.5))
    this.px = (x) => 20 + x * sx
    this.py = (z) => 190 - z * sy
    const add = (tag, attrs) => { const e = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); s.appendChild(e); return e }
    add('line', { x1: 0, y1: 190, x2: 640, y2: 190, class: 'mi-floor' })
    const step = Wm > 40 ? 10 : Wm > 16 ? 5 : 2
    for (let x = 0; x <= Wm; x += step) { add('line', { x1: this.px(x), y1: 190, x2: this.px(x), y2: 196, class: 'mi-floor' }); const t = add('text', { x: this.px(x), y: 210, class: 'mi-tick', 'text-anchor': 'middle' }); t.textContent = `${x} m` }
    add('rect', { x: 12, y: this.py(1.8), width: 16, height: 1.8 * sy, rx: 3, class: 'mi-shooter' })
    add('rect', { x: this.px(this.dist) - 6, y: this.py(1.8), width: 12, height: 1.8 * sy, rx: 3, class: 'mi-target' })
    add('path', { d: F.pts.filter((p, i) => i % 3 === 0 || i === F.pts.length - 1).map((p, i) => `${i ? 'L' : 'M'} ${this.px(p[0]).toFixed(1)} ${this.py(p[1]).toFixed(1)}`).join(' '), class: 'mi-path' })
    const blast = (this.m.on_hit ?? []).find((p) => p.action === 'damage_area')
    if (blast) add('circle', { cx: this.px(F.endX), cy: this.py(F.endZ), r: Math.max(2, (fxNum(blast.radius) ?? 0) * sx), class: 'mi-blast' })
    this.dot = add('circle', { cx: 0, cy: 0, r: 6, class: 'mi-dot', visibility: 'hidden' })
    this.partsG = add('g', {})
    return s
  }

  loop () {
    cancelAnimationFrame(this.raf)
    let last = performance.now()
    const frame = (now) => {
      if (this.root.hidden) return
      const dt = Math.min(0.1, (now - last) / 1000); last = now
      const F = this.F
      if (this.shot && F && this.dot?.isConnected) {
        const t = (now - this.shot.t0) / 1000
        const i = Math.min(F.pts.length - 1, Math.floor(t * 60))
        if (t < F.T) { this.dot.setAttribute('visibility', 'visible'); this.dot.setAttribute('cx', this.px(F.pts[i][0])); this.dot.setAttribute('cy', this.py(F.pts[i][1])) } else {
          this.dot.setAttribute('visibility', 'hidden')
          if (!this.shot.burst) {
            this.shot.burst = true
            for (const p of this.m?.on_hit ?? []) if (p.action === 'vfx') { const def = vfxDef(this.S, p.kind); if (def?.type === 'particles') this.parts.push({ def, list: emitBurst(def, { x: 0, y: 0.5, z: 0 }, 0.5, 0.3) }) }
          }
          if (!this.parts.length && t > F.T + 0.5) this.shot = null
        }
      }
      for (const b of this.parts) stepParticles(b.list, dt, b.def)
      this.parts = this.parts.filter((b) => b.list.length)
      if (this.partsG?.isConnected && F) {
        this.partsG.replaceChildren()
        for (const b of this.parts) for (const p of b.list) {
          const k = p.age / p.life
          const c = rampColour(b.def.colour, b.def.colourEnd ?? b.def.colour, k)
          const e = document.createElementNS(SVG, 'circle')
          e.setAttribute('cx', this.px(F.endX + p.x)); e.setAttribute('cy', this.py(F.endZ + p.y))
          e.setAttribute('r', Math.max(1, ((b.def.size ?? 0.1) + ((b.def.sizeEnd ?? 0) - (b.def.size ?? 0.1)) * k) * 20))
          e.setAttribute('style', `fill:rgb(${Math.round(c.r * 255)} ${Math.round(c.g * 255)} ${Math.round(c.b * 255)});opacity:${b.def.blend === 'alpha' ? 0.9 * (1 - k) : 1}`) // content: the module's particle colour
          this.partsG.appendChild(e)
        }
      }
      this.raf = requestAnimationFrame(frame)
    }
    this.raf = requestAnimationFrame(frame)
  }
}

const g = (m) => (fxNum(m.gravity) ?? 0) !== 0

export function openMissiles (S, name = null) {
  S.missileEditor ??= new MissileEditor(S)
  S.missileEditor.open(name)
  return S.missileEditor
}

export { sentence }
