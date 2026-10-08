//
// qPainter in the suite. qPainter opened with ?host= is a guest that offers
// window.qpainterEmbed (textureeditor/src/host.ts): load a texture, take it
// back as a project, hear about edits. This speaks the suite's protocol to it:
//
//   suite init{payload}   -> load(bytes, name)   (a project, a PNG, or empty for a new one)
//   suite request-save    -> bytes()             (always a project: the suite keeps it as
//                                                 the texture's source and bakes the picture)
//   an edit               -> dirty, and a draft at most every 2.5 s
//
(function () {
  const embed = () => new Promise((resolve) => {
    if (window.qpainterEmbed) return resolve(window.qpainterEmbed)
    window.addEventListener('qpainter-embed', () => resolve(window.qpainterEmbed), { once: true })
  })
  import(new URL('suite-sdk.js', document.currentScript.src).href).then(async ({ inSuite, connectSuite }) => {
    if (!inSuite()) return
    let timer = null
    const suite = await connectSuite({
      async onInit ({ name, payload }) {
        const q = await embed()
        await q.load(payload instanceof Uint8Array ? payload : new TextEncoder().encode(payload ?? ''), name)
        q.onChange(() => {
          suite.dirty(true)
          if (timer) return
          timer = setTimeout(async () => { timer = null; suite.draft(await q.bytes()) }, 2500)
        })
      },
      onSave: async () => (await embed()).bytes()
    })
  })
})()
