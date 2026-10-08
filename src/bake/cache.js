//
// What bakers made, by what they were given (run.js keys it): IndexedDB, the
// studio's own database (store.js, version 3). The oldest go when it is full.
//
import { openDb, BAKES } from '../store.js'

const KEEP = 400

function run (mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(BAKES, mode)
    const req = fn(t.objectStore(BAKES))
    t.oncomplete = () => resolve(req?.result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  }))
}

let puts = 0
export const bakeCache = {
  get: (key) => run('readonly', (o) => o.get(key)).then((r) => r?.value ?? null),
  async put (key, value) {
    await run('readwrite', (o) => o.put({ key, value, at: Date.now() }))
    if (++puts % 25) return
    const all = await run('readonly', (o) => o.getAll())
    if (all.length <= KEEP) return
    all.sort((a, b) => a.at - b.at)
    await run('readwrite', (o) => { for (const r of all.slice(0, all.length - KEEP)) o.delete(r.key) })
  }
}
