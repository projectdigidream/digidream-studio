//
// ThreeSprite in the suite: its VS Code host protocol (vscode/src/protocol.ts in
// ThreeSprite), spoken by the suite. ThreeSprite already knows how to be
// handed a .tsprite, report edits and give its bytes back when the file
// belongs to someone else -- VS Code -- so the suite plays VS Code:
//
//   suite init{payload}      -> init{body: base64, path}     (empty payload = a new sprite)
//   suite request-save       -> getBytes{id} ... bytes{id}  -> content{payload}
//   ThreeSprite edit         -> dirty + a draft (its bytes, at most every 2.5 s)
//   ThreeSprite save (⌘S)    -> a draft: Back to studio is what saves
//   suite saved              -> saved (ThreeSprite marks itself clean)
//
// A classic script, run before the app: acquireVsCodeApi must exist when
// ThreeSprite's bundle looks for it.
//
(function () {
  const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s) }
  const unb64 = (s) => { const b = atob(s); const o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o }
  const toApp = (data) => window.dispatchEvent(new MessageEvent('message', { data }))

  let appReady = false
  let pendingInit = null
  // Until the suite's document is in, ThreeSprite shows a blank project of its
  // own; a veil keeps anyone from drawing on it and losing the work.
  const veil = document.createElement('div')
  veil.textContent = 'opening…'
  veil.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:#181c26;color:#8fa3c0;font:13px ui-monospace,Menlo,monospace'
  let veiled = true
  const unveil = () => { veiled = false; veil.remove() }
  const deliver = (msg) => { toApp(msg); setTimeout(unveil, 0) }
  let nextId = 1
  const waiting = new Map()
  let suite = null
  let draftTimer = null

  const getBytes = () => new Promise((resolve, reject) => {
    const id = nextId++
    waiting.set(id, { resolve, reject })
    toApp({ type: 'getBytes', id })
  })
  const draftSoon = () => {
    if (draftTimer) return
    draftTimer = setTimeout(async () => { draftTimer = null; try { suite?.draft(await getBytes()) } catch {} }, 2500)
  }

  // The suite's tests drive ThreeSprite's store directly (its own smoke
  // scripts do the same): exposed only when the suite's dev switch is on.
  try { if (localStorage.getItem('dnp.studio.devPlugins') === '1') window.__THREESPRITE_TEST__ = true } catch {}

  // A phone held sideways: ThreeSprite's toolbar is a slimmer line under the
  // studio's own bar (its height is a variable of its stylesheet).
  {
    const css = document.createElement('style')
    css.textContent = '@media (max-height:520px){:root{--toolbar-h:32px!important}}'
    document.head.appendChild(css)
  }

  // Files and the module, through the studio (ThreeSprite's window.threespriteHost):
  // a frame's own file input and download link do nothing in a phone's
  // WebView, and the module's textures and palette come with no file at all.
  let connected
  const suiteReady = new Promise((resolve) => { connected = resolve })
  const ask = async (what, arg, timeout = 15000) => (await suiteReady).query(what, arg, { timeout })
  const LONG = 30 * 60 * 1000 // a person choosing a file
  window.threespriteHost = {
    open: (exts) => ask('import-file', { accept: exts.map((e) => `.${e}`).join(',') }, LONG),
    save: async (name, bytes) => !!(await ask('share', { name, bytes }, LONG)),
    library: {
      textures: async () => (await ask('list', 'file:texture')).map((t) => t.key),
      texture: async (key) => { const p = await ask('read', { kind: 'file:texture', key }); return p instanceof Uint8Array ? p : new TextEncoder().encode(String(p ?? '')) },
      palette: async () => { const p = await ask('palette'); return p ? JSON.stringify(p) : null },
      // the module palette (digidream-palette): opaque #rrggbb, no duplicates
      setPalette: async (name, colors) => {
        const hex = [...new Set(colors.map((c) => '#' + c.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('')))]
        return !!(await ask('set-palette', { format: 'digidream-palette', version: 1, name, colors: hex }))
      }
    }
  }

  // What ThreeSprite says to "VS Code".
  window.acquireVsCodeApi = () => ({
    getState: () => null,
    setState: () => {},
    postMessage (m) {
      if (!m || typeof m.type !== 'string') return
      if (m.type === 'ready') {
        appReady = true
        if (pendingInit) { deliver(pendingInit); pendingInit = null }
      } else if (m.type === 'bytes') {
        const w = waiting.get(m.id)
        waiting.delete(m.id)
        w?.resolve(unb64(m.body))
      } else if (m.type === 'edit') {
        suite?.dirty(true)
        suite?.edit()
        draftSoon()
      } else if (m.type === 'save') {
        draftSoon()
      } else if (m.type === 'error') {
        suite?.error(m.message)
        for (const w of waiting.values()) w.reject(new Error(m.message))
        waiting.clear()
      }
    }
  })

  // The suite's side, through the SDK the vendor step copies beside this file.
  const here = document.currentScript.src
  import(new URL('suite-sdk.js', here).href).then(async ({ inSuite, connectSuite }) => {
    if (!inSuite()) { unveil(); return }
    suite = await connectSuite({
      onInit ({ name, payload }) {
        const bytes = payload instanceof Uint8Array ? payload : new Uint8Array(0)
        const msg = { type: 'init', body: bytes.length ? b64(bytes) : '', path: `${name}.tsprite` }
        if (appReady) deliver(msg); else pendingInit = msg
      },
      onSave: () => getBytes(),
      onRevert ({ payload }) { toApp({ type: 'revert', body: b64(payload) }) },
      onUndo () { toApp({ type: 'undo' }) },
      onRedo () { toApp({ type: 'redo' }) },
      onSaved () { toApp({ type: 'saved' }); suite.dirty(false) },
      // The studio's skin over the tool's own colours (suite-skin.js): its variables, given the skin's tokens.
      onSkin: async (bundle, mode, pointer) => (await import(new URL('suite-skin.js', here).href)).wearSkin(bundle, mode, pointer, { vars: { '--bg': 'color.bg.app', '--bg-2': 'color.bg.panel', '--bg-3': 'color.bg.raised', '--bg-4': 'color.bg.hover', '--fg': 'color.text.primary', '--fg-dim': 'color.text.secondary', '--accent': 'color.accent', '--accent-2': 'color.info', '--danger': 'color.error', '--border': 'color.line.main', '--radius': 'radius.control' } })
    })
    connected(suite)
  })

  // Then ThreeSprite itself: the vendored build's page, its styles and its script.
  fetch('index.html').then((r) => r.text()).then((html) => {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    for (const el of doc.head.querySelectorAll('meta[name=viewport], link[rel=stylesheet], link[rel=icon]')) document.head.appendChild(el.cloneNode(true))
    document.title = doc.title
    document.body.innerHTML = doc.body.innerHTML
    if (veiled) document.body.appendChild(veil)
    for (const s of doc.querySelectorAll('script')) {
      const n = document.createElement('script')
      for (const a of s.attributes) n.setAttribute(a.name, a.value)
      n.textContent = s.textContent
      document.head.appendChild(n)
    }
  })
})()
