//
// Sector effects: rain, snow, dust, embers and volumetric fog (docs/SECTOR_FX.md).
//
// A sector in the document carries `fx: [{ kind, params: { key: value } }]`,
// and mapfmt.emitMap writes each as an `fx <kind> key value ...` line right
// after the sector's head. A key left out takes the kind's default.
//
// THE TABLE IS THE ENGINE'S. Kinds, keys, which kind takes which key and every
// default live in engine/core/include/dnp/geom/sector_fx.hpp, and mapc parses
// against it. The studio keeps only the five kind names (mapc refuses any
// other, so a stale one is a bake error, not a silent difference) and learns
// the rest by baking a probe map with one effect of each kind and reading it
// back through the client's own readEffects -- the same numbers the game draws.
//
import { el, row, button, muted, chips, select, withIcon, icon } from './ui.js'
import { newDoc, addSector, addSpawn, FX_KIND_NAMES, CAP } from './doc.js'
import { normalize, derive } from './topology.js'
import { emitMap, fxWord } from './mapfmt.js'
import { readEffects } from '/src/mapdata.js'

export const FX_KINDS = FX_KIND_NAMES
export const MAX_MAP_FX = CAP.effects
// Each weather's icon: the catalog's weather.<kind>.
const ICON = (kind) => `weather.${kind}`

/**
 * Every kind's keys and defaults, from the engine: { rain: { density: 8, ... }, ... }.
 * Colours come back as 0xRRGGBB numbers; `top` -1 means the ceiling.
 */
export async function fxSchema ({ core, bake }) {
  const doc = newDoc('fxprobe')
  const s = addSector(doc, [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }], { floor: 0, ceil: 4 })
  addSpawn(doc, 'start', 2, 2)
  s.fx = FX_KINDS.map((kind) => ({ kind, params: {} }))
  normalize(doc)
  const { text } = emitMap(derive(doc), doc)
  const r = await bake({ mapPath: 'modules/probe/maps/fxprobe.map', mapText: text, files: {} })
  if (!r.ok) throw new Error(`the effects probe did not bake: ${r.errors.map((e) => e.msg).join('; ')}`)
  const loaded = core.loadMap(r.dnpm)
  const out = {}
  for (const e of readEffects(loaded.map)) out[FX_KINDS[e.kind - 1]] = e.params
  return out
}

/**
 * The inspector's section for one sector.
 * @param schema  fxSchema's result, or null while it loads
 */
export function fxRows (s, schema, ctx) {
  const rows = [el('div', { class: 'st-section-head', text: '🌦 weather and fog' })]
  // A change that adds or removes a row redraws the sheet; a value does not.
  const again = () => { ctx.commit(); ctx.refreshSheet?.() }
  s.fx ??= []
  s.fx.forEach((e, i) => {
    const defaults = schema?.[e.kind] ?? {}
    const body = [el('div', { class: 'st-row' }, [
      el('span', { class: 'st-entry' }, withIcon(ICON(e.kind), e.kind)),
      button(withIcon('action.close'), () => { s.fx.splice(i, 1); if (!s.fx.length) delete s.fx; again() })
    ])]
    for (const [key, def] of Object.entries(defaults)) {
      const has = key in (e.params ?? {})
      const set = (v) => {
        e.params ??= {}
        const was = key in e.params
        if (v === null) delete e.params[key]; else e.params[key] = v
        // Set or cleared changes the row (its • and ↺), so draw it again.
        if (was !== (key in e.params)) again(); else ctx.commit()
      }
      let input
      if (key === 'color') {
        input = el('input', { type: 'color', value: `#${fxWord('color', has ? e.params[key] : def)}` })
        // up its panel first, so the picker has room below it (the fog's opened off the window)
        input.addEventListener('pointerdown', () => { try { input.scrollIntoView({ block: 'start', behavior: 'instant' }) } catch {} })
        input.addEventListener('change', () => set(input.value.slice(1)))
      } else {
        const shown = key === 'top' && def < 0 ? 'ceiling' : String(Number(def.toFixed(4)))
        input = el('input', { type: 'number', step: 'any', value: has ? e.params[key] : '', placeholder: shown })
        input.addEventListener('change', () => {
          if (input.value === '') { set(null); return }
          const v = Number(input.value)
          if (Number.isFinite(v)) set(v)
        })
      }
      body.push(row(has ? `${key} •` : key, input, has ? button(withIcon('action.reset'), () => set(null)) : null))
    }
    if (!schema) body.push(muted('reading the defaults from the engine…'))
    rows.push(el('div', { class: 'st-card', 'data-fx': e.kind }, body))
  })
  rows.push(chips(FX_KINDS.map((k) => ({ id: k, icon: ICON(k), label: `+ ${k}` })), (it) => {
    s.fx.push({ kind: it.id, params: {} })
    again()
  }))
  rows.push(muted('Drawn by the client only: nothing in the game reads them. An empty field is the engine\'s default, shown greyed; • marks a value set here. Distances are units above the floor; fog density is how quickly it hides things.'))
  return rows
}
