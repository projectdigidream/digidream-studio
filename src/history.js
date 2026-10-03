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
