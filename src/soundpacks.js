//
// Sound packs: several DigidreamSound banks in one module, baked into the one
// bank the engine plays.
//
// The engine plays ONE bank (engine/client/src/audio/sfx.js: setBank replaces;
// the servers serve the first module's assets/sounds/bank.sfxproj). A module
// may still be made from several packs -- DOOM's monsters, a UI set, a pack of
// its own -- so the studio keeps each pack as the source it was imported as
// (sources/sounds/<id>.sfxproj, per the toolbox rule that sources live in
// their own tree and assets/ is what a bake makes) and merges them when it
// writes the module.
//
// THE MERGE, in the packs' priority order (the module's list, top first):
//   - sounds are concatenated; a name a higher pack already gave is DROPPED
//     and listed as a collision, never renamed (a sound is its name);
//   - buses are unioned by name; the same name with different settings keeps
//     the first and says so;
//   - the reverb (`fx`) is the first pack's that has one.
// Pure: the Sounds section and emitModule both call it.
//

/** The names a bank defines, in its own order. */
export function bankNames (json) {
  return Array.isArray(json?.sounds) ? json.sounds.map((x) => x?.name).filter((n) => typeof n === 'string') : []
}

/** A pack id from a file name: lower case, letters, digits, dashes. */
export function packId (raw, taken = []) {
  const base = String(raw ?? '').replace(/\.sfxproj$/i, '').toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'pack'
  let id = base
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`
  return id
}

export const packPath = (id) => `sources/sounds/${id}.sfxproj`

const sameBus = (a, b) => JSON.stringify({ ...a, name: 0 }) === JSON.stringify({ ...b, name: 0 })

/**
 * @param packs  [{ id, name, enabled, json }] in priority order
 * @returns { bank, origin: { soundName: packId }, collisions: [{ name, kept, dropped }], warnings: [string] }
 *          bank is null when no enabled pack has a sound
 */
export function mergeBanks (packs) {
  const origin = {}
  const collisions = []
  const warnings = []
  const buses = new Map()
  const sounds = []
  let fx = null
  let version = 1
  const on = packs.filter((p) => p.enabled !== false && p.json)
  for (const p of on) {
    version = Math.max(version, p.json.version ?? 1)
    for (const b of p.json.buses ?? []) {
      const had = buses.get(b.name)
      if (!had) buses.set(b.name, { bus: b, from: p.id })
      else if (!sameBus(had.bus, b)) warnings.push(`bus '${b.name}' differs in ${p.id}; ${had.from}'s is kept`)
    }
    if (!fx && p.json.fx && Object.keys(p.json.fx).length) fx = p.json.fx
    for (const s of p.json.sounds ?? []) {
      if (typeof s?.name !== 'string') continue
      if (s.name in origin) {
        const c = collisions.find((x) => x.name === s.name)
        if (c) c.dropped.push(p.id)
        else collisions.push({ name: s.name, kept: origin[s.name], dropped: [p.id] })
        continue
      }
      origin[s.name] = p.id
      sounds.push(s)
    }
  }
  if (!sounds.length) return { bank: null, origin, collisions, warnings }
  const bank = { version, name: on.length === 1 ? (on[0].json.name ?? on[0].id) : `merged: ${on.map((p) => p.id).join(' + ')}`,
                 buses: [...buses.values()].map((x) => x.bus), fx: fx ?? {}, sounds }
  return { bank, origin, collisions, warnings }
}
