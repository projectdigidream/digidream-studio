//
// Module documents from before the studio was a module editor, brought up to
// the current shape when they are opened. Each step says what it did; nothing
// a module contained is dropped.
//
// Version 2 (2026-10-03):
//   - the one sound bank at assets/sounds/bank.sfxproj becomes the first of
//     the module's sound PACKS, kept as a source (sources/sounds/<id>.sfxproj);
//     the studio merges packs into the bank it writes (soundpacks.js);
//   - `sounds` and `metamap` are declared (empty / off).
//
import { packPath } from './soundpacks.js'
import { migrateGraph, migrateGraphs, graphsOf, MAP_GRAPH, GAME_NAME } from './graphs_emit.js'
import { migratePanels } from './panels_emit.js'

export const MODULE_VERSION = 4

export function newMetamap () { return { enabled: false, pitch: null, radius: 1, cells: {} } }

/**
 * @param rec  the store record { module, docs, assets } -- changed in place
 * @returns [string] what was done, empty when nothing was
 */
// THE STARTER'S OLD SCRIPT, word for word: an on_attack of its own that ran
// beside mobs.lua's, so every swing that landed cost twice (engine 0.2.1.3).
// A module made from it gets the new text; one whose script was changed keeps it.
export const OLD_STARTER_LUA = "-- The starter module's own script: what a player's swing costs a monster.\n--\n-- The engine reports that a swing reached something; what that means is\n-- script (docs/INTERACTION.md). modules/doom2 gets this from weapons.lua;\n-- this module has no weapons and needs one line of it.\nfunction on_attack(attacker, target)\n  if mobs ~= nil and mobs.hurt ~= nil and target ~= nil then mobs.hurt(target, 10, attacker) end\nend\n"
export const STARTER_LUA = "-- The starter module's own script: what a player's swing costs a monster.\n--\n-- The engine reports that a swing reached something, and mobs.lua's on_attack\n-- prices it (docs/INTERACTION.md): a monster's from its `swing`, a player's\n-- from the weapon in hand -- and, with no weapons, `mobs.player_damage`. This\n-- module has no weapons, so it says that number. It used to add an on_attack\n-- of its own, which ran BESIDE mobs.lua's (hooks are a list): every swing that\n-- landed cost twice, a monster's bite on the player included.\nif mobs ~= nil then mobs.player_damage = 10 end\n"

export function migrateModule (rec) {
  const m = rec.module
  const did = []
  m.sounds ??= { packs: [] }
  m.sounds.packs ??= []
  m.metamap ??= newMetamap()
  const old = rec.assets?.['sounds/bank.sfxproj']
  if (old && !m.sounds.packs.length) {
    rec.assets[packPath('bank')] = old
    delete rec.assets['sounds/bank.sfxproj']
    m.sounds.packs.push({ id: 'bank', name: 'bank', enabled: true })
    did.push('the module\'s sound bank is its first sound pack now')
  }
  // Version 4: many graphs each, by name -- the one a map had is its `main`,
  // the module's its `game`. First, so everything after reads `graphs`.
  if (migrateGraphs(m, GAME_NAME)) did.push(`the module's graph is now its graph '${GAME_NAME}'`)
  for (const d of Object.values(rec.docs ?? {})) if (migrateGraphs(d, MAP_GRAPH)) did.push(`${d.name}'s graph is now its graph '${MAP_GRAPH}'`)
  for (const owner of [m, ...Object.values(rec.docs ?? {})]) {
    for (const [name, g] of graphsOf(owner)) if (migrateGraph(g)) did.push(`${owner.name ?? 'the module'}'s graph ${name}: node places moved to pos`)
  }
  if (m.scripts?.['starter.lua'] === OLD_STARTER_LUA) { m.scripts['starter.lua'] = STARTER_LUA; did.push('the starter\'s script no longer charges every swing twice') }
  // Version 3: panels are the module's (panels_emit.js), not each map's.
  did.push(...migratePanels(m, Object.values(rec.docs ?? {})))
  if ((m.version ?? 1) < MODULE_VERSION) { m.version = MODULE_VERSION; did.push(`module document version ${MODULE_VERSION}`) }
  return did
}
