//
// Triggers as sentences: WHEN this happens, IF these hold, THEN do these.
//
// Every word on a card comes from maps/scripts/trigger_vocab.json: the events,
// the conditions, the actions and each one's arguments. The presets along the
// top write the common sentences in one tap (presets.js), and the cards then
// show exactly what was written, for the author to change.
//
// TWO VIEWS. The LIST is one row per trigger -- its event, its name, how many
// conditions and actions -- because a level soon has twenty and a phone shows
// three cards. Tapping a row opens THAT trigger alone: three sections, each
// with its own mark and colour, so the eye finds "when", "if" and "then"
// without reading. Edits commit (undo step, save, bake) and the view is drawn
// again from the document, scroll position kept.
//
import { el, row, text, toggle, select, button, chips, muted, ask } from './ui.js'
import { addTrigger, findEdge } from './doc.js'
import * as presets from './presets.js'
import { argFields, refLabel } from './argform.js'
import { otherSide } from './tools.js'

/**
 * What a trigger touches, for the viewport: each sector, wall and point it
 * names, with the section it is named in. "behind" is the room across the
 * wall the trigger's side_is names, which is what the runtime resolves it to.
 */
export function refsOf (S, t) {
  const refs = []
  const sideCond = (t.conditions ?? []).find((c) => c.c === 'side_is' && c.side && typeof c.side === 'object')
  let behind = null
  if (sideCond?.side.edge) behind = otherSide(S, sideCond.side.edge)?.sectorId ?? null
  else if (sideCond?.side.edgeTwin) behind = findEdge(S.doc, sideCond.side.edgeTwin)?.sector.id ?? null
  const walk = (entries, tone, word) => {
    for (const e of entries ?? []) {
      const name = e.c ?? e.a
      for (const [k, v] of Object.entries(e)) {
        if (k === 'c' || k === 'a') continue
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          if (v.edge) refs.push({ kind: 'edge', id: v.edge, tone, label: `${word} ${name}` })
          else if (v.edgeTwin) { const o = otherSide(S, v.edgeTwin); if (o) refs.push({ kind: 'edge', id: o.id, tone, label: `${word} ${name}` }) }
          else if (v.sector) refs.push({ kind: 'sector', id: v.sector, tone, label: `${word} ${name}` })
        } else if (v === 'behind' && behind) refs.push({ kind: 'sector', id: behind, tone, label: `${word} ${name} (behind)` })
      }
      if (e.x !== undefined && e.y !== undefined) {
        const n = (v) => (Array.isArray(v) ? v[0] / v[1] : Number(v))
        refs.push({ kind: 'point', x: n(e.x), y: n(e.y), z: e.z !== undefined ? n(e.z) : 0, tone, label: `${word} ${name}` })
      }
    }
  }
  walk(t.conditions, 'if', 'IF')
  walk(t.actions, 'then', 'THEN')
  return refs
}

const EVENT_ICON = {
  on_interact: '✋', on_cross: '🚶', on_touch: '☝', on_prop_use: '🔘', on_attack: '⚔',
  on_crush: '⬇', on_tick: '⏱', on_post_tick: '⏱', on_ui_event: '🎛'
}
const icon = (event) => (event ? (EVENT_ICON[event] ?? '⚡') : '↪')

/** A marked section: an icon, a title, a colour down the side. */
function section (mark, title, tone, body, aside = null) {
  return el('div', { class: `st-section st-${tone}` }, [
    el('div', { class: 'st-section-head' }, [el('span', { class: 'st-mark', text: mark }), el('span', { text: title }), aside]),
    ...[].concat(body).filter(Boolean)
  ])
}

export function triggersSheet (S) {
  S.triggerOpen ??= null
  const doc = S.doc
  const open = S.triggerOpen ? doc.triggers.find((t) => t.id === S.triggerOpen) : null
  if (S.triggerOpen && !open) S.triggerOpen = null
  S.setHighlights(open ? refsOf(S, open) : [])
  return open ? triggerView(S, open) : listView(S)
}

/** Show the sheet; leaving it clears what it lit up in the viewport. */
const show = (S) => S.reopen('Triggers', triggersSheet(S), () => S.setHighlights([]))

// --- the list -----------------------------------------------------------------------

function listView (S) {
  const doc = S.doc
  const vocab = S.vocab
  const redraw = () => show(S)
  const problems = vocab.validateTriggers(doc, S.module.panels ?? doc.panels)
  const mobNames = Object.keys(S.module.mobs?.mobs ?? {})

  const pickSector = (prompt) => S.pickInViewport(['sector'], prompt)
  const pickEdge = (prompt) => S.pickInViewport(['edge'], prompt)
  const selectedSector = () => (S.selection?.kind === 'sector' ? S.selection.id : S.selection?.sectorId) ?? null
  const selectedEdge = () => (S.selection?.kind === 'edge' ? S.selection.id : null)

  const applyPreset = async (name) => {
    let r = null
    const sectorId = async (what) => selectedSector() ?? (await pickSector(`tap the ${what}`)).id
    const edgeId = async (what) => selectedEdge() ?? (await pickEdge(`tap the ${what}`)).id
    const centroid = (sid) => {
      const s = doc.sectors[sid]
      const n = s.verts.length
      return { x: s.verts.reduce((a, v) => a + v.x, 0) / n, y: s.verts.reduce((a, v) => a + v.y, 0) / n, z: s.floor }
    }
    const eighth = (v) => Math.round(v * 8) / 8
    switch (name) {
      case 'door': r = presets.door(doc, await sectorId('door sector (it will close up)')); break
      case 'lift': r = presets.lift(doc, await sectorId('lift sector')); break
      case 'switch': r = presets.switchFor(doc, await edgeId('wall with the switch'), (await pickSector('tap the sector it moves')).id); break
      case 'teleport': {
        const e = await edgeId('wall to cross')
        const to = centroid((await pickSector('tap where to arrive')).id)
        r = presets.teleport(doc, e, eighth(to.x), eighth(to.y), to.z); break
      }
      case 'ambush': {
        if (!mobNames.length) { S.status('define a monster first (Monsters tab)', 'warn'); return }
        const e = await edgeId('wall to cross')
        const at = centroid((await pickSector('tap where the monster appears')).id)
        const mob = mobNames.length === 1 ? mobNames[0] : await ask(`which monster? (${mobNames.join(', ')})`, mobNames[0])
        if (!mob) return
        r = presets.ambush(doc, e, mob, eighth(at.x), eighth(at.y), at.z); break
      }
      case 'exit': r = presets.exit(doc, await edgeId('wall with the exit switch')); break
      case 'crusher': r = presets.crusher(doc, await edgeId('wall with the switch'), (await pickSector('tap the sector whose ceiling crushes')).id); break
      case 'slider': r = presets.slider(doc, await edgeId('wall with the switch'), (await pickSector('tap the platform that travels')).id); break
      case 'turntable': r = presets.turntable(doc, await edgeId('wall with the switch'), (await pickSector('tap the sector that turns')).id); break
      case 'blank': {
        const t = addTrigger(doc, { name: uniqueBlank(doc), event: 'on_interact', actions: [{ a: 'log', text: 'hello' }] })
        S.triggerOpen = t.id
        r = { ok: true, triggers: [t] }
        break
      }
    }
    if (!r) return
    if (!r.ok) { S.status(r.problems.join('\n'), 'error'); redraw(); return }
    S.status(`${name}: ${r.triggers.length} trigger(s) written`, 'ok')
    S.commit()
    redraw()
  }

  const body = [
    muted('Presets write the usual sentences. Select a room or a wall first, or tap it when asked.'),
    chips([
      { id: 'door', label: '🚪 door' }, { id: 'lift', label: '⇕ lift' }, { id: 'switch', label: '⏻ switch' },
      { id: 'teleport', label: '✧ teleport' }, { id: 'ambush', label: '☠ ambush' }, { id: 'exit', label: '⇥ exit' },
      { id: 'crusher', label: '▼ crusher' }, { id: 'slider', label: '⇄ slider' },
      { id: 'turntable', label: '⟳ turntable' }, { id: 'blank', label: '+ blank' }
    ], (it) => applyPreset(it.id))
  ]
  if (problems.length) body.push(el('div', { class: 'st-danger', text: problems.join('\n'), style: 'white-space:pre-wrap;font-size:12px' }))
  body.push(...panelRows(S))
  if (!doc.triggers.length) body.push(muted('No triggers yet.'))
  for (const t of doc.triggers) {
    const bad = problems.some((p) => p.startsWith(`trigger "${t.name || t.id}"`))
    const rowEl = el('div', { class: 'st-trow' + (bad ? ' st-trow-bad' : '') }, [
      el('span', { class: 'st-mark', text: icon(t.event) }),
      el('div', { class: 'st-trow-text' }, [
        el('div', { class: 'st-trow-name', text: t.name || t.id }),
        el('div', { class: 'st-muted', text: `${t.event ?? 'run by another trigger'} · ${(t.conditions ?? []).length} if · ${(t.actions ?? []).length} then${t.once ? ' · once' : ''}${t.enabled === false ? ' · disabled' : ''}` })
      ]),
      el('span', { class: 'st-muted', text: '›' })
    ])
    rowEl.addEventListener('click', () => { S.triggerOpen = t.id; redraw() })
    body.push(rowEl)
  }
  return body
}

// --- panels --------------------------------------------------------------------------

/**
 * Panels are the MODULE'S (the Panels section, panelwin.js): designed there,
 * opened here by `ui_open` with the panel's name, and answered by
 * `on_ui_event` + `widget_is`. This lists the ones this map's cards open and
 * goes to the editor.
 */
function panelRows (S) {
  const names = Object.keys(S.module.panels ?? {})
  const used = new Set()
  for (const t of S.doc.triggers) for (const a of t.actions ?? []) if ((a.a === 'ui_open' || a.a === 'ui_close') && a.panel) used.add(a.panel)
  return [el('div', { class: 'st-section-head', text: '▢ panels' }),
    el('div', { class: 'st-row' }, [
      el('span', { class: 'st-muted', text: names.length ? `${names.length} in the module${used.size ? `; these cards open ${[...used].join(', ')}` : ''}` : 'none in the module yet' }),
      button('design panels…', () => S.go('panels'))
    ]),
    muted('A card opens a panel with `ui_open` and its name; a press arrives as `on_ui_event`, and `widget_is` says which widget it was.')]
}

// --- one trigger -------------------------------------------------------------------

function triggerView (S, t) {
  const doc = S.doc
  const vocab = S.vocab
  const redraw = () => show(S)
  const done = () => { S.commit(); redraw() }
  const problems = vocab.validateTriggers(doc, S.module.panels ?? doc.panels).filter((p) => p.startsWith(`trigger "${t.name || t.id}"`))
  const ctx = {
    onChange: done,
    status: (m, l) => S.status(m, l),
    ...S.mapPickers(),
    triggers: doc.triggers.filter((x) => x.id !== t.id).map((x) => ({ id: x.id, name: x.name })),
    mobs: Object.keys(S.module.mobs?.mobs ?? {}), props: S.propNames?.() ?? [],
    suggest: (n, o) => S.suggest?.(n, o) ?? null,
      soundField: S.soundField,
    ...S.panelCtx()
  }

  const body = [
    el('div', { class: 'st-row' }, [
      button('‹ all triggers', () => { S.triggerOpen = null; redraw() }),
      el('span', { style: 'flex:1 1 auto' }),
      button('delete', () => { doc.triggers = doc.triggers.filter((x) => x.id !== t.id); S.triggerOpen = null; done() }, 'st-danger')
    ]),
    text('name', t.name, (v) => { t.name = v.trim(); done() })
  ]
  if (problems.length) body.push(el('div', { class: 'st-danger', text: problems.join('\n'), style: 'white-space:pre-wrap;font-size:12px' }))

  // WHEN
  body.push(section(icon(t.event), 'WHEN', 'when', [
    select('event', t.event ?? '', [['', '↪ only when another trigger runs it'], ...vocab.trigger.events.map((e) => [e.name, `${icon(e.name)} ${e.name} (${(e.params ?? []).join(', ')})`])],
           (v) => { t.event = v || null; done() }),
    el('div', { class: 'st-row' }, [
      toggle('', !!t.once, (v) => { t.once = v; done() }).lastChild, muted('once: spent after it first does something'),
      toggle('', t.enabled !== false, (v) => { t.enabled = v; done() }).lastChild, muted('armed from the start')
    ])
  ]))

  // IF
  const ifRows = []
  ;(t.conditions ?? []).forEach((c, i) => {
    const spec = vocab.conditions.get(c.c)
    const rows = [el('div', { class: 'st-row' }, [
      el('span', { class: 'st-entry', text: c.c }),
      toggle('', !!c.negate, (v) => { c.negate = v || undefined; done() }).lastChild, muted('not'),
      button('✕', () => { t.conditions.splice(i, 1); done() })
    ])]
    if (c.c === 'side_is') rows.push(sideField(c, S, done))
    if (spec) rows.push(...argFields(spec.args ?? [], c, ctx, ['side', 'expect_neighbour', 'expect_tag'], c.c))
    ifRows.push(el('div', { class: 'st-card' }, rows))
  })
  if (!ifRows.length) ifRows.push(muted('always'))
  ifRows.push(select('add', '', [['', '+ condition…'], ...vocab.trigger.conditions
    .filter((c) => !t.event || !c.events || c.events.includes(t.event)).map((c) => [c.name, c.name])],
  (v) => { if (!v) return; (t.conditions ??= []).push({ c: v }); done() }))
  body.push(section('❓', 'IF all of these hold', 'if', ifRows))

  // THEN
  const thenRows = []
  ;(t.actions ?? []).forEach((a, i) => {
    const spec = vocab.actions.get(a.a)
    const rows = [el('div', { class: 'st-row' }, [
      el('span', { class: 'st-entry', text: `${i + 1}. ${a.a}` }),
      i > 0 ? button('↑', () => { [t.actions[i - 1], t.actions[i]] = [t.actions[i], t.actions[i - 1]]; done() }) : null,
      button('✕', () => { t.actions.splice(i, 1); done() })
    ])]
    if (spec) rows.push(...argFields(spec.args ?? [], a, ctx, ['expect_tag', 'fn'], a.a))
    thenRows.push(el('div', { class: 'st-card' }, rows))
  })
  if (!thenRows.length) thenRows.push(el('div', { class: 'st-danger', text: 'a trigger needs at least one action' }))
  thenRows.push(select('add', '', [['', '+ action…'], ...vocab.trigger.actions.map((a) => [a.name, a.name])],
                       (v) => { if (!v) return; (t.actions ??= []).push({ a: v }); done() }))
  body.push(section('▶', 'THEN, in order', 'then', thenRows))
  return body
}

/** The `side` of a side_is: a wall, tapped, and which side of it. */
function sideField (c, S, done) {
  const v = c.side
  const label = v?.edge ? `wall ${v.edge}` : v?.edgeTwin ? `facing wall ${v.edgeTwin}` : 'tap a wall'
  const b = button(label, () => S.pickInViewport(['edge'], 'tap the wall').then((hit) => { c.side = { edge: hit.id }; done() }))
  b.style.flex = '1 1 auto'
  const flip = button('other side', () => {
    if (v?.edge) c.side = { edgeTwin: v.edge }
    else if (v?.edgeTwin) c.side = { edge: v.edgeTwin }
    done()
  })
  return row('side', b, flip)
}

function uniqueBlank (doc) {
  let n = doc.triggers.length + 1
  while (doc.triggers.some((t) => t.name === `trigger ${n}`)) n++
  return `trigger ${n}`
}

export { refLabel }
