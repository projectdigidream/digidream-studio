//
// What is wrong anywhere in the module, by section: what the Home lists and
// the rail counts. Every check here is one the studio already makes where the
// thing is edited -- the map document's, the vocabularies', the graph's, the
// metamap's, a sound named in no pack -- gathered so a module can be judged
// without opening each part of it. The last bake's complaints are the map
// editor's to show; a map nobody has opened since a change is checked by its
// document only.
//
import { validate } from '../doc.js'
import { graphProblems, graphsOf, NAME_RE } from '../graphs_emit.js'
import { metamapProblems } from '../metamap.js'

/** { maps: [{ map, msg }], graphs: [msg], monsters: [msg], weapons: [msg], sounds: [msg], metamap: [msg] } */
export function moduleProblems (S) {
  const out = { maps: [], graphs: [], monsters: [], weapons: [], sounds: [], metamap: [] }
  const V = S.vocab
  for (const d of Object.values(S.docs)) {
    for (const p of validate(d)) out.maps.push({ map: d.name, msg: (p.sector ? `${p.sector}: ` : '') + p.msg })
    for (const p of V.validateTriggers(d, S.module.panels ?? d.panels)) out.maps.push({ map: d.name, msg: p })
    for (const [name, g] of graphsOf(d)) {
      if (!NAME_RE.test(name)) out.maps.push({ map: d.name, msg: `graph '${name}': a name is 1 to 32 of a-z, 0-9, _` })
      if (V.graph) for (const p of graphProblems(g, V.graph, V.trigger, { paths: new Set((d.paths ?? []).map((x) => x.tag)) })) out.maps.push({ map: d.name, msg: `graph ${name}: ${p}` })
    }
  }
  for (const [name, g] of graphsOf(S.module)) {
    if (!NAME_RE.test(name)) out.graphs.push(`the game's graph '${name}': a name is 1 to 32 of a-z, 0-9, _`)
    if (V.graph) for (const p of graphProblems(g, V.graph, V.trigger, { game: true })) out.graphs.push(`the game's graph ${name}: ${p}`)
  }
  for (const u of S.unansweredCalls?.() ?? []) out.graphs.push(`${u.graph} calls '${u.name}' (to ${u.to}), and nothing answers it`)
  if (S.module.mobs) out.monsters.push(...V.validateMobs(S.module.mobs, { props: S.propNames?.() ?? null }))
  if (S.module.weapons && V.weapon && Object.keys(S.module.weapons.weapons ?? {}).length) out.weapons.push(...V.validateWeapons(S.module))
  out.metamap.push(...metamapProblems(S.module.metamap, Object.keys(S.docs)))
  const known = new Set(S.soundNames?.() ?? [])
  for (const [n, where] of S.soundsUsed?.() ?? []) if (!known.has(n)) out.sounds.push(`${n} (${[...where].join(', ')}) is in no pack`)
  return out
}

/** How many problems each rail entry has. */
export function badgeCounts (p) {
  return { maps: new Set(p.maps.map((x) => x.map)).size + (p.metamap.length ? 1 : 0), graphs: p.graphs.length, monsters: p.monsters.length, weapons: p.weapons.length, sounds: p.sounds.length }
}
