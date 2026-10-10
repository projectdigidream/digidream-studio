//
// The DAW in the suite. Like the sound tool, the DAW has a desktop host
// (`window.digidream`, its lib/desktop.js): with one present it hides its own
// File menu, starts by itself and opens the file it was launched with. The
// suite is that host:
//
//   suite init{payload}   -> the launched .msproj (launchFile / ready()); empty = a new song
//   suite request-save    -> the project as the DAW writes it (store.toJSON)
//   setDocument{dirty}    -> dirty, and a draft at most every 2.5 s
//   saved / dispose       -> the project marked clean (no "leave page?")
//
// Loaded first in a copy of the DAW's page (the vendor step puts it there).
//
(function () {
  // A phone held sideways (the DAW's own short-screen layout, tightened under
  // the studio's bar): the tabs thinner, the Track tab's tools one row that
  // scrolls sideways (the touch hints at its end), and the piano roll the
  // rest of the screen -- it ran under the log line before. The roll's canvas
  // takes whatever height its CSS gives it. !important: the DAW's stylesheet
  // comes after this one.
  const css = document.createElement('style')
  css.textContent = '@media (max-height:520px){' +
    'nav.tabs{padding:2px 8px 0!important}nav.tabs button{padding:3px 12px!important}' +
    '#tab-track>.toolbar{flex-wrap:nowrap!important;overflow-x:auto!important;scrollbar-width:none;gap:6px!important;margin-bottom:4px!important}' +
    '#tab-track>.toolbar::-webkit-scrollbar{display:none}#tab-track>.toolbar>*{flex:none!important}' +
    '#tab-track>.toolbar .touch-hint{order:99}' +
    '#roll{height:calc(100vh - 118px)!important;min-height:140px}}'
  document.head.appendChild(css)
  let suite = null
  let gotInit
  const init = new Promise((resolve) => { gotInit = resolve })
  let timer = null
  const daw = () => globalThis.__daw
  const json = () => { daw()?.ctx?.editor?.applyNow?.(); return daw().store.toJSON() }

  globalThis.digidream = {
    open: async () => [],
    async save (name, data) {
      suite?.draft(typeof data === 'string' ? data : new TextDecoder().decode(data))
      return { name, path: name }
    },
    saveMany: async () => null,
    confirm: async (message, detail) => globalThis.confirm(detail ? `${message}\n\n${detail}` : message),
    setDocument (doc) {
      if (!suite) return
      suite.dirty(!!doc.dirty)
      if (!doc.dirty || timer) return
      timer = setTimeout(() => { timer = null; try { suite.draft(json()) } catch {} }, 2500)
    },
    onMenu () {},
    onOpenPath () {},
    // The DAW asks for the file it was launched with while it boots: the
    // suite's document, as soon as the suite has sent it.
    ready: async () => {
      const { name, text } = await init
      return text ? { name: `${name}.msproj`, path: `${name}.msproj`, data: new TextEncoder().encode(text) } : null
    }
  }

  const here = document.currentScript.src
  import(new URL('suite-sdk.js', here).href).then(async ({ inSuite, connectSuite }) => {
    if (!inSuite()) { gotInit({ name: '', text: '' }); return }
    suite = await connectSuite({
      onInit ({ name, payload }) {
        gotInit({ name, text: typeof payload === 'string' ? payload : new TextDecoder().decode(payload ?? new Uint8Array(0)) })
      },
      async onSave () {
        await init
        const t0 = Date.now()
        while (!daw()?.store) { if (Date.now() - t0 > 30000) throw new Error('the DAW did not start'); await new Promise((r) => setTimeout(r, 50)) }
        return json()
      },
      onSaved () { if (daw()?.store) daw().store.dirty = false },
      onDispose () { if (daw()?.store) daw().store.dirty = false },
      onUndo () { daw()?.store.undo?.() },
      onRedo () { daw()?.store.redo?.() },
      // The studio's skin over the tool's own colours (suite-skin.js): its variables, given the skin's tokens.
      onSkin: async (bundle, mode, pointer) => (await import(new URL('suite-skin.js', here).href)).wearSkin(bundle, mode, pointer, { vars: { '--bg': 'color.bg.app', '--panel': 'color.bg.panel', '--panel2': 'color.bg.raised', '--edge': 'color.line.main', '--text': 'color.text.primary', '--dim': 'color.text.secondary', '--accent': 'color.accent', '--accent2': 'color.accentHover', '--good': 'color.ok', '--warn': 'color.warn', '--bad': 'color.error', '--wave': 'color.wave', '--rec': 'color.error' } })
    })
  })
})()
