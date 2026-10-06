//
// What the sheet shows for whatever was tapped, and the pickers behind it.
//
// Every control writes straight into the document and then calls
// `ctx.commit()` (an undo step, a save, a bake) or `ctx.preview()` (a bake
// only, while a slider is still moving). There is no model of its own here:
// the document is the model and the sheet is a view of it.
//
import { fxRows } from './fxlib.js'
import { el, row, slider, number, text, toggle, select, button, tiles, chips, card, muted } from './ui.js'
import { EDGE_FLAGS, removeSector, newId, newEdge, newStyle } from './doc.js'
import { findEdge } from './doc.js'
import { twinEdge } from './presets.js'
import { climbSides, climbSays } from './climb.js'

const TEX_NONE = '(none)'

/** The inspector body for a selection, or null when nothing is selected. */
export function inspector (sel, doc, ctx) {
  if (!sel) return null
  switch (sel.kind) {
    case 'sector': return sectorForm(doc.sectors[sel.id], doc, ctx)
    case 'edge': return edgeForm(sel, doc, ctx)
    case 'vertex': return vertexForm(sel, doc, ctx)
    case 'entity': return entityForm(doc.entities.find((e) => e.id === sel.id), doc, ctx)
    case 'spawn': return spawnForm(doc.spawns.find((e) => e.id === sel.id), doc, ctx)
    case 'light': return lightForm(doc.lights.find((e) => e.id === sel.id), doc, ctx)
    default: return null
  }
}

export function titleFor (sel, doc) {
  if (!sel) return ''
  switch (sel.kind) {
    case 'sector': return `Sector ${sel.id}`
    case 'edge': return `Wall ${sel.id} of ${sel.sectorId ?? findEdge(doc, sel.id)?.sector.id ?? ''}`
    case 'vertex': return `Corner ${sel.id}`
    case 'entity': { const e = doc.entities.find((x) => x.id === sel.id); return `${e?.kind === 'mob' ? 'Monster' : 'Prop'} ${e?.name ?? ''}` }
    case 'spawn': return 'Spawn'
    case 'light': return 'Light'
    default: return ''
  }
}

function texButton (label, value, ctx, onPick) {
  const b = button(value || TEX_NONE, () => ctx.pickTexture(value, (name) => { b.textContent = name || TEX_NONE; onPick(name) }))
  b.style.flex = '1 1 auto'
  b.style.textAlign = 'left'
  return row(label, b)
}

/**
 * How a surface is painted, and whether you can see through it.
 *
 * A flat's texture is projected straight down from WORLD coordinates, so
 * neighbouring floors line up instead of each restarting at its own origin.
 * These sit on top of that: the angle turns the pattern, the offsets slide it
 * in world units (the same distance whatever the scale), and the scale is how
 * many times LARGER the tile is drawn.
 */
function styleRows (label, owner, key, ctx) {
  owner[key] ??= newStyle()
  const st = owner[key]
  const rows = [el('div', { class: 'st-section-head', text: `▦ ${label} pattern` })]
  rows.push(slider('turn (°)', st.angle ?? 0, { min: 0, max: 360, step: 5 }, (v, done) => { st.angle = v; done ? ctx.commit() : ctx.preview() }))
  rows.push(number('shift x', st.offX ?? 0, { min: -64, max: 64, step: 0.25 }, (v) => { st.offX = v; ctx.commit() }))
  rows.push(number('shift y', st.offY ?? 0, { min: -64, max: 64, step: 0.25 }, (v) => { st.offY = v; ctx.commit() }))
  rows.push(slider('size', st.scale ?? 1, { min: 0.125, max: 8, step: 0.125 }, (v, done) => { st.scale = v > 0 ? v : 1; done ? ctx.commit() : ctx.preview() }))
  rows.push(select('painted in', st.anchor ?? 'world',
                   [['world', "the world: patterns line up across sectors"], ['sector', 'the sector: the pattern rides it when it moves']],
                   (v) => { st.anchor = v; ctx.commit() }))
  rows.push(...alphaRows(st, ctx, `${label} is`))
  return rows
}

/**
 * The transparency toggle, and the number behind it.
 *
 * Opt-in per surface and deliberately so: an opaque surface keeps early-z and
 * needs no depth sort, so a map with nothing see-through pays for none of it.
 * 254 rather than "a bit less than 255" because that is the useful case -- it
 * lets the picture's OWN transparent pixels through, which is how a grate or a
 * fence is made; a lower number is a sheet of glass.
 */
function alphaRows (owner, ctx, what = 'this is') {
  const on = (owner.alpha ?? 255) < 255
  const rows = [toggle('see-through', on, (v) => { owner.alpha = v ? 254 : 255; ctx.commit(); ctx.refreshSheet?.() })]
  if (on) {
    rows.push(slider('opacity', owner.alpha ?? 254, { min: 0, max: 255, step: 1 }, (v, done) => { owner.alpha = Math.round(v); done ? ctx.commit() : ctx.preview() }))
    rows.push(muted(`254 shows the picture's own holes -- a grate, a fence. Lower is glass you see the room through. ${what} still solid to walk on: transparency is drawn, never simulated.`))
  }
  return rows
}

/** How this side meets the next map on the metamap, when it does. */
function seamRows (sm) {
  if (!sm) return []
  const say = {
    joined: `✔ joins ${sm.with}: both sides are open, so the engine stitches them and you walk across.`,
    'one-way': `◐ meets ${sm.with}, but only one of the two sides is open: they will not join. Open both.`,
    walls: `▭ meets ${sm.with} along the same line, closed. Open this side and theirs to walk across.`,
    loose: '○ open, and no neighbour meets it: a drop off the edge of the world.'
  }
  return [el('div', { class: sm.state === 'joined' ? 'st-muted' : 'st-warn-box', text: say[sm.state] })]
}

/** What is wrong with this room, said first: the reason it is marked on the map. */
function problemRows (list) {
  return list.map((p) => el('div', { class: p.level === 'warn' ? 'st-warn-box' : 'st-danger st-problem', text: `${p.level === 'warn' ? '⚠' : '✖'} ${p.msg}` }))
}

function sectorForm (s, doc, ctx) {
  const range = { min: -32, max: 64, step: 0.25 }
  const body = [
    ...problemRows(ctx.problems?.(s.id) ?? []),
    slider('floor', s.floor, range, (v, done) => { s.floor = v; if (s.ceil <= v) s.ceil = v + 0.25; done ? ctx.commit() : ctx.preview() }),
    slider('ceiling', s.ceil, range, (v, done) => { s.ceil = v; if (s.floor >= v) s.floor = v - 0.25; done ? ctx.commit() : ctx.preview() }),
    slider('light', s.light, { min: 0, max: 255, step: 1 }, (v, done) => { s.light = v; done ? ctx.commit() : ctx.preview() }),
    slider('thickness', s.thickness, { min: 0, max: 16, step: 0.25 }, (v, done) => { s.thickness = v; done ? ctx.commit() : ctx.preview() }),
    texButton('floor tex', s.floorTex, ctx, (n) => { s.floorTex = n; ctx.commit() }),
    texButton('ceiling tex', s.ceilTex, ctx, (n) => { s.ceilTex = n; ctx.commit() }),
    // OPEN TO THE SKY (docs/SKY.md): DOOM's sky flat, F_SKY1, is a window onto
    // the level's sky; the texture it replaced is kept to go back to.
    toggle('ceiling open to the sky', /^F_SKY/i.test(s.ceilTex ?? ''), (v) => {
      if (v) { s.ceilWas = s.ceilTex; s.ceilTex = 'F_SKY1' } else { s.ceilTex = s.ceilWas ?? s.floorTex; delete s.ceilWas }
      ctx.commit()
    }),
    // Every wall of the sector at once, one field at a time. The same three
    // fields a single wall has, so a room is textured without tapping each
    // side -- and `(none)` clears a field just as it does on one wall.
    ...['middle', 'upper', 'lower'].map((field) =>
      texButton(`all ${field}s`, null, ctx, (n) => { for (const v of s.verts) v.edge[field] = n; ctx.commit() })),
    muted('Upper and lower are the bands a wall shows only where another room is behind it: above that room\'s ceiling, and below its floor.'),
    select('edges', s.kind, [['auto', 'room: walls (by floor height inside another)'], ['platform', 'floating platform: open edges, fall off'], ['cut', 'cut into the floor of the room around it']],
           (v) => { s.kind = v; ctx.commit() }),
    ...styleRows('floor', s, 'floorStyle', ctx),
    ...styleRows('ceiling', s, 'ceilStyle', ctx),
    ...fxRows(s, ctx.fxSchema?.() ?? null, ctx),
    number('tag', s.tag, { min: 0, max: 65535, step: 1 }, (v) => { s.tag = Math.round(v); ctx.commit() }),
    el('div', { class: 'st-row' }, [
      button('duplicate', () => { ctx.duplicateSector(s.id) }),
      button('delete', () => { removeSector(doc, s.id); ctx.select(null); ctx.commit() }, 'st-danger')
    ]),
    muted('Drag a corner to reshape. Tap a wall for its textures and flags. Long-press a corner to remove it.')
  ]
  return body
}

/** What a climbable side climbs, by the engine's rule; a flag on the wrong side of a step offered across. */
function climbRows (doc, e, edge, twin, ctx) {
  if (!edge.flags.climbable) return []
  const c = climbSides(doc).find((x) => x.edge === edge && x.sector === e.sector.id) ?? climbSides(doc).find((x) => x.edge === edge)
  if (!c) return []
  const bad = c.kind === 'low' || c.kind === 'down' || c.kind === 'open'
  const rows = [el('div', { class: bad ? 'st-danger' : 'st-muted', 'data-climb': c.kind, text: `🧗 ${climbSays(c)}` })]
  if (c.kind === 'down' && twin) {
    rows.push(button('move climbable to the lower side', () => { edge.flags.climbable = false; twin.flags.climbable = true; ctx.commit(); ctx.refreshSheet?.() }))
  }
  return rows
}

function edgeForm (sel, doc, ctx) {
  const e = findEdge(doc, sel.id)
  if (!e) return null
  const edge = e.edge
  const twin = twinEdge(doc, edge.id)
  const flagChips = () => chips(EDGE_FLAGS.map((f) => ({ id: f, label: f, on: !!edge.flags[f] })),
                                 (it) => { edge.flags[it.id] = !edge.flags[it.id]; ctx.commit(); ctx.refreshSheet() })
  const other = ctx.otherSide?.(edge.id) ?? null
  return [
    // A complaint that named this wall, and the room's own.
    ...problemRows((ctx.problems?.(e.sector.id) ?? []).filter((p) => !p.edge || p.edge === edge.id)),
    muted(twin ? `This is sector ${e.sector.id}'s side, shared with sector ${findEdge(doc, twin.id).sector.id}: passable unless forced to a wall. Tap the wall again for the other side.` : `An outer wall of sector ${e.sector.id}.`),
    other ? button(`select the other side (sector ${other.sectorId})`, () => ctx.select(other)) : null,
    texButton('middle', edge.middle, ctx, (n) => { edge.middle = n; ctx.commit() }),
    texButton('upper', edge.upper, ctx, (n) => { edge.upper = n; ctx.commit() }),
    texButton('lower', edge.lower, ctx, (n) => { edge.lower = n; ctx.commit() }),
    twin ? toggle('force wall', edge.force === 'wall', (v) => { edge.force = v ? 'wall' : null; ctx.commit() }) : null,
    // An outer side OPEN: the room simply ends there, and on a metamap with a
    // pitch it is where the next map joins on -- if that map's side is open too.
    !twin ? toggle('open: the room ends here (to the next map)', edge.force === 'open', (v) => { edge.force = v ? 'open' : null; ctx.commit(); ctx.refreshSheet?.() }) : null,
    !twin && edge.force === 'open' ? muted('Open sides join a neighbouring map on the metamap where both are open along the same line, in the world. Elsewhere it is a drop off the edge.') : null,
    ...seamRows(ctx.seamFor?.(edge.id)),
    row('flags', flagChips()),
    ...climbRows(doc, e, edge, twin, ctx),
    ...alphaRows(edge, ctx, 'the wall is'),
    number('x offset', edge.xoff, { min: -64, max: 64, step: 0.125 }, (v) => { edge.xoff = v; ctx.commit() }),
    number('y offset', edge.yoff, { min: -64, max: 64, step: 0.125 }, (v) => { edge.yoff = v; ctx.commit() }),
    toggle('unpeg upper', edge.unpegUpper, (v) => { edge.unpegUpper = v; ctx.commit() }),
    toggle('unpeg lower', edge.unpegLower, (v) => { edge.unpegLower = v; ctx.commit() }),
    el('div', { class: 'st-row' }, [
      button('split wall', () => { splitEdge(doc, e); ctx.commit() }),
      button('select sector', () => ctx.select({ kind: 'sector', id: e.sector.id }))
    ])
  ]
}

/** Insert a corner at the middle of an edge, so a switch or a door can sit on half a wall. */
export function splitEdge (doc, e) {
  const s = e.sector
  const q = s.verts[(e.i + 1) % s.verts.length]
  const mx = (e.vert.x + q.x) / 2
  const my = (e.vert.y + q.y) / 2
  const { id: _cut, ...attrs } = e.edge
  s.verts.splice(e.i + 1, 0, { id: newId(doc, 'v'), x: mx, y: my, edge: newEdge(doc, { ...attrs, flags: { ...e.edge.flags } }) })
}

function vertexForm (sel, doc, ctx) {
  const s = doc.sectors[sel.sectorId]
  const v = s?.verts.find((x) => x.id === sel.id)
  if (!v) return null
  return [
    number('x', v.x, { min: -256, max: 256, step: doc.grid }, (n) => { v.x = n; ctx.commit() }),
    number('y', v.y, { min: -256, max: 256, step: doc.grid }, (n) => { v.y = n; ctx.commit() }),
    el('div', { class: 'st-row' }, [
      button('remove corner', () => {
        if (s.verts.length <= 3) { ctx.status('a sector needs three corners', 'warn'); return }
        s.verts = s.verts.filter((x) => x.id !== v.id)
        ctx.select({ kind: 'sector', id: s.id }); ctx.commit()
      }, 'st-danger'),
      button('select sector', () => ctx.select({ kind: 'sector', id: s.id }))
    ])
  ]
}

function entityForm (e, doc, ctx) {
  if (!e) return null
  return [
    text('name', e.name, (v) => { e.name = v.trim(); ctx.commit() }),
    select('kind', e.kind, [['mob', 'monster'], ['prop', 'prop']], (v) => { e.kind = v; ctx.commit() }),
    e.kind === 'mob' ? toggle('dormant', e.dormant, (v) => { e.dormant = v; ctx.commit() }) : null,
    number('height', e.z, { min: -32, max: 64, step: 0.25 }, (v) => { e.z = v; ctx.commit() }),
    e.kind === 'prop' && ctx.editProp ? button('edit this prop…', () => ctx.editProp(e.name)) : null,
    button('delete', () => { doc.entities = doc.entities.filter((x) => x.id !== e.id); ctx.select(null); ctx.commit() }, 'st-danger')
  ]
}

function spawnForm (p, doc, ctx) {
  if (!p) return null
  return [
    text('tag', p.tag, (v) => { p.tag = v.trim() || 'start'; ctx.commit() }),
    number('height', p.z, { min: -32, max: 64, step: 0.25 }, (v) => { p.z = v; ctx.commit() }),
    muted("The server spawns players at the tag 'start'. Other tags are for teleports and scripts."),
    button('delete', () => { doc.spawns = doc.spawns.filter((x) => x.id !== p.id); ctx.select(null); ctx.commit() }, 'st-danger')
  ]
}

function lightForm (l, doc, ctx) {
  if (!l) return null
  const hex = `#${[l.r, l.g, l.b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
  const color = el('input', { type: 'color', value: hex })
  color.style.height = '40px'
  color.addEventListener('change', () => {
    const v = color.value
    l.r = parseInt(v.slice(1, 3), 16); l.g = parseInt(v.slice(3, 5), 16); l.b = parseInt(v.slice(5, 7), 16)
    ctx.commit()
  })
  return [
    row('colour', color),
    slider('radius', l.radius, { min: 1, max: 48, step: 0.5 }, (v, done) => { l.radius = v; done ? ctx.commit() : ctx.preview() }),
    slider('intensity', l.intensity, { min: 0, max: 4, step: 0.125 }, (v, done) => { l.intensity = v; done ? ctx.commit() : ctx.preview() }),
    number('height', l.z, { min: -32, max: 64, step: 0.25 }, (v) => { l.z = v; ctx.commit() }),
    button('delete', () => { doc.lights = doc.lights.filter((x) => x.id !== l.id); ctx.select(null); ctx.commit() }, 'st-danger')
  ]
}

// --- pickers -----------------------------------------------------------------------

/** A grid of every texture the app can serve, plus the module's own. */
export function texturePicker (names, current, onPick, { imageFor, sheetOf = () => null }) {
  const search = el('input', { type: 'text', placeholder: 'filter' })
  const grid = el('div')
  const draw = () => {
    const q = search.value.trim().toUpperCase()
    const items = [{ id: null, label: TEX_NONE, on: !current }]
    for (const n of names) if (!q || n.includes(q)) items.push({ id: n, label: n, image: imageFor(n), sheet: sheetOf(n), on: n === current })
    grid.replaceChildren(tiles(items.slice(0, 400), (it) => onPick(it.id)))
  }
  search.addEventListener('input', draw)
  draw()
  return [row('find', search), grid]
}

/**
 * What can be placed: monsters the module defines, props the catalogue has,
 * a spawn point, a light. Returns the sheet body; `onArm(kind, name)` arms
 * the place tool.
 */
export function placePalette ({ mobs, props, armed }, onArm, onEditProps = null) {
  const item = (kind, name, label = name) => ({ id: `${kind}:${name}`, kind, name, label, on: armed && armed.kind === kind && armed.name === name })
  const list = [
    item('spawn', 'start', 'spawn: start'),
    item('light', 'light', 'light'),
    ...mobs.map((m) => item('mob', m)),
    ...props.map((p) => item('prop', p))
  ]
  return [
    muted('Tap one, then tap the floor to place it. Tap it again to stop placing.'),
    chips(list, (it) => onArm(it.on ? null : { kind: it.kind, name: it.name })),
    onEditProps ? button('✎ props…', onEditProps) : null
  ]
}
