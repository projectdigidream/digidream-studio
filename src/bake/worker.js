//
// Where a page's bakes run: off the main thread, so a sheet being composed
// does not stop the studio drawing. One message per bake:
//   in   { id, url, kind, key, bytes }   (url: the baker module)
//   out  { id, ok, files, meta, problems, version } | { id, ok: false, error }
//
const loaded = new Map()

addEventListener('message', async (e) => {
  const { id, url, kind, key, bytes } = e.data
  try {
    if (!loaded.has(url)) loaded.set(url, import(url))
    const baker = await loaded.get(url)
    const r = await baker.bake({ kind, key, bytes })
    const files = r.files ?? {}
    postMessage({ id, ok: true, files, meta: r.meta ?? null, problems: r.problems ?? [], version: baker.version }, Object.values(files).map((b) => b.buffer))
  } catch (err) {
    postMessage({ id, ok: false, error: String(err?.message ?? err) })
  }
})
