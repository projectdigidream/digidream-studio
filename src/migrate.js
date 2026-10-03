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
import { migrateGraph } from './graphs_emit.js'

export const MODULE_VERSION = 2

export function newMetamap () { return { enabled: false, pitch: null, radius: 1, cells: {} } }

/**
 * @param rec  the store record { module, docs, assets } -- changed in place
 * @returns [string] what was done, empty when nothing was
 */
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
  for (const d of Object.values(rec.docs ?? {})) if (migrateGraph(d.graph)) did.push(`${d.name}'s graph: node places moved to pos`)
  if ((m.version ?? 1) < MODULE_VERSION) { m.version = MODULE_VERSION; did.push(`module document version ${MODULE_VERSION}`) }
  return did
}
