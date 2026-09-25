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
const STORE = 'modules'

function open () {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

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

/** Save at most once per `ms` after the last call. */
export function debounce (fn, ms = 600) {
  let timer = null
  let args = null
  const flush = () => { timer = null; if (args) { const a = args; args = null; fn(...a) } }
  const d = (...a) => { args = a; if (!timer) timer = setTimeout(flush, ms) }
  d.flush = () => { if (timer) { clearTimeout(timer); flush() } }
  return d
}
