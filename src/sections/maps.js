//
// The module's maps: open one, make one, delete one -- and, with the
// METAMAP on, where each sits on the module's grid (metamap.js).
//
// Moved out of main.js as a section of the module (app/router.js); it reaches
// the studio's shared state and verbs through S, given at install.
//
import { overrides } from '../player.js'
import { el, button, text, muted, ask, confirmDialog, toggle, number, select } from '../ui.js'
import { metamapProblems, mapAt, outsideCell, MAX_RADIUS } from '../metamap.js'
import { newMetamap } from '../migrate.js'
import { thumbCanvas } from '../thumbs.js'

let S = null

/** The module's maps, one sheet: tap one to edit it, ✕ to delete it, + for a new one. */
function showMaps () {
  const names = Object.keys(S.docs)
  const rows = names.map((n) => {
    const d = S.docs[n]
    const on = n === S.docName
    const r = el('div', { class: 'st-trow', 'data-on': on ? '1' : '0', 'data-map': n }, [
      thumbCanvas(d, { imageFor: S.imageFor }, 'sd-thumb sd-thumb-row'),
      el('div', { class: 'st-trow-text' }, [
        el('div', { class: 'st-trow-name', text: `${on ? '▶ ' : ''}${n}` }),
        el('div', { class: 'st-muted', text: `${d.order.length} sectors · ${d.entities.length} things · ${d.triggers.length} triggers${overrides(d).length ? ` · own player ${overrides(d).join(', ')}` : ''}${on ? ' · editing' : ''}` })
      ]),
      button('✕', async (e) => {
        e.stopPropagation()
        if (Object.keys(S.docs).length < 2) { S.status('a module keeps at least one map', 'warn'); return }
        if (!await confirmDialog(`delete map ${n}? Undo on this page brings it back.`)) return
        delete S.docs[n]
        if (S.module.metamap?.cells) delete S.module.metamap.cells[n]
        S.moduleChanged()
        if (n === S.docName) await S.openDoc(Object.keys(S.docs)[0])
        S.status(`deleted map ${n}`, 'ok')
        showMaps()
      }, 'st-danger')
    ])
    r.addEventListener('click', () => S.go('map', n))
    return r
  })
  S.ui.showSheet('Maps', [
    ...rows,
    button('+ new map', async () => {
      const name = await ask('map name (letters, digits, dashes)', `map${names.length + 1}`)
      if (!name) return
      const clean = name.toLowerCase().replace(/[^a-z0-9_-]/g, '')
      if (!clean || S.docs[clean]) { S.status('that name is taken or empty', 'warn'); return }
      S.docs[clean] = S.starterDoc(clean)
      S.save()
      await S.go('map', clean)
      S.status(`${clean}: a new map, one room`, 'ok')
    }),
    muted('Tap a map to edit it. Every map ships in the pack; Play starts the one being edited.'),
    ...metamapRows()
  ])
}

/**
 * The metamap: the maps on a grid. Tap a map (in the grid or below it) to
 * pick it up, then a cell to put it there -- a map already there swaps with
 * it. North is up, as in the map editor.
 */
function metamapRows () {
  S.module.metamap ??= newMetamap()
  const mm = S.module.metamap
  const changed = () => { S.moduleChanged(); showMaps() }
  const rows = [el('div', { class: 'st-section-head', text: '▦ metamap' }),
    toggle('put the maps on a grid', !!mm.enabled, (v) => { mm.enabled = v; changed() })]
  if (!mm.enabled) {
    rows.push(muted('A grid says where each map sits: which ones are kept in memory around a player and, with a pitch, one world you walk across from map to map.'))
    return rows
  }
  rows.push(toggle('one shared world (walk from map to map)', !!mm.pitch, (v) => { mm.pitch = v ? suggestedPitch() : null; changed() }))
  if (mm.pitch) {
    rows.push(el('div', { class: 'st-row' }, [
      number('cell width', mm.pitch[0], { min: 1, max: 4096, step: 1 }, (v) => { mm.pitch[0] = v; changed() }),
      number('cell depth', mm.pitch[1], { min: 1, max: 4096, step: 1 }, (v) => { mm.pitch[1] = v; changed() })
    ]))
  }
  rows.push(select('kept around a player', String(mm.radius ?? 1), [...Array(MAX_RADIUS + 1).keys()].map((r) => [String(r), r === 0 ? 'only their map' : `${r} cell${r > 1 ? 's' : ''} each way (${(2 * r + 1) ** 2} maps)`]),
    (v) => { mm.radius = Number(v); changed() }))
  // The grid: every placed cell and one more all round.
  const placed = Object.values(mm.cells ?? {})
  const xs = placed.map((c) => c[0]); const ys = placed.map((c) => c[1])
  const x0 = Math.min(0, ...xs) - 1; const x1 = Math.max(0, ...xs) + 1
  const y0 = Math.min(0, ...ys) - 1; const y1 = Math.max(0, ...ys) + 1
  const grid = el('div', { class: 'sd-grid', style: `grid-template-columns:repeat(${x1 - x0 + 1},minmax(64px,1fr));--cell-aspect:${mm.pitch ? `${mm.pitch[0]}/${mm.pitch[1]}` : '16/10'}` })
  for (let y = y1; y >= y0; y--) {
    for (let x = x0; x <= x1; x++) {
      const name = mapAt(mm, x, y)
      grid.append(el('button', { class: 'sd-cell', 'data-cell': `${x},${y}`, 'data-cell-map': name ?? undefined, 'data-on': name && name === S.mmPicked ? '1' : '0',
        title: `cell ${x} ${y}`, onclick: () => cellTapped(x, y) }, [
          // In one shared world every cell is drawn at the cell's own scale, so
          // the grid reads as the world; otherwise each map fills its cell.
          name ? thumbCanvas(S.docs[name], { imageFor: S.imageFor, bounds: mm.pitch ? [0, 0, mm.pitch[0], mm.pitch[1]] : null }, 'sd-thumb sd-thumb-cell') : null,
          el('span', { class: 'sd-cell-name', text: name ?? (S.mmPicked ? '↓ here' : '+') }), el('span', { class: 'st-muted sd-cell-xy', text: `${x},${y}` })].filter(Boolean)))
    }
  }
  rows.push(grid)
  const loose = Object.keys(S.docs).filter((n) => !mm.cells?.[n])
  if (loose.length) {
    rows.push(el('div', { class: 'st-row' }, [el('span', { class: 'st-muted', text: 'not on the grid:' }),
      ...loose.map((n) => el('button', { 'data-loose': n, 'data-on': n === S.mmPicked ? '1' : '0', text: n, onclick: () => { S.mmPicked = S.mmPicked === n ? null : n; showMaps() } }))]))
  }
  if (S.mmPicked && mm.cells?.[S.mmPicked]) rows.push(button(`take ${S.mmPicked} off the grid`, () => { delete mm.cells[S.mmPicked]; S.mmPicked = null; changed() }))
  for (const p of metamapProblems(mm, Object.keys(S.docs))) rows.push(el('div', { class: 'st-danger st-problem', text: p }))
  if (mm.pitch) {
    for (const n of Object.keys(mm.cells ?? {})) {
      const out = outsideCell(S.docs[n], mm.pitch)
      if (out.length) rows.push(el('div', { class: 'st-warn-box', text: `${n} reaches outside its cell (0..${mm.pitch[0]} × 0..${mm.pitch[1]}): it would overlap its neighbour` }))
    }
  }
  rows.push(muted(mm.pitch
    ? 'Each map is drawn in its own cell, 0 to the pitch each way. Two maps join where both have an open side along the same line -- the map editor shows its neighbours, and which sides meet.'
    : 'Without a pitch the grid only says which maps are near which, so the next one is in memory before a player gets there; each map keeps its own world.'))
  return rows
}

function cellTapped (x, y) {
  const mm = S.module.metamap
  mm.cells ??= {}
  const here = mapAt(mm, x, y)
  if (S.mmPicked) {
    const from = mm.cells[S.mmPicked]
    if (here && here !== S.mmPicked) { if (from) mm.cells[here] = from; else delete mm.cells[here] }
    mm.cells[S.mmPicked] = [x, y]
    S.mmPicked = null
    S.moduleChanged()
    showMaps()
    return
  }
  if (here) { S.mmPicked = here; showMaps(); return }
  // An empty cell, nothing in hand: a new map, there.
  ask('a new map in this cell (letters, digits, dashes)', `map${Object.keys(S.docs).length + 1}`).then((raw) => {
    const clean = String(raw ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '')
    if (!clean) return
    if (S.docs[clean]) { S.status('that name is taken', 'warn'); return }
    const doc = S.starterDoc(clean)
    // In a shared world a map is drawn inside its cell, 0 to the pitch.
    if (mm.pitch) shiftDoc(doc, Math.round(mm.pitch[0] / 2), Math.round(mm.pitch[1] / 2))
    S.docs[clean] = doc
    mm.cells[clean] = [x, y]
    S.moduleChanged()
    showMaps()
  })
}

/** Move everything in a map by whole units. */
function shiftDoc (doc, dx, dy) {
  for (const sid of doc.order) for (const v of doc.sectors[sid].verts) { v.x += dx; v.y += dy }
  for (const list of [doc.spawns, doc.lights, doc.entities]) for (const p of list ?? []) { p.x += dx; p.y += dy }
}

/** A pitch big enough for every map the module has, rounded up to 16. */
function suggestedPitch () {
  let w = 16; let h = 16
  for (const d of Object.values(S.docs)) {
    for (const sid of d.order) for (const v of d.sectors[sid].verts) { w = Math.max(w, v.x); h = Math.max(h, v.y) }
  }
  return [Math.ceil(w / 16) * 16, Math.ceil(h / 16) * 16]
}

/** Hand it the studio's state, and publish what others call. */
export function install (s) {
  S = s
  S.showMaps = S.sectionAlias('maps', showMaps)
}
