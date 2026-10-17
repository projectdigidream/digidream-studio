//
// THE MODULE'S MARKERS (docs/MARKERS.md): small UI hung on things in the world
// -- a bar over a monster, a sign over a door. Their looks are templates in the
// UI layout's `markers` section; four are built into the client and a layout
// may replace them by name. This knows their names, who hangs each one, what
// hangs a template the module does not have, and how a rename follows them.
//
// Hung by:
//   a monster     its `health_bar` (mobs.lua keeps `value` and `max` current)
//   a graph       its `mark` nodes (`template`)
//   a map sign    an entity of kind `sign`, its `name` the template, hung on
//                 its place by the level's script as it loads (lua_emit.js)
//   a script      `dnp.mark(on, 'template', ...)` -- found by reading the text
//
// Pure: the test runs it in Node.
//

/** The client's own templates (client/src/render/layout.js DEFAULT_MARKERS), always there. */
export const BUILTIN_MARKERS = ['health', 'label', 'marker', 'debug_health']
/** What each built-in shows, in words. */
export const BUILTIN_NOTES = {
  health: 'a bar, green, then amber below half, red below a quarter (value, max)',
  label: 'a line of text on a dark box (text)',
  marker: 'a pointer, with a line of text over it (text)',
  debug_health: 'the debug overlay\'s value/max counter (value, max)'
}
export const NAME_RE = /^[a-z0-9_]{1,24}$/
/** The entity kind of a sign placed on a map. */
export const SIGN = 'sign'

export const cleanMarkerName = (raw) => String(raw ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '').slice(0, 24)

/** The templates a layout offers: its own, then the built-ins it has not replaced. */
export function markerNames (layout) {
  const own = Object.keys(layout?.markers ?? {})
  return [...own, ...BUILTIN_MARKERS.filter((n) => !own.includes(n))]
}

/** A template to start from: a line of text, centred over the point. */
export function newMarker () {
  return { w: 140, h: 22, elements: [{ id: 'text', type: 'text', anchor: 'b', text: '{text}', style: { size: 12, align: 'center' } }] }
}

/** The values a template reads ({name} in its texts, its bindings): what a sample should fill. */
export function markerBindings (t) {
  const out = new Set()
  const walk = (list) => {
    for (const e of list ?? []) {
      for (const k of [e.bind, typeof e.max === 'string' ? e.max : null, e.visible?.bind]) if (k) out.add(k)
      // a text's {name}s are values; a number's format reads its own bind and max
      for (const m of String(e.text ?? '').matchAll(/\{([a-z0-9_.]+)\}/gi)) out.add(m[1])
      if (e.type === 'group') walk(e.children)
    }
  }
  walk(t?.elements)
  return [...out]
}

const graphsOf = (owner) => Object.entries(owner?.graphs ?? {})
const scriptHangs = (text) => [...String(text ?? '').matchAll(/dnp\.mark\s*\([^,]*,\s*(['"])([a-z0-9_]{1,24})\1/g)].map((m) => m[2])

/**
 * Who hangs which template: name -> [{ kind, label, ... }], over the module and
 * its maps. `kind` is 'monster', 'graph', 'sign' or 'script'.
 */
export function markerUses (module, docs = {}) {
  const out = new Map()
  const add = (name, use) => { if (!name) return; if (!out.has(name)) out.set(name, []); out.get(name).push(use) }
  for (const [n, m] of Object.entries(module.mobs?.mobs ?? {})) if (m.health_bar) add(m.health_bar, { kind: 'monster', label: n, monster: n })
  for (const [g, graph] of graphsOf(module)) for (const node of graph?.nodes ?? []) if (node.type === 'mark') add(node.template, { kind: 'graph', label: `the game's graph ${g}`, graph: g, node: node.id })
  for (const [map, doc] of Object.entries(docs)) {
    for (const [g, graph] of graphsOf(doc)) for (const node of graph?.nodes ?? []) if (node.type === 'mark') add(node.template, { kind: 'graph', label: `${map}'s graph ${g}`, map, graph: g, node: node.id })
    for (const e of doc.entities ?? []) if (e.kind === SIGN) add(e.name, { kind: 'sign', label: `a sign on ${map}${e.text ? ` ("${e.text}")` : ''}`, map, id: e.id })
  }
  for (const [s, text] of Object.entries(module.scripts ?? {})) for (const name of scriptHangs(text)) add(name, { kind: 'script', label: `the script ${s}`, script: s })
  return out
}

/**
 * What hangs a template that is not there: a marker the game would not draw
 * (the client says so once, in a console nobody reads on a phone). A map with
 * a layout of its own is checked against it, as the game reads it there.
 */
export function markerProblems (module, docs = {}) {
  const out = []
  const known = (map) => new Set(markerNames((map && docs[map]?.ui) || module.ui))
  for (const [name, uses] of markerUses(module, docs)) {
    for (const u of uses) {
      if (u.kind === 'script') continue                      // read from text: a hint, not a fact
      if (u.kind === 'monster') {
        // a monster walks every map: one that lacks the template is enough
        const maps = Object.keys(docs).filter((m) => !known(m).has(name))
        if (!known(null).has(name) || maps.length) out.push(`${u.label}: its bar over it is the marker "${name}", which ${maps.length && known(null).has(name) ? `the screens of ${maps.join(', ')} do not have` : 'the module\'s screens do not have'}, so it is never drawn. Make it on Screens → markers, or pick another.`)
      } else if (!known(u.map ?? null).has(name)) {
        out.push(`${u.label}: hangs the marker "${name}", which ${u.map && docs[u.map]?.ui ? `${u.map}'s own screens do not have` : 'the module\'s screens do not have'}, so it is never drawn. Make it on Screens → markers, or pick another.`)
      }
    }
  }
  return out
}

/** A template renamed, and everything that hangs it told (scripts are the author's to change). */
export function renameMarker (module, docs, from, to) {
  for (const m of Object.values(module.mobs?.mobs ?? {})) if (m.health_bar === from) m.health_bar = to
  for (const owner of [module, ...Object.values(docs)]) for (const [, graph] of graphsOf(owner)) for (const node of graph?.nodes ?? []) if (node.type === 'mark' && node.template === from) node.template = to
  for (const doc of Object.values(docs)) for (const e of doc.entities ?? []) if (e.kind === SIGN && e.name === from) e.name = to
}
