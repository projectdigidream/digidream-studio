//
// WHAT THIS DEVICE REMEMBERS ABOUT THE SYNC, in the plugin's own IndexedDB
// database: the settings (token, repository, branch, device name, which
// modules sync) and, per module, what it was at the last sync (sync.js's
// base). The service writes it; the Sync page reads it and listens on the
// channel for changes.
//
// The token is kept here, in the studio's origin, which every plugin page
// shares: an installed plugin from someone else could read it. Bundled
// plugins only, until the shells keep it in the system's keychain.
//

const DB = 'dnp-github-sync'
export const CHANNEL = 'dnp-github-sync'

let opening = null
function open () {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      db.createObjectStore('kv')
      db.createObjectStore('modules')
      db.createObjectStore('status')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return opening
}

async function tx (store, mode, fn) {
  const db = await open()
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const req = fn(t.objectStore(store))
    t.oncomplete = () => resolve(req?.result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

/** { token, repo, branch, login, device, tracked: [ids] } or null when not connected. */
export const getConfig = () => tx('kv', 'readonly', (s) => s.get('config')).then((c) => c ?? null)
export const setConfig = (c) => tx('kv', 'readwrite', (s) => (c ? s.put(c, 'config') : s.delete('config')))

/** Per module: sync.js's state (its base, and conflicts waiting for a choice). */
export const modules = {
  get: (id) => tx('modules', 'readonly', (s) => s.get(id)).then((x) => x ?? null),
  put: (id, v) => tx('modules', 'readwrite', (s) => (v ? s.put(v, id) : s.delete(id))),
  all: () => tx('modules', 'readonly', (s) => s.getAll()),
  clear: () => tx('modules', 'readwrite', (s) => s.clear())
}

/** Per module: what the page and the badge say ({ text, level, at, error }). */
export const status = {
  get: (id) => tx('status', 'readonly', (s) => s.get(id)).then((x) => x ?? null),
  put: (id, v) => tx('status', 'readwrite', (s) => s.put(v, id)),
  all: async () => {
    const db = await open()
    return new Promise((resolve, reject) => {
      const out = {}
      const req = db.transaction('status').objectStore('status').openCursor()
      req.onsuccess = () => { const c = req.result; if (!c) return resolve(out); out[c.key] = c.value; c.continue() }
      req.onerror = () => reject(req.error)
    })
  },
  clear: () => tx('status', 'readwrite', (s) => s.clear())
}

/** A name for this device in commit messages: what the platform says it is. */
export function deviceName () {
  const ua = globalThis.navigator?.userAgent ?? ''
  if (/Android/i.test(ua)) return 'Android'
  if (/iPhone|iPad/i.test(ua)) return 'iOS'
  if (/Mac/i.test(ua)) return 'Mac'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Linux/i.test(ua)) return 'Linux'
  return 'a device'
}
