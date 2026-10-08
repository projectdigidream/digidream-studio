//
// THE EDITOR'S SIDE of the suite's editor protocol: what a plugin page imports
// (or carries a copy of) to be opened by the suite. Self-contained on purpose
// -- no imports -- so a plugin can ship this one file and nothing else of the
// suite's. docs/PLUGINS.md describes the messages; protocol.js is the other end.
//
//   import { inSuite, connectSuite } from './suite-sdk.js'
//   if (inSuite()) {
//     const suite = await connectSuite({
//       onInit: ({ kind, key, name, payload, caps }) => load(payload),
//       onSave: () => bytesOrText(),          // asked on Back, and for drafts
//       onUndo, onRedo, onRevert, onDispose
//     })
//     editor.onChange(() => { suite.dirty(true); suite.draft(bytesOrText()) })
//   }
//
// The suite draws Back and Discard itself; an editor that has its own "done"
// button calls suite.close(true).
//
export const PROTOCOL = 1

/** Is this page open inside the suite (…?host=suite)? */
export function inSuite (search = globalThis.location?.search ?? '') {
  return new URLSearchParams(search).get('host') === 'suite'
}

/**
 * Serve the protocol on a port already in hand (connectSuite finds the port;
 * tests hand one straight in). Returns the editor's API.
 */
export function serveEditor (port, handlers = {}, { caps = [] } = {}) {
  let next = 1
  const pending = new Map()
  const send = (t, fields = {}) => {
    const msg = { v: PROTOCOL, t, ...fields }
    const transfer = []
    if (msg.payload instanceof Uint8Array) { msg.payload = msg.payload.slice(); transfer.push(msg.payload.buffer) }
    port.postMessage(msg, transfer)
  }
  let draftTimer = null
  let draftLatest
  const api = {
    /** The document differs from what the suite gave (or what it last took). */
    dirty: (dirty = true) => send('dirty', { dirty: !!dirty }),
    /** A step the editor could undo; `label` says what it was. */
    edit: (label = '') => send('edit', { label }),
    /** The work so far, kept by the suite in case this page dies. At most every 2 s. */
    draft (payload) {
      draftLatest = payload
      if (draftTimer) return
      draftTimer = setTimeout(() => { draftTimer = null; send('draft', { payload: draftLatest }) }, 2000)
    },
    /** Leave: back to the suite, saving (true) or not. */
    close: (save = true) => send('close', { save: !!save }),
    error: (message) => send('error', { message: String(message) }),
    diagnostics: (items) => send('diagnostics', { items }),
    /** Ask the suite something read-only about the module (docs/PLUGINS.md, Queries). */
    query (what, arg = null, { timeout = 15000 } = {}) {
      const reqId = next++
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(reqId); reject(new Error(`no answer to ${what}`)) }, timeout)
        pending.set(reqId, (m) => { clearTimeout(timer); m.error ? reject(new Error(m.error)) : resolve(m.result) })
        send('query', { reqId, what, arg })
      })
    },
    caps: {},
    kind: null,
    key: null,
    name: null
  }
  port.onmessage = async (e) => {
    const m = e.data
    if (!m || typeof m.t !== 'string') return
    try {
      switch (m.t) {
        case 'init':
          Object.assign(api, { kind: m.kind, key: m.key, name: m.name, caps: m.caps ?? {} })
          await handlers.onInit?.(m)
          break
        case 'request-save': {
          const payload = await handlers.onSave?.()
          send('content', { reqId: m.reqId, payload: payload ?? '' })
          break
        }
        case 'revert': await handlers.onRevert?.(m); break
        case 'undo': await handlers.onUndo?.(); break
        case 'redo': await handlers.onRedo?.(); break
        case 'saved': await handlers.onSaved?.(); break
        case 'dispose': await handlers.onDispose?.(); break
        case 'query-result': pending.get(m.reqId)?.(m); pending.delete(m.reqId); break
      }
    } catch (err) {
      send('error', { message: String(err?.message ?? err) })
      if (m.t === 'request-save') send('content', { reqId: m.reqId, error: String(err?.message ?? err) })
    }
  }
  port.start?.()
  send('ready', { proto: PROTOCOL, caps })
  return api
}

/**
 * Wait for the suite's offer of a channel (it repeats it until answered), take
 * the first, and serve the protocol on it. Only an offer from the parent page,
 * from this page's own origin, is taken.
 */
export function connectSuite (handlers = {}, opts = {}) {
  return new Promise((resolve) => {
    const onHello = (e) => {
      if (e.source !== globalThis.parent || e.origin !== globalThis.location.origin) return
      if (e.data?.t !== 'dnp-hello' || !e.ports?.[0]) return
      globalThis.removeEventListener('message', onHello)
      resolve(serveEditor(e.ports[0], handlers, opts))
    }
    globalThis.addEventListener('message', onHello)
  })
}
