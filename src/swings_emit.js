//
// HOW A SWING LOOKS IN THE GAME (docs/SWINGS.md): the slash streak the client
// draws along every melee sweep, styled by assets/sprites/swings.json --
// a default, then one per weapon by name and one per monster by catalogue
// name. The module keeps it as module.swings = { default, weapons, monsters },
// each entry partial; written only when something is set, so a module that
// says nothing gets the engine's own look.
//
// Pure: the test reads what this writes with the client's own parser
// (engine/client/src/render/slash.js parseSwingStyles).
//

/** The engine's look, the base every entry fills over (slash.js DEFAULT_SLASH). */
export const SLASH_DEFAULT = Object.freeze({ show: true, color: '#fff2c8', opacity: 0.6, fade: 0.22, width: 0.4, blend: 'add', texture: null })

/** The fields, in the order the forms show them, with their ranges. */
export const SLASH_FIELDS = [
  { name: 'show', type: 'bool', doc: 'Off: this swing is not drawn at all (the collider still hits).' },
  { name: 'color', type: 'color', doc: 'The streak\'s colour; with a texture, it tints the texture.' },
  { name: 'opacity', type: 'number', min: 0, max: 1, step: 0.05, doc: 'How solid a new piece of the streak is, 0 to 1.' },
  { name: 'fade', type: 'number', min: 0.02, max: 5, step: 0.02, doc: 'Seconds a piece takes to fade away.' },
  { name: 'width', type: 'number', min: 0.05, max: 1, step: 0.05, doc: 'How much of the swept region the band covers, from the tip inward: 1 is all of it, 0.4 the outer 40%.' },
  { name: 'blend', type: 'choice', options: ['add', 'normal'], doc: 'add: a glow that lightens what is behind it. normal: painted over it.' },
  { name: 'texture', type: 'texture', doc: 'A picture under sprites/ (.png or .webp), stretched along the sweep and across the band; none for a plain band.' }
]

/** The module's swing looks, made if absent. */
export function swingsOf (module) {
  module.swings ??= {}
  module.swings.weapons ??= {}
  module.swings.monsters ??= {}
  return module.swings
}

/**
 * The entry a form edits: 'default', or a weapon's or a monster's by name.
 * Made on first edit (`make`), else null when it has none.
 */
export function slashEntry (module, scope, name = null, { make = false } = {}) {
  const sw = make ? swingsOf(module) : module.swings
  if (!sw) return null
  if (scope === 'default') return sw.default ?? (make ? (sw.default = {}) : null)
  const group = scope === 'weapon' ? 'weapons' : 'monsters'
  if (!sw[group]) return null
  return sw[group][name] ?? (make ? (sw[group][name] = {}) : null)
}

/** What a swing in `scope` actually looks like: the engine's, the default, then its own. */
export function slashLook (module, scope, name = null) {
  const sw = module.swings ?? {}
  const own = scope === 'weapon' ? sw.weapons?.[name] : scope === 'monster' ? sw.monsters?.[name] : null
  return { ...SLASH_DEFAULT, ...(sw.default ?? {}), ...(own ?? {}) }
}

/** Forget an entry that holds nothing, so the file stays what was meant. */
export function tidySwings (module) {
  const sw = module.swings
  if (!sw) return
  if (sw.default && !Object.keys(sw.default).length) delete sw.default
  for (const g of ['weapons', 'monsters']) {
    for (const [k, v] of Object.entries(sw[g] ?? {})) if (!v || !Object.keys(v).length) delete sw[g][k]
    if (sw[g] && !Object.keys(sw[g]).length) delete sw[g]
  }
  if (!Object.keys(sw).length) delete module.swings
}

/** assets/sprites/swings.json, or null when the module says nothing about its swings. */
export function swingsJson (module) {
  const sw = module.swings
  if (!sw) return null
  const clean = (e) => {
    const out = {}
    for (const f of SLASH_FIELDS) if (e?.[f.name] !== undefined) out[f.name] = e[f.name]
    return out
  }
  const out = { version: 1 }
  if (sw.default && Object.keys(clean(sw.default)).length) out.default = clean(sw.default)
  for (const g of ['weapons', 'monsters']) {
    const entries = Object.entries(sw[g] ?? {}).map(([k, v]) => [k, clean(v)]).filter(([, v]) => Object.keys(v).length)
    if (entries.length) out[g] = Object.fromEntries(entries)
  }
  return Object.keys(out).length > 1 ? JSON.stringify(out, null, 1) : null
}
