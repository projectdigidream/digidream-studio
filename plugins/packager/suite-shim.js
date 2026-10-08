//
// The packager as a page of the suite. The packager's own host seam
// (packager/src/host.js) is `window.packagerHost`; the suite defines it:
//
//   module()    the module the suite has open, baked and packed as the
//               packager reads one (the suite's `modulePack` query)
//   kitsBase    the engine kits, where the suite's server has them (in a
//               checkout: packager/build/kits, served at /studio/packager-kits/)
//
// Saving stays the packager's own (a download): a page cannot write files
// for the person, and the suite has nothing better to offer it yet.
//
(function () {
  const here = document.currentScript.src
  let connected
  const suite = new Promise((resolve) => { connected = resolve })
  window.packagerHost = {
    kind: 'suite',
    kitsBase: new URL('../../packager-kits/', here).href,
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
