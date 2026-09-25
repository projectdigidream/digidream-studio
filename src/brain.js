//
// Monsters: the forms. A body, a brain, its vars, its states and the
// module's missiles, each as rows of controls that write straight into the
// module document -- the same JSON mobs.load{} will be given (docs/MOBS.md).
// Every field, condition and action comes from maps/scripts/mob_vocab.json.
//
// The workshop (workshop.js) composes these into its windows; nothing here
// knows about a window.
//
import { el, row, text, toggle, select, button, chips, card, muted, number, ask } from './ui.js'
import { nextPropId } from './props_emit.js'
import { argFields } from './argform.js'
import { guessStates } from './sheets.js'

export const DEFAULT_BRAIN = () => ({
  hp: 30, turn_speed: 12, sight: '40', pain_chance: 128, infighting: true, corpse: true,
  initial: 'look',
  vars: { ready: 0 },
  states: {
    look: { anim: 0, move: 'stop', face: 'hold', transitions: [{ to: 'chase', when: [{ cond: 'has_target' }, { cond: 'target_visible' }] }] },
    chase: { anim: 1, move: 'chase', face: 'target', interruptible: true,
             transitions: [{ to: 'look', when: [{ cond: 'has_target', negate: true }] },
                           { to: 'attack', when: [{ cond: 'target_within', distance: '1.5' }, { cond: 'target_visible' }, { cond: 'cooldown_ready', var: 'ready' }] }] },
    attack: { anim: 2, move: 'stop', face: 'target', ticks: 20, next: 'chase', interruptible: true,
              sequence: [{ at: 0, action: 'face' }, { at: 10, action: 'melee', damage: 8, range: '1.5' }, { at: 10, action: 'set_cooldown', var: 'ready', ticks: 60 }] },
    pain: { anim: 3, move: 'stop', face: 'hold', ticks: 10, next: 'chase' },
    death: { anim: 4, move: 'stop', face: 'hold', solid: false, ticks: 100, next: 'death' }
  }
})

export const STATE_NAMES = ['idle', 'walk', 'attack', 'pain', 'death']

/** A monster with a working brain and a body drawn with the first imported sheet. Returns its name, or null. */
export function newMonster (S, raw) {
  const module = S.module
  module.mobs ??= { missiles: {}, mobs: {} }
  module.props ??= []
  const name = String(raw ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '')
  if (!name || module.mobs.mobs[name]) return null
  module.mobs.mobs[name] = DEFAULT_BRAIN()
  const sheets = Object.keys(module.sprites ?? {})
  const sheet = sheets[0] ?? ''
  const states = sheet ? guessStates(module.sprites[sheet].animations) : { 0: 'idle', 1: 'walk', 2: 'attack', 3: 'pain', 4: 'death' }
  module.props.push({ id: nextPropId(module), name, radius: 0.35, height: module.sprites?.[sheet]?.worldHeight ?? 1, speed: 4, solid: true,
                      art: { kind: 'atlas', sheet, states } })
  return name
}

export function deleteMonster (S, name) {
  const module = S.module
  delete module.mobs.mobs[name]
  module.props = (module.props ?? []).filter((p) => p.name !== name)
  if (module.layouts) delete module.layouts[name]
}

/** The body: size, speed, and which sheet draws it in which states. */
export function bodyRows (S, prop, changed) {
  const module = S.module
  if (!prop) return [muted('No body record; the catalogue will not know this monster.')]
  const setSheet = (name) => {
    const anims = module.sprites?.[name]?.animations
    prop.art = { kind: 'atlas', sheet: name, states: anims?.length ? guessStates(anims) : (prop.art?.states ?? {}) }
    if (module.sprites?.[name]?.worldHeight) prop.height = module.sprites[name].worldHeight
    changed()
  }
  const sheet = prop.art?.kind === 'atlas' && module.sprites?.[prop.art.sheet] ? prop.art.sheet : null
  return [
    number('radius', prop.radius, { min: 0.1, max: 4, step: 0.05 }, (v) => { prop.radius = v; changed() }),
    number('height', prop.height, { min: 0.1, max: 8, step: 0.05 }, (v) => { prop.height = v; changed() }),
    // The picture's size is the sheet's, not the body's: every monster drawn
    // with the sheet grows with it, and the preview's ruler shows it.
    sheet ? number('sprite height', module.sprites[sheet].worldHeight, { min: 0.1, max: 8, step: 0.05 }, (v) => { S.setSheetHeight(sheet, v).then(changed) }) : null,
    number('scale', prop.scale ?? 1, { min: 0.1, max: 8, step: 0.05 }, (v) => { prop.scale = v; changed() }),
    sheet ? muted('height is what the body collides as. sprite height is how tall the sheet is drawn, for everything that uses it; scale multiplies that for this body alone.') : muted('scale multiplies how big the picture is drawn; the body it collides as stays height and radius.'),
    number('speed', prop.speed ?? 0, { min: 0, max: 30, step: 0.1 }, (v) => { prop.speed = v; changed() }),
    toggle('solid', !!prop.solid, (v) => { prop.solid = v; changed() }),
    row('sprite sheet', chips([
      ...Object.keys(module.sprites ?? {}).map((n) => ({ id: n, label: n, on: prop.art?.sheet === n })),
      { id: '+', label: '+ import sheet…' }
    ], async (it) => {
      if (it.id === '+') { const name = await S.importSheet?.(); if (name) setSheet(name); else changed(); return }
      setSheet(it.id)
    })),
    prop.art?.sheet && !module.sprites?.[prop.art.sheet] ? text('sheet name', prop.art.sheet, (v) => setSheet(v.toUpperCase().slice(0, 24)), { placeholder: 'a sheet the catalogue serves' }) : null,
    ...[0, 1, 2, 3, 4].map((st) => {
      const anims = module.sprites?.[prop.art?.sheet]?.animations
      const label = `state ${st} · ${STATE_NAMES[st]}`
      const set = (v) => { prop.art ??= { kind: 'atlas', sheet: '', states: {} }; prop.art.states[st] = v.trim(); changed() }
      return anims?.length
        ? select(label, prop.art?.states?.[st] ?? '', [['', '(choose)'], ...anims], set)
        : text(label, prop.art?.states?.[st] ?? '', set, { placeholder: 'animation name' })
    }),
    muted(`Prop id ${prop.id}. The numbers are what a state's \`anim\` names.`)
  ]
}

/** The brain's own fields (not its states). */
export function brainRows (S, m, ctx) {
  const states = Object.keys(m.states ?? {})
  return [
    select('initial state', m.initial ?? '', [['', '(choose)'], ...states], (v) => { m.initial = v || undefined; ctx.onChange() }),
    ...argFields(S.vocab.mob.mob_fields, m, ctx, ['states', 'vars', 'prop', 'initial'])
  ]
}

export function varsRows (m, changed) {
  return [
    chips(Object.keys(m.vars ?? {}).map((v) => ({ id: v, label: `${v} = ${m.vars[v]}` })), async (it) => {
      const v = await ask(`initial value of ${it.id} (empty to remove)`, String(m.vars[it.id]))
      if (v === null) return
      if (v === '') delete m.vars[it.id]; else m.vars[it.id] = Math.round(Number(v)) || 0
      changed()
    }),
    button('+ var', async () => { const n = await ask('var name', 'ready'); if (n) { (m.vars ??= {})[n.replace(/[^a-z0-9_]/gi, '')] = 0; changed() } })
  ]
}

/** One state: its fields, its transitions with their conditions, its sequence. */
export function stateRows (S, m, sname, st, ctx, changed, { onPickTarget = null } = {}) {
  const vocab = S.vocab
  const states = Object.keys(m.states ?? {})
  const rows = [...argFields(vocab.mob.state_fields, st, ctx, ['sequence', 'transitions'])]
  rows.push(el('div', { class: 'st-section-head st-if', text: '❓ go to … when all of …' }))
  ;(st.transitions ?? []).forEach((tr, i) => {
    const trRows = [el('div', { class: 'st-row' }, [
      select('to', tr.to ?? '', [['', '(choose)'], ...states], (v) => { tr.to = v; changed() }).lastChild,
      button('✕', () => { st.transitions.splice(i, 1); changed() })
    ])]
    ;(tr.when ?? []).forEach((c, j) => {
      const spec = vocab.mobConditions.get(c.cond)
      trRows.push(el('div', { class: 'st-row' }, [
        el('span', { class: 'st-entry', text: c.cond }),
        toggle('', !!c.negate, (v) => { c.negate = v || undefined; changed() }).lastChild, muted('not'),
        button('✕', () => { tr.when.splice(j, 1); changed() })
      ]))
      if (spec) trRows.push(...argFields(spec.args ?? [], c, ctx, ['fn']))
    })
    trRows.push(select('add when', '', [['', '…'], ...vocab.mob.conditions.map((c) => [c.name, c.name])],
                       (v) => { if (v) { (tr.when ??= []).push({ cond: v }); changed() } }))
    rows.push(el('div', { class: 'st-card', 'data-transition': String(i) }, trRows))
  })
  rows.push(el('div', { class: 'st-row' }, [
    button('+ transition', () => { (st.transitions ??= []).push({ to: states[0], when: [] }); changed() }),
    onPickTarget ? button('→ tap a target state', onPickTarget) : null
  ]))
  rows.push(el('div', { class: 'st-section-head st-then', text: '▶ at tick … do …' }))
  ;(st.sequence ?? []).forEach((step, i) => {
    const spec = vocab.mobActions.get(step.action)
    const stRows = [el('div', { class: 'st-row' }, [
      number('at', step.at ?? 0, { min: 0, max: 600, step: 1 }, (v) => { step.at = Math.round(v); changed() }).lastChild,
      el('span', { class: 'st-entry', text: step.action }),
      button('✕', () => { st.sequence.splice(i, 1); changed() })
    ])]
    if (spec) stRows.push(...argFields(spec.args ?? [], step, ctx, ['fn']))
    rows.push(el('div', { class: 'st-card' }, stRows))
  })
  rows.push(select('add step', '', [['', '…'], ...vocab.mob.actions.map((a) => [a.name, a.name])],
                   (v) => { if (v) { (st.sequence ??= []).push({ at: 0, action: v }); changed() } }))
  return rows
}

export function missilesSection (S, changed) {
  const module = S.module
  const vocab = S.vocab
  const missiles = module.mobs.missiles
  const rows = []
  for (const [name, ms] of Object.entries(missiles)) {
    const ctx = { onChange: () => changed(), status: (t, l) => S.status(t, l), missiles: Object.keys(missiles), mobs: Object.keys(module.mobs.mobs), props: S.propNames?.() ?? [] }
    const r = [...argFields(vocab.mob.missile_fields, ms, ctx, ['on_hit', 'on_expire'])]
    for (const list of ['on_hit', 'on_expire']) {
      r.push(el('div', { class: 'st-muted', text: list }))
      ;(ms[list] ?? []).forEach((act, i) => {
        const spec = vocab.mobActions.get(act.action)
        r.push(el('div', { class: 'st-card' }, [
          el('div', { class: 'st-row' }, [el('span', { class: 'st-entry', text: act.action }), button('✕', () => { ms[list].splice(i, 1); changed() })]),
          ...(spec ? argFields(spec.args ?? [], act, ctx, ['fn']) : [])
        ]))
      })
      r.push(select(`add ${list}`, '', [['', '…'], ...vocab.mob.actions.map((a) => [a.name, a.name])],
                    (v) => { if (v) { (ms[list] ??= []).push({ action: v }); changed() } }))
    }
    r.push(button('delete missile', () => { delete missiles[name]; changed() }, 'st-danger'))
    rows.push(card(`Missile: ${name}`, r))
  }
  rows.push(button('+ missile', async () => {
    const n = await ask('missile name', 'fireball')
    if (!n) return
    const name = n.toLowerCase().replace(/[^a-z0-9_]/g, '')
    if (!name || missiles[name]) return
    missiles[name] = { speed: '8', gravity: 0, life: 300, z_offset: '0.5', anim_fly: 0, anim_burst: 1, burst_ticks: 20, on_hit: [{ action: 'damage', amount: 10 }] }
    changed()
  }))
  return rows
}
