//
// What is wrong anywhere in the module, by section: what the Home lists and
// the rail counts. Every check here is one the studio already makes where the
// thing is edited -- the map document's, the vocabularies', the graph's, the
// metamap's, a sound named in no pack -- gathered so a module can be judged
// without opening each part of it. The last bake's complaints are the map
// editor's to show; a map nobody has opened since a change is checked by its
// document only.
//
import { buttonNames, keyProblems } from '../keys_emit.js'
import { validate } from '../doc.js'
import { graphProblems, graphsOf, NAME_RE } from '../graphs_emit.js'
import { metamapProblems } from '../metamap.js'
import { skyProblems } from '../sky_emit.js'
import { playerProblems } from '../player.js'
import { climbProblems } from '../climb.js'
import { sheetProblems } from '../texsheet.js'
import { compileMobs, compileArsenal } from '../brainc.js'
import { markerProblems } from '../markers.js'

/** { maps: [{ map, msg }], graphs: [msg], monsters: [msg], weapons: [msg], sounds: [msg], metamap: [msg], sky: [msg], player: [msg], textures: [msg], controls: [msg] } */
export function moduleProblems (S) {
  const out = { maps: [], graphs: [], monsters: [], weapons: [], sounds: [], metamap: [], sky: [], player: [], textures: [], controls: [], markers: [] }
  const V = S.vocab
  for (const d of Object.values(S.docs)) {
    for (const p of validate(d)) out.maps.push({ map: d.name, msg: (p.sector ? `${p.sector}: ` : '') + p.msg })
    for (const p of V.validateTriggers(d, S.module.panels ?? d.panels)) out.maps.push({ map: d.name, msg: p })
    for (const p of climbProblems(d)) out.maps.push({ map: d.name, msg: `${p.sector}: ${p.msg}` })
    for (const [name, g] of graphsOf(d)) {
      if (!NAME_RE.test(name)) out.maps.push({ map: d.name, msg: `graph '${name}': a name is 1 to 32 of a-z, 0-9, _` })
      if (V.graph) for (const p of graphProblems(g, V.graph, V.trigger, { buttons: buttonNames(S.module), panels: S.module.panels ?? {}, props: S.propNames?.() ?? null, maps: Object.keys(S.docs), paths: new Set((d.paths ?? []).map((x) => x.tag)) })) out.maps.push({ map: d.name, msg: `graph ${name}: ${p}` })
    }
  }
  for (const [name, g] of graphsOf(S.module)) {
    if (!NAME_RE.test(name)) out.graphs.push(`the game's graph '${name}': a name is 1 to 32 of a-z, 0-9, _`)
    if (V.graph) for (const p of graphProblems(g, V.graph, V.trigger, { buttons: buttonNames(S.module), panels: S.module.panels ?? {}, props: S.propNames?.() ?? null, game: true, maps: Object.keys(S.docs) })) out.graphs.push(`the game's graph ${name}: ${p}`)
  }
  for (const u of S.unansweredCalls?.() ?? []) out.graphs.push(`${u.graph} calls '${u.name}' (to ${u.to}), and nothing answers it`)
  // The skies: pictures missing or too few (docs/SKY.md).
  const tex = S.allTextureNames?.() ?? null
  out.sky.push(...skyProblems(S.module.sky, tex, 'the module\'s sky'))
  for (const d of Object.values(S.docs)) out.sky.push(...skyProblems(d.sky, tex, `${d.name}'s sky`))
  // The module's keys: what the server refuses, and a key that does two things.
  out.controls.push(...keyProblems(S.module).map((p) => p.msg))
  // Animated textures: a sheet the client would refuse or show with pixels left over.
  for (const [n, t] of Object.entries(S.module.textures ?? {})) out.textures.push(...sheetProblems(n, t.sheet, t.w, t.h))
  // The player's lines: a value of the wrong kind (docs/PLAYER.md).
  out.player.push(...playerProblems(S.module, Object.values(S.docs)))
  if (S.module.mobs) out.monsters.push(...V.validateMobs(compileMobs(S.module.mobs, S.module.props ?? []), { props: S.propNames?.() ?? null }))
  if (S.module.weapons && V.weapon && Object.keys(S.module.weapons.weapons ?? {}).length) out.weapons.push(...V.validateWeapons({ ...S.module, weapons: compileArsenal(S.module.weapons) }))
  out.metamap.push(...metamapProblems(S.module.metamap, Object.keys(S.docs)))
  // a monster, a graph or a sign hanging a marker the screens do not have (markers.js)
  out.markers.push(...markerProblems(S.module, S.docs))
  const known = new Set(S.soundNames?.() ?? [])
  for (const [n, where] of S.soundsUsed?.() ?? []) if (!known.has(n)) out.sounds.push(`${n} (${[...where].join(', ')}) is in no pack`)
  return out
}

/** How many problems each rail entry has. */
export function badgeCounts (p) {
  return { maps: new Set(p.maps.map((x) => x.map)).size + (p.metamap.length ? 1 : 0), graphs: p.graphs.length, monsters: p.monsters.length, weapons: p.weapons.length, sounds: p.sounds.length, player: p.player?.length ?? 0 }
}
