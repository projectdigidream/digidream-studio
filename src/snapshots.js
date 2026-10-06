//
// SNAPSHOTS: copies of a module kept on the device, to go back to.
//
// Undo lives for a session; a snapshot outlives it. Each holds the module
// document and its maps (JSON), taken
//   when a module is opened (if the last is half an hour old),
//   every few minutes while it is being edited,
//   before anything that replaces work: a pack imported over it, a map
//   deleted, a restore, a studio update migrating it,
//   and when asked ("snapshot now").
// One identical to the latest is not taken. The newest MAX_RECENT are kept,
// and beyond them the first of each day for DAYS days.
//
// Not the pictures, sounds and fonts the module imported (rec.assets): they
// can be megabytes each and copying them every few minutes would fill a phone.
// A snapshot lists their paths, and a restore says which it names that are
// gone.
//
// The pure part (prune, digest, describe) is here for the tests; the store is
// a second object store beside store.js's, in the same database.
//

import { openDb, SNAPSHOTS as SNAPS } from './store.js'

export const MAX_RECENT = 20
export const DAYS = 14
export const EVERY_MS = 10 * 60 * 1000
export const ON_OPEN_MS = 30 * 60 * 1000

/** A cheap fingerprint of a module's content: FNV-1a over its JSON. */
export function digest (module, docs) {
  const s = JSON.stringify({ module, docs })
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return `${s.length.toString(36)}-${h.toString(36)}`
}

/** What to keep of one module's snapshots (any order): the newest MAX_RECENT, then the first of each day for DAYS days. */
export function prune (list, now = Date.now()) {
  const sorted = [...list].sort((a, b) => b.at - a.at)
  const keep = new Set(sorted.slice(0, MAX_RECENT))
  const days = new Map()
  for (const s of sorted.slice(MAX_RECENT)) {
    if (now - s.at > DAYS * 86400000) continue
    const d = new Date(s.at); const day = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    // The day's first: walking newest first, the last one seen wins.
    days.set(day, s)
  }
  for (const s of days.values()) keep.add(s)
  return { keep: sorted.filter((s) => keep.has(s)), drop: sorted.filter((s) => !keep.has(s)) }
}

/** "12 min ago", "today 14:05", "yesterday 09:12", "3 Oct 18:40". */
export function when (at, now = Date.now()) {
  const d = new Date(at); const n = new Date(now)
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const mins = Math.floor((now - at) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const ago = Math.round((day(n) - day(d)) / 86400000)
  if (ago === 0) return `today ${hm}`
  if (ago === 1) return `yesterday ${hm}`
  return `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${hm}`
}

/** How a snapshot's maps compare with the module now: [{ name, state: 'same'|'changed'|'gone'|'new' }]. */
export function compareMaps (snapDocs, nowDocs) {
  const out = []
  for (const [name, doc] of Object.entries(snapDocs ?? {})) {
    const now = nowDocs?.[name]
    out.push({ name, state: !now ? 'gone' : JSON.stringify(now) === JSON.stringify(doc) ? 'same' : 'changed' })
  }
  for (const name of Object.keys(nowDocs ?? {})) if (!(name in (snapDocs ?? {}))) out.push({ name, state: 'new' })
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** The asset paths a snapshot lists that the module no longer has. */
export const missingAssets = (snap, assets) => (snap.assets ?? []).filter((p) => !(p in (assets ?? {})))

// --- the store ------------------------------------------------------------------------

const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })

export class Snapshots {
  static async open () { const s = new Snapshots(); s.db = await openDb(); return s }

  #store (mode) { return this.db.transaction(SNAPS, mode).objectStore(SNAPS) }

  /** One module's snapshots, newest first, without their content. */
  async list (moduleId) {
    const all = await req(this.#store('readonly').index('module').getAll(moduleId))
    return (all ?? []).sort((a, b) => b.at - a.at).map(({ data, ...meta }) => meta)
  }

  async get (key) { return req(this.#store('readonly').get(key)) }

  /**
   * Take one, unless it is the same as the latest. `reason`: 'opened',
   * 'editing', 'before …', or the person's own label.
   * @returns the snapshot's meta, or null when nothing changed
   */
  async take (rec, reason, { force = false } = {}) {
    const latest = (await this.list(rec.id))[0]
    const dig = digest(rec.module, rec.docs)
    if (!force && latest?.digest === dig) return null
    const at = Date.now()
    const data = JSON.parse(JSON.stringify({ module: rec.module, docs: rec.docs }))
    const snap = { key: `${rec.id}@${at}`, module: rec.id, at, reason, digest: dig, maps: Object.keys(rec.docs ?? {}).sort(),
                   size: JSON.stringify(data).length, assets: Object.keys(rec.assets ?? {}), data }
    await req(this.#store('readwrite').put(snap))
    await this.prune(rec.id)
    const { data: _d, ...meta } = snap
    return meta
  }

  async prune (moduleId) {
    const { drop } = prune(await this.list(moduleId))
    const s = this.#store('readwrite')
    for (const d of drop) s.delete(d.key)
    return drop.length
  }

  async remove (key) { return req(this.#store('readwrite').delete(key)) }

  /** When the latest was taken, or 0. */
  async latestAt (moduleId) { return (await this.list(moduleId))[0]?.at ?? 0 }
}
