//
// The shell, if there is one.
//
// A native shell (Electron, Android, iOS) publishes `window.dnp.studio`: a
// handful of Promise-returning calls that write the game tree, restart the
// server on it, and hand files in and out through the platform's own
// picker and save dialog. A plain browser has none of that; it can edit and
// export a pack, and says so where Play would be.
//
// Every shell implements the same seven names. The studio never asks which
// shell it is in, only whether one is there.
//
const native = () => globalThis.dnp?.studio ?? null

export const hasShell = () => native() !== null

export const shell = {
  /** Write a file under the game tree. Path is relative, forward slashes. */
  writeFile: (path, bytes) => native()?.writeFile(path, bytes) ?? Promise.resolve(false),
  readFile: (path) => native()?.readFile(path) ?? Promise.resolve(null),
  listFiles: (prefix) => native()?.listFiles(prefix) ?? Promise.resolve([]),
  deleteFile: (path) => native()?.deleteFile(path) ?? Promise.resolve(false),

  /** Restart the server on a module and load the game page. Never resolves on success: the page changes. */
  launch: (opts) => native()?.launch(opts) ?? Promise.reject(new Error('Play needs the app: in a browser, export a pack and run it with the engine')),

  /**
   * Say which module is open: the shell serves the page the engine's files
   * and that module's only -- modules do not share. A shell without it (an
   * older one, a browser) serves what it always did.
   */
  useModule: (id) => native()?.useModule?.(id) ?? Promise.resolve(false),

  /**
   * A web page, in the system's browser: the app's own window would show it
   * in place of the studio (Android) or as a bare window (desktop). A shell
   * without the call, or a browser: a new tab.
   */
  openUrl: (url) => {
    const n = native()
    if (n?.openUrl) return n.openUrl(url)
    window.open(url, '_blank', 'noopener')
    return Promise.resolve(true)
  },

  /** Give the user a file. In a browser: a download. */
  share: async (name, bytes) => {
    const n = native()
    if (n) return n.share(name, bytes)
    const blob = new Blob([bytes], { type: 'application/zip' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    document.body.appendChild(a)
    a.click()
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 2000)
    return true
  },

  /**
   * Ask for several files at once: [{ name, bytes }], empty when cancelled.
   * Where the shell's picker takes one, it asks for one.
   */
  importFiles: async (accept = '') => {
    const n = native()
    if (n) { if (n.importFiles) return n.importFiles(accept); const one = await n.importFile(accept); return one ? [one] : [] }
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.multiple = true
      if (accept) input.accept = accept
      input.style.display = 'none'
      document.body.appendChild(input)
      input.onchange = async () => {
        const out = []
        for (const f of input.files ?? []) out.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })
        input.remove()
        resolve(out)
      }
      input.oncancel = () => { input.remove(); resolve([]) }
      input.click()
    })
  },

  /** Ask the user for a file: { name, bytes } or null. */
  importFile: async (accept = '') => {
    const n = native()
    if (n) return n.importFile(accept)
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      if (accept) input.accept = accept
      input.style.display = 'none'
      document.body.appendChild(input)
      input.onchange = async () => {
        const f = input.files?.[0]
        input.remove()
        resolve(f ? { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) } : null)
      }
      input.oncancel = () => { input.remove(); resolve(null) }
      input.click()
    })
  }
}
