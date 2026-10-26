//
// Props: bodies without a brain. A barrel, a torch, a tree -- a size the
// server stops the player against (or not), a picture the client draws, and
// nothing that thinks. The catalogue record is the same one a monster's body
// uses (props_emit.js, docs/MOBS.md); what differs is that a prop is authored
// from a sheet of its own instead of the workshop.
//
// The model half is pure and the test loads it under Node; the form half is
// DOM, built from ui.js like every other sheet. Nothing here knows a sheet.
//
import { el, row, text, toggle, select, button, chips, muted, number } from './ui.js'
import { nextPropId } from './props_emit.js'

export function cleanName (raw) { return String(raw ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '') }

/** The module's bodies that no brain uses: the props. */
export function moduleProps (module) {
  const bodies = new Set(Object.entries(module.mobs?.mobs ?? {}).map(([name, m]) => m.prop ?? name))
  return (module.props ?? []).filter((p) => !bodies.has(p.name))
}

/** A new prop: a body, no picture yet. Returns its name, or null when the name is empty or taken. */
export function newProp (module, raw) {
  module.props ??= []
  const name = cleanName(raw)
  if (!name || module.props.some((p) => p.name === name)) return null
  module.props.push({ id: nextPropId(module), name, radius: 0.5, height: 1, solid: true, usable: false, art: null })
  return name
}

/** Where a prop stands across the module's maps: [{ doc, entity }]. */
export function placementsOf (docs, name) {
  const out = []
  for (const doc of Object.values(docs)) for (const e of doc.entities) if (e.kind === 'prop' && e.name === name) out.push({ doc, entity: e })
  return out
}

/** Removes the body and every placement of it. Returns how many placements went with it. */
export function deleteProp (module, docs, name) {
  module.props = (module.props ?? []).filter((p) => p.name !== name)
  let n = 0
  for (const doc of Object.values(docs)) {
    const before = doc.entities.length
    doc.entities = doc.entities.filter((e) => !(e.kind === 'prop' && e.name === name))
    n += before - doc.entities.length
  }
  return n
}

/** Renames the body and its placements. Returns the new name, or null when empty, unchanged or taken. */
export function renameProp (module, docs, from, raw) {
  const to = cleanName(raw)
  const p = (module.props ?? []).find((x) => x.name === from)
  if (!p || !to || to === from || module.props.some((x) => x.name === to)) return null
  p.name = to
  for (const { entity } of placementsOf(docs, from)) entity.name = to
  // EVERYTHING ELSE THAT NAMES IT, so a rename breaks nothing: a missile's or
  // monster's body (theirs by name when they say none), what a monster drops,
  // a step or condition about the nearest of it, the player, a trigger's
  // spawn_prop. (A recipe's missile drawn as a prop of its own lost its look.)
  const swap = (o, key) => {
    if (Array.isArray(o)) { for (const x of o) swap(x, key); return }
    if (!o || typeof o !== 'object') return
    if (o[key] === from) o[key] = to
    for (const v of Object.values(o)) if (v && typeof v === 'object') swap(v, key)
  }
  for (const [n, m] of Object.entries(module.mobs?.mobs ?? {})) {
    if ((m.prop ?? n) === from) m.prop = to
    swap(m.drops, 'item')
    swap(m.states, 'prop')
    swap(m.any, 'prop')
  }
  for (const [n, m] of Object.entries(module.mobs?.missiles ?? {})) if ((m.prop ?? n) === from) m.prop = to
  if (module.player?.prop === from) module.player.prop = to
  for (const doc of Object.values(docs)) for (const t of doc.triggers ?? []) for (const a of t.actions ?? []) if (a.a === 'spawn_prop' && a.name === from) a.name = to
  return to
}

// The picture, in the two shapes props_emit writes: a sheet's animation, or
// one image standing as tall as the body.
export function artFromSheet (module, sheet) {
  const anims = module.sprites?.[sheet]?.animations ?? []
  return { kind: 'atlas', sheet, states: { 0: anims[0] ?? '' } }
}
export function artFromPicture (name, height) {
  return { kind: 'sprite', size: height, billboard: true, states: [{ state: 0, frames: [name] }] }
}

/**
 * The form for one prop. `ctx`:
 *   pictures: [name]            single images the module holds
 *   sheets: [name]              the module's sheets
 *   placements: n
 *   pictureUrl(name)            -> url | null
 *   sheetFrame(sheet, anim)     -> { url, rect: { x, y, w, h } } | null, the first frame
 *   importPicture(), importSheet()  -> name | null
 *   rename(raw), remove(), place(), changed()
 */
export function propRows (module, p, ctx) {
  const art = p.art
  const pickPicture = (name) => { p.art = artFromPicture(name, p.height); ctx.changed() }
  const pickSheet = (name) => { p.art = artFromSheet(module, name); ctx.changed() }
  return [
    thumb(p, ctx),
    text('name', p.name, (v) => ctx.rename(v)),
    number('radius', p.radius, { min: 0.1, max: 4, step: 0.05 }, (v) => { p.radius = v; ctx.changed() }),
    number('height', p.height, { min: 0.1, max: 8, step: 0.05 }, (v) => { p.height = v; if (p.art?.kind === 'sprite') p.art.size = v; ctx.changed() }),
    number('scale', p.scale ?? 1, { min: 0.1, max: 8, step: 0.05 }, (v) => { p.scale = v; ctx.changed() }),
    toggle('solid', !!p.solid, (v) => { p.solid = v; ctx.changed() }),
    toggle('usable', !!p.usable, (v) => { p.usable = v; ctx.changed() }),
    toggle('its own light (not lit)', !!p.bright, (v) => { if (v) p.bright = true; else delete p.bright; ctx.changed() }),
    row('picture', chips([
      ...ctx.pictures.map((n) => ({ id: `pic:${n}`, label: n, on: art?.kind === 'sprite' && art.states?.[0]?.frames?.[0] === n })),
      ...ctx.sheets.map((n) => ({ id: `sheet:${n}`, label: `${n} (sheet)`, on: art?.kind === 'atlas' && art.sheet === n })),
      { id: '+pic', label: '+ picture (PNG)…' },
      { id: '+sheet', label: '+ sheet…' }
    ], async (it) => {
      if (it.id === '+pic') { const n = await ctx.importPicture(); if (n) pickPicture(n); else ctx.changed(); return }
      if (it.id === '+sheet') { const n = await ctx.importSheet(); if (n) pickSheet(n); else ctx.changed(); return }
      if (it.id.startsWith('pic:')) pickPicture(it.id.slice(4)); else pickSheet(it.id.slice(6))
    })),
    art?.kind === 'atlas'
      ? select('animation', art.states?.[0] ?? '', [['', '(choose)'], ...(module.sprites?.[art.sheet]?.animations ?? [])], (v) => { art.states[0] = v; ctx.changed() })
      : null,
    art?.kind === 'sprite' ? toggle('faces the camera', art.billboard !== false, (v) => { art.billboard = v; ctx.changed() }) : null,
    art ? muted('A single picture stands as tall as the body; a sheet is drawn at its own height. scale multiplies either; the body it collides as stays height and radius.') : muted('No picture yet: the game walks around it all the same, and draws nothing.'),
    muted(`Prop id ${p.id}. Placed ${ctx.placements} time(s) across the module's maps.`),
    el('div', { class: 'st-row' }, [
      button('place it', ctx.place),
      button('delete', ctx.remove, 'st-danger')
    ])
  ]
}

/** The prop's first frame, small. */
function thumb (p, ctx) {
  const box = el('div', { class: 'st-thumb' })
  const art = p.art
  if (art?.kind === 'sprite') {
    const url = ctx.pictureUrl(art.states?.[0]?.frames?.[0])
    if (url) box.appendChild(el('img', { src: url, alt: p.name }))
  } else if (art?.kind === 'atlas') {
    const f = ctx.sheetFrame(art.sheet, art.states?.[0])
    if (f) {
      const c = el('canvas', { width: 96, height: 96 })
      const img = new Image()
      img.onload = () => {
        const s = Math.min(96 / f.rect.w, 96 / f.rect.h)
        const g = c.getContext('2d')
        g.imageSmoothingEnabled = false
        g.drawImage(img, f.rect.x, f.rect.y, f.rect.w, f.rect.h, (96 - f.rect.w * s) / 2, 96 - f.rect.h * s, f.rect.w * s, f.rect.h * s)
      }
      img.src = f.url
      box.appendChild(c)
    }
  }
  if (!box.childElementCount) box.textContent = '?'
  return box
}
