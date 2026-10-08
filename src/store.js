//
// Where the studio keeps its work between sessions: IndexedDB, in the page's
// own origin, which every shell gives it. One record per module holding the
// module document, its map documents and its imported pictures, so a module
// is one thing to load, save, export or delete.
//
// The shells' writable game tree is NOT this store: it is written on Play and
// Export from what is here, deterministically, and never read back except to
// import a pack. One direction, so the two cannot disagree.
//
const DB = 'dnp-studio'
// The suite's, when it was a fork of the studio beside it (0.2.0 absorbed it):
// its modules are brought over once (importSuite).
const SUITE_DB = 'dnp-suite'
const STORE = 'modules'
// Version 2 added the snapshots (snapshots.js) beside the modules. One opener
// for both: two at different versions would block each other. Version 3 (studio
// 0.2.0, the plugins) added an editor's unsaved work (plugins/drafts.js) and what bakers
// made, by source (bake/cache.js).
export const SNAPSHOTS = 'snapshots'
export const DRAFTS = 'drafts'
export const BAKES = 'bakecache'

let opening = null
export function openDb () {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 3)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS, { keyPath: 'key' }).createIndex('module', 'module')
      if (!db.objectStoreNames.contains(DRAFTS)) db.createObjectStore(DRAFTS, { keyPath: 'key' }).createIndex('module', 'module')
      if (!db.objectStoreNames.contains(BAKES)) db.createObjectStore(BAKES, { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return opening
}
const open = openDb

function tx (db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    t.oncomplete = () => resolve(req?.result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

/** A record: { id, module, docs: { name: doc }, assets: { 'textures/NAME.png': Blob }, opened } */
export class Store {
  static async open () {
    const s = new Store()
    s.db = await open()
    return s
  }

  async list () {
    const all = await tx(this.db, 'readonly', (o) => o.getAll())
    return (all ?? []).sort((a, b) => (b.opened ?? 0) - (a.opened ?? 0))
  }

  async load (id) { return tx(this.db, 'readonly', (o) => o.get(id)) }

  async save (rec) { rec.opened = Date.now(); return tx(this.db, 'readwrite', (o) => o.put(rec)) }

  async remove (id) { return tx(this.db, 'readwrite', (o) => o.delete(id)) }
}

/**
 * THE SUITE'S WORK, BROUGHT OVER ONCE. Before 0.2.0 the plugins lived in a
 * fork of the studio with a database of its own (dnp-suite). Where one is
 * on this origin, its modules the studio does not have, and an editor's
 * unsaved drafts, are copied in; a module the studio has is left as it is.
 * `done` / `mark` remember that it ran. Returns the ids copied.
 */
export async function importSuite (store, { done = () => false, mark = () => {} } = {}) {
  if (done()) return []
  // Opening a database that is not there would make an empty one: asked first.
  const names = await indexedDB.databases?.().catch(() => null)
  if (!names) return []
  if (!names.some((d) => d.name === SUITE_DB)) { mark(); return [] }
  const old = await new Promise((resolve, reject) => {
    const req = indexedDB.open(SUITE_DB)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  const all = (name) => old.objectStoreNames.contains(name) ? new Promise((resolve, reject) => {
    const r = old.transaction(name, 'readonly').objectStore(name).getAll()
    r.onsuccess = () => resolve(r.result ?? []); r.onerror = () => reject(r.error)
  }) : Promise.resolve([])
  const copied = []
  try {
    for (const rec of await all(STORE)) {
      if (!rec?.id || await store.load(rec.id)) continue
      await tx(store.db, 'readwrite', (o) => o.put(rec))
      copied.push(rec.id)
    }
    const drafts = await all(DRAFTS)
    if (drafts.length) {
      await new Promise((resolve, reject) => {
        const t = store.db.transaction(DRAFTS, 'readwrite')
        for (const d of drafts) t.objectStore(DRAFTS).put(d)
        t.oncomplete = resolve; t.onerror = () => reject(t.error)
      })
    }
  } finally { old.close() }
  mark()
  return copied
}

/** Save at most once per `ms` after the last call. */
export function debounce (fn, ms = 600) {
  let timer = null
  let args = null
  const flush = () => { timer = null; if (args) { const a = args; args = null; fn(...a) } }
  const d = (...a) => { args = a; if (!timer) timer = setTimeout(flush, ms) }
  d.flush = () => { if (timer) { clearTimeout(timer); flush() } }
  return d
}
