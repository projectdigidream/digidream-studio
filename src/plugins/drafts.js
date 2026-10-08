//
// AN EDITOR'S UNSAVED WORK, kept by the studio.
//
// A phone kills a backgrounded app as a matter of course, and a page in an
// iframe can die with it. So while a plugin edits a document the studio keeps
// what the editor last sent (`draft`, and an answer to `request-save` when the
// app is hidden), keyed by the document, not by the editor: if the editor that
// wrote it is gone, the next one for that kind is offered it. Back or Discard
// clears it; opening the document again with one there asks whether to go on.
//
// IndexedDB, the studio's own database (store.js, version 3).
//
import { openDb, DRAFTS } from '../store.js'

/** The key: one draft per document of a module. */
export const draftKey = (module, kind, key) => `${module}|${kind}|${key}`

function run (mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(DRAFTS, mode)
    const req = fn(t.objectStore(DRAFTS))
    t.oncomplete = () => resolve(req?.result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  }))
}

/** { key, module, kind, doc, editor, payload, at } or undefined. */
export const getDraft = (module, kind, key) => run('readonly', (o) => o.get(draftKey(module, kind, key)))

export const putDraft = (module, kind, key, { editor, payload }) =>
  run('readwrite', (o) => o.put({ key: draftKey(module, kind, key), module, kind, doc: key, editor, payload, at: Date.now() }))

export const clearDraft = (module, kind, key) => run('readwrite', (o) => o.delete(draftKey(module, kind, key)))

/** Every draft of a module: what the Plugins page lists as unsaved. */
export const draftsOf = (module) => run('readonly', (o) => o.index('module').getAll(module))
