//
// qPainter in the suite. qPainter opened with ?host= is a guest that offers
// window.qpainterEmbed (qpainter/src/host.ts): load a texture, take it
// back as a project, hear about edits. This speaks the suite's protocol to it:
//
//   suite init{payload}   -> load(bytes, name)   (a project, a PNG, or empty for a new one)
//   suite request-save    -> bytes()             (always a project: the suite keeps it as
//                                                 the texture's source and bakes the picture)
//   an edit               -> dirty, and a draft at most every 2.5 s
//
(function () {
  // A phone held sideways: qPainter's top row is a slimmer line under the
  // studio's own bar (!important: its stylesheet comes after this one).
  const css = document.createElement('style')
  css.textContent = '@media (max-height:520px){#top{padding:2px 6px!important;gap:4px!important}' +
    '#top button,#top select{padding-top:1px!important;padding-bottom:1px!important}}'
  document.head.appendChild(css)
  const embed = () => new Promise((resolve) => {
    if (window.qpainterEmbed) return resolve(window.qpainterEmbed)
    window.addEventListener('qpainter-embed', () => resolve(window.qpainterEmbed), { once: true })
  })
  const here = document.currentScript.src
  import(new URL('suite-sdk.js', here).href).then(async ({ inSuite, connectSuite }) => {
    if (!inSuite()) return
    let timer = null
    const suite = await connectSuite({
      async onInit ({ name, payload }) {
        const q = await embed()
        // Its exports and palettes, through the studio's own save (the system's
        // dialog in the apps): a download from a frame goes nowhere on a phone.
        q.onSave?.(async (bytes, name) => !!(await suite.query('share', { name, bytes }, { timeout: 30 * 60 * 1000 })))
        // And what it opens, through the studio's file picker: a file input in a frame opens nothing on a phone.
        q.onOpen?.((accept) => suite.query('import-file', { accept }, { timeout: 30 * 60 * 1000 }))
        // The module itself (its palette, its textures; set-palette writes the palette back).
        q.onQuery?.((what, arg) => suite.query(what, arg, { timeout: 30 * 60 * 1000 }))
        await q.load(payload instanceof Uint8Array ? payload : new TextEncoder().encode(payload ?? ''), name)
        q.onChange(() => {
          suite.dirty(true)
          if (timer) return
          timer = setTimeout(async () => { timer = null; suite.draft(await q.bytes()) }, 2500)
        })
      },
      onSave: async () => (await embed()).bytes(),
      // The studio's skin over the tool's own colours (suite-skin.js): its variables, given the skin's tokens.
      onSkin: async (bundle, mode, pointer) => (await import(new URL('suite-skin.js', here).href)).wearSkin(bundle, mode, pointer, { vars: { '--bg': 'color.bg.app', '--panel': 'color.bg.panel', '--line': 'color.line.main', '--fg': 'color.text.primary', '--dim': 'color.text.secondary', '--acc': 'color.accent', '--stage': 'color.bg.sunken' } })
    })
  })
})()
