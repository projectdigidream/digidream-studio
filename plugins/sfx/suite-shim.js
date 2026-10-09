//
// DigidreamSound in the suite. The tool already has a host: its desktop shell,
// `window.digidream` (sound/tool/lib/desktop.js). With one present it starts
// by itself, asks the host for the file it was launched with, and saves
// through it. So the suite is that host:
//
//   suite init{payload}   -> the launched file (onOpenPath, then ready())
//   suite request-save    -> the bank as text (the tool's own writeProj)
//   the store changes     -> dirty, and a draft
//   saved / dispose       -> the tool marks itself saved (no "leave page?")
//
// Its own Save writes a draft: Back to studio is what saves. Loaded first in
// the tool's page (the vendor step puts it there), so `digidream` exists
// before the tool looks.
//
(function () {
  let suite = null
  let openPath = null
  let launched = null
  let haveInit = false
  const waitFor = async (test, ms = 30000) => { const t0 = Date.now(); while (!test()) { if (Date.now() - t0 > ms) throw new Error('the sound tool did not start'); await new Promise((r) => setTimeout(r, 50)) } }
  const proj = () => import(new URL('sfx/proj.js', location.href).href)
  const text = async () => (await proj()).writeProj(globalThis.__sfx.store.doc)

  // In the suite the file is the suite's: nothing to open, and Back to studio
  // saves. Hidden by the tool's own data-act names; the WAV export and the
  // help stay. (The game reads a pack as written, so no .sfxb export either.)
  if (new URLSearchParams(location.search).get('host') === 'suite') {
    const css = document.createElement('style')
    css.textContent = ['open', 'save', 'save-as', 'new', 'load-starter', 'bake'].map((a) => `[data-act="${a}"]`).join(',') + '{display:none!important}' +
      // A phone held sideways: the header is one slim line under the studio's
      // own bar, which already names the tool.
      // (!important: the tool's own stylesheet comes after this one.)
      '@media (max-height:520px){#top{padding:2px 8px!important;gap:6px!important}#brand{display:none!important}' +
      '#play{width:26px!important;height:26px!important;min-height:26px!important;font-size:11px!important}' +
      '#top button{min-height:24px!important;padding-top:2px!important;padding-bottom:2px!important}' +
      '.seg>button{min-height:22px!important;padding:2px 9px!important}}'
    document.head.appendChild(css)
  }

  globalThis.digidream = {
    open: async () => [],
    async save (name, data) {
      // ⌘S inside the tool: kept as a draft, not saved into the module.
      suite?.draft(typeof data === 'string' ? data : new TextDecoder().decode(data))
      return { name, path: name }
    },
    saveMany: async () => null,
    confirm: async (message, detail) => globalThis.confirm(detail ? `${message}\n\n${detail}` : message),
    setDocument () {},
    onMenu () {},
    onOpenPath (fn) { openPath = fn },
    ready: async () => launched
  }

  import(new URL('suite-sdk.js', document.currentScript.src).href).then(async ({ inSuite, connectSuite }) => {
    if (!inSuite()) return
    suite = await connectSuite({
      async onInit ({ name, payload }) {
        const t = typeof payload === 'string' ? payload : new TextDecoder().decode(payload)
        await waitFor(() => globalThis.__sfx && openPath)
        // Listening before the file opens, so the first edit is never missed.
        globalThis.__sfx.store.addEventListener('change', async () => {
          const s = globalThis.__sfx.store
          suite.dirty(s.dirty)
          if (s.dirty) suite.draft(await text())
        })
        if (t) {
          launched = { data: new TextEncoder().encode(t), path: `${name}.sfxproj` }
          await openPath()
        }
        haveInit = true
      },
      async onSave () {
        await waitFor(() => haveInit)
        return text()
      },
      onSaved () { globalThis.__sfx?.store.markSaved(globalThis.__sfx.store.path) },
      onDispose () { globalThis.__sfx?.store.markSaved(globalThis.__sfx.store.path) },
      onUndo () { globalThis.__sfx?.store.undo() },
      onRedo () { globalThis.__sfx?.store.redo() }
    })
  })
})()
