//
// The form for how a swing looks in the game (swings_emit.js, docs/SWINGS.md):
// in the Monsters and Weapons workshops for one monster's or weapon's
// swing, and in the Player workshop for the default every swing starts from
// (which is also how other players' swings look -- the client does not know
// what they hold).
//
// Each field shows what the swing looks like now -- the engine's look, the
// module's default, its own -- and an edit sets it here alone.
//
import { el, row, slider, select, toggle, muted, button, withIcon, addHelp } from './ui.js'
import { SLASH_FIELDS, slashEntry, slashLook, tidySwings } from './swings_emit.js'

const WHAT = {
  default: 'The look every swing starts from: each weapon\'s and monster\'s fills over it. Other players\' swings use it as it is.',
  weapon: 'How this weapon\'s swing is drawn in the game, over the default look (Player → slash).',
  monster: 'How this monster\'s swing is drawn in the game, over the default look (Player → slash).'
}

/**
 * Rows for one look. `scope` is 'default', 'weapon' or 'monster'; `name`
 * the weapon's or monster's; `changed` saves the module and redraws.
 */
export function slashRows (S, scope, name, changed) {
  const m = S.module
  const own = slashEntry(m, scope, name) ?? {}
  const look = slashLook(m, scope, name)
  const set = (field) => (v) => { slashEntry(m, scope, name, { make: true })[field] = v; tidySwings(m); changed() }
  const mark = (field) => (own[field] !== undefined ? ' (own)' : '')
  const pictures = Object.keys(S.rec?.assets ?? {}).filter((p) => /^sprites\/.+\.(png|webp)$/i.test(p)).map((p) => p.slice('sprites/'.length))
  const rows = [el('div', { class: 'st-section-head', icon: 'workshop.swing', text: ' how it looks in the game' }), muted(WHAT[scope])]
  for (const f of SLASH_FIELDS) {
    const label = `${f.name}${mark(f.name)}`
    let r
    if (f.type === 'bool') r = toggle(label, look[f.name] !== false, set(f.name))
    else if (f.type === 'number') r = slider(label, look[f.name], f, (v, done) => { if (done) set(f.name)(v) })
    else if (f.type === 'choice') r = select(label, look[f.name], f.options, set(f.name))
    else if (f.type === 'color') {
      r = row(label, el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(look.color) ? look.color : '#fff2c8', onchange: (e) => set('color')(e.target.value) }))
    } else if (f.type === 'texture') {
      const opts = [['', '(none: a plain band)'], ...pictures.map((p) => [p, p])]
      if (look.texture && !pictures.includes(look.texture)) opts.push([look.texture, `${look.texture} (not in this module)`])
      r = select(label, look.texture ?? '', opts, (v) => set('texture')(v || null))
    }
    rows.push(addHelp(r, f.doc))
  }
  if (Object.keys(own).length) {
    rows.push(muted(scope === 'default' ? '(own): set for every swing in this module.' : `(own): set for this ${scope}; the rest comes from the default.`))
    rows.push(button(withIcon('action.reset', scope === 'default' ? 'back to the engine\'s look' : 'back to the default look'), () => {
      const g = m.swings
      if (scope === 'default') delete g.default
      else delete g[scope === 'weapon' ? 'weapons' : 'monsters'][name]
      tidySwings(m); changed()
    }))
  }
  return rows
}
