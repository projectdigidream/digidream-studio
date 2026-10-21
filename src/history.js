//
// Undo and redo by snapshot.
//
// A level document is small -- a few hundred sectors at most, by the engine's
// own capacity -- so a copy per edit is cheap and the code that makes it
// cannot be wrong about which fields changed. ponytail: whole-document
// snapshots; per-edit diffs if a document ever gets big enough to notice.
//
const CAP = 100

export class History {
  constructor (doc) {
    this.past = []
    this.future = []
    this.current = structuredClone(doc)
  }

  /** Call after a change has been made to `doc`; the previous state becomes undoable. */
  commit (doc) {
    this.past.push(this.current)
    if (this.past.length > CAP) this.past.shift()
    this.future = []
    this.current = structuredClone(doc)
  }

  /**
   * The present changed in a way this history does not undo -- the map was
   * edited under the module's history -- so the next step it records starts
   * from what is there now, not from what it last saw.
   */
  replace (doc) { this.current = structuredClone(doc) }

  get canUndo () { return this.past.length > 0 }
  get canRedo () { return this.future.length > 0 }

  /** Returns the document to make current, or null. */
  undo () {
    if (!this.canUndo) return null
    this.future.push(this.current)
    this.current = this.past.pop()
    return structuredClone(this.current)
  }

  redo () {
    if (!this.canRedo) return null
    this.past.push(this.current)
    this.current = this.future.pop()
    return structuredClone(this.current)
  }
}

// UNDO SURVIVES PLAY. Play gives the window to the game, and coming back is a
// fresh page: the histories, which live in memory, were gone. Kept here for
// the one trip (IndexedDB, since the module's holds pictures) and taken back
// at the boot that returns (main.js finishBoot).
const KEEP_DB = 'dnp.studio.undo'
const keepDb = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(KEEP_DB, 1)
  req.onupgradeneeded = () => req.result.createObjectStore('h')
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error)
})
const steps = (h) => (h ? { past: h.past, future: h.future } : null)

/** Keep the map's and the module's histories over a trip to the game. */
export async function keepHistories (module, map, mapHistory, moduleHistory) {
  const db = await keepDb()
  await new Promise((resolve, reject) => {
    const tx = db.transaction('h', 'readwrite')
    tx.objectStore('h').put({ module, map, at: Date.now(), map_: steps(mapHistory), module_: steps(moduleHistory) }, 'play')
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error)
  })
  db.close()
}

/** What keepHistories kept (once: it is gone after), or null. */
export async function takeHistories () {
  const db = await keepDb()
  const got = await new Promise((resolve, reject) => {
    const tx = db.transaction('h', 'readwrite')
    const st = tx.objectStore('h')
    const r = st.get('play')
    r.onsuccess = () => { st.delete('play'); resolve(r.result ?? null) }
    tx.onerror = () => reject(tx.error)
  })
  db.close()
  return got
}

/** A history given back its steps, around the present it has now. */
export function restoreSteps (h, kept) {
  if (!h || !kept) return
  h.past = kept.past ?? []
  h.future = kept.future ?? []
}
