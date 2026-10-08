//
// THE SUITE'S SIDE of the editor protocol (docs/PLUGINS.md, The editor protocol).
//
// An editor is a page in an iframe. The suite offers it a MessageChannel by
// posting { t: 'dnp-hello', v } with one port, again every few hundred
// milliseconds until the page answers `ready` on one of them: a page whose
// script loads late (a big bundle) still gets a port, and the suite never
// guesses when it is listening. Everything after that is on the port.
//
//   suite -> editor   init{kind,key,name,payload,caps}  request-save{reqId}
//                     revert{payload}  undo  redo  saved  query-result{reqId,…}  dispose
//   editor -> suite   ready{proto,caps}  dirty{dirty}  edit{label}  draft{payload}
//                     content{reqId,payload}  query{reqId,what,arg}  diagnostics{items}
//                     close{save}  error{message}
//
// A payload is a string or a Uint8Array, never base64: bytes move, they are
// not re-encoded. Every message carries v (the protocol) and t (its type).
//
import { PROTOCOL } from './manifest.js'

/** One end of a channel: send, wait for a reply by reqId, dispatch by type. */
export class Port {
  constructor (port) {
    this.port = port
    this.handlers = new Map()
    this.pending = new Map()
    this.nextId = 1
    this.closed = false
    port.onmessage = (e) => this.receive(e.data)
    port.start?.()
  }

  receive (msg) {
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return
    if (msg.reqId !== undefined && this.pending.has(msg.reqId) && msg.t !== 'request-save' && msg.t !== 'query') {
      const { resolve, timer } = this.pending.get(msg.reqId)
      clearTimeout(timer)
      this.pending.delete(msg.reqId)
      resolve(msg)
      return
    }
    for (const fn of this.handlers.get(msg.t) ?? []) fn(msg)
    for (const fn of this.handlers.get('*') ?? []) fn(msg)
  }

  on (t, fn) {
    if (!this.handlers.has(t)) this.handlers.set(t, [])
    this.handlers.get(t).push(fn)
    return this
  }

  /** Send; byte payloads are transferred (a copy, so the sender keeps its own). */
  send (t, fields = {}) {
    if (this.closed) return
    const msg = { v: PROTOCOL, t, ...fields }
    const transfer = []
    if (msg.payload instanceof Uint8Array) {
      msg.payload = msg.payload.slice()
      transfer.push(msg.payload.buffer)
    }
    this.port.postMessage(msg, transfer)
  }

  /** Send with a fresh reqId and wait for the message that answers it. */
  request (t, fields = {}, { timeout = 15000 } = {}) {
    const reqId = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = timeout ? setTimeout(() => { this.pending.delete(reqId); reject(new Error(`no answer to ${t} in ${timeout} ms`)) }, timeout) : null
      this.pending.set(reqId, { resolve, timer })
      this.send(t, { ...fields, reqId })
    })
  }

  close () {
    this.closed = true
    for (const { timer } of this.pending.values()) clearTimeout(timer)
    this.pending.clear()
    this.port.close?.()
  }
}

/**
 * Offer channels to `target` (an iframe's contentWindow) until one is
 * answered with `ready`. Resolves { port: Port, ready } -- or rejects after
 * `timeout` ms with no answer. `stop()` gives up early (the editor was closed).
 */
export function handshake (target, { origin, timeout = 30000, every = 250, MessageChannelImpl = globalThis.MessageChannel } = {}) {
  let stopped = false
  let tick = null
  const offered = []
  const done = new Promise((resolve, reject) => {
    const started = Date.now()
    const offer = () => {
      if (stopped) return
      if (Date.now() - started > timeout) {
        stop()
        reject(new Error('the editor did not start'))
        return
      }
      const ch = new MessageChannelImpl()
      ch.port1.onmessage = (e) => {
        if (stopped || e.data?.t !== 'ready') return
        stopped = true
        clearInterval(tick)
        for (const o of offered) if (o !== ch.port1) o.close()
        const port = new Port(ch.port1)
        resolve({ port, ready: e.data })
      }
      offered.push(ch.port1)
      try { target.postMessage({ t: 'dnp-hello', v: PROTOCOL }, origin, [ch.port2]) } catch {}
    }
    offer()
    tick = setInterval(offer, every)
  })
  const stop = () => { stopped = true; clearInterval(tick); for (const o of offered) o.close() }
  return { done, stop }
}

/** A payload as bytes, whatever form it came in. */
export function toBytes (payload) {
  if (payload instanceof Uint8Array) return payload
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload)
  return new TextEncoder().encode(String(payload ?? ''))
}

/** Byte-equal? (Did "back" bring anything new?) */
export function sameBytes (a, b) {
  const x = toBytes(a), y = toBytes(b)
  if (x.length !== y.length) return false
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false
  return true
}
