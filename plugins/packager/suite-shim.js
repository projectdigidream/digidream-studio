//
// The packager as a page of the suite. The packager's own host seam
// (packager/src/host.js) is `window.packagerHost`; the suite defines it:
//
//   module()    the module the suite has open, baked and packed as the
//               packager reads one (the suite's `modulePack` query)
//   kitsBase    the engine kits, where the suite's server has them (in a
//               checkout: packager/build/kits, served at /studio/packager-kits/)
//
//   save()      the finished APK or app, handed to the studio (its `share`
//               query), which saves it where its own Export does: the system's
//               save dialog in the apps, a download in a browser. The
//               packager's own fallback is a download link, which an Android
//               WebView ignores -- the file went nowhere.
//
(function () {
  const here = document.currentScript.src
  let connected
  const suite = new Promise((resolve) => { connected = resolve })
  window.packagerHost = {
    kind: 'suite',
    kitsBase: new URL('../../packager-kits/', here).href,
    save: async (bytes, name) => {
      const s = await suite
      // Long: the user is choosing where it goes.
      const ok = await s.query('share', { name, bytes }, { timeout: 30 * 60 * 1000 })
      return ok ? name : 'nowhere (cancelled)'
    },
    module: async () => {
      const s = await suite
      const zip = await s.query('modulePack', null, { timeout: 120000 })
      return zip instanceof Uint8Array ? zip : new Uint8Array(zip)
    }
  }
  import(new URL('suite-sdk.js', here).href).then(async ({ inSuite, connectSuite }) => {
    if (!inSuite()) return
    connected(await connectSuite({}))
  })
})()
