//
// WHAT AN EDITOR CAN BE GIVEN: the kinds of document in a module, and how the
// studio reads one out and puts one back.
//
// FILE kinds are files the module keeps -- a texture, a sound pack, a sprite
// project -- as bytes in the record's assets. RECORD kinds are entries of the
// module document -- a Lua script, a monster -- as text (JSON for structured
// ones). Either way an editor sees a payload (Uint8Array or string) and hands
// one back; WRITE checks it before anything changes, so a broken document is
// refused while the editor is still open to fix it.
//
// Each kind: { id, label, binary, list(), has(key), read(key) -> { payload, name },
//              write(key, payload) -> { ok, error?, said? } }
// write() changes the record only; the caller makes it one undo step
// (S.moduleChanged) -- frame.js does, on Back.
//
import { packPath } from '../soundpacks.js'
import { toBytes } from './protocol.js'

/**
 * Where a kind's SOURCE lives in the record, for the kinds that are baked:
 * the bakers turn it into what the game loads (bake/). A kind not here is
 * kept as it is (a sound pack is read by the engine as written).
 */
export const SOURCES = {
  'file:texture': { path: (n) => `sources/textures/${n}.texproj.json`, re: /^sources\/textures\/([^/]+)\.texproj\.json$/ },
  'file:tsprite': { path: (n) => `sources/sprites/${n}.tsprite`, re: /^sources\/sprites\/([^/]+)\.tsprite$/ },
  'file:msproj': { path: (n) => `sources/music/${n}.msproj`, re: /^sources\/music\/([^/]+)\.msproj$/ }
}

/** Every baked source in a record's assets: [{ kind, key, path }]. */
export function sourcesIn (assets) {
  const out = []
  for (const path of Object.keys(assets ?? {})) {
    for (const [kind, s] of Object.entries(SOURCES)) {
      const m = s.re.exec(path)
      if (m) out.push({ kind, key: m[1], path })
    }
  }
  return out
}

/** The kinds the studio itself knows; a plugin may declare more of its own. */
export const SUITE_KINDS = ['file:texture', 'file:sfxproj', 'file:tsprite', 'file:msproj', 'record:script', 'record:mob']

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]
export const isPng = (b) => PNG_MAGIC.every((x, i) => b[i] === x)
const text = (p) => (typeof p === 'string' ? p : new TextDecoder().decode(toBytes(p)))

/** The studio's kinds over the state `S` (main.js). */
export function makeKinds (S) {
  const assets = () => (S.rec.assets ??= {})
  const blobBytes = async (path) => {
    const b = assets()[path]
    return b ? new Uint8Array(await b.arrayBuffer()) : null
  }

  const kinds = {
    // A texture: its picture. qPainter's projects come with the texture
    // baker (bake/); a PNG is its own source and is taken as it is.
    'file:texture': {
      label: 'texture',
      binary: true,
      list: () => Object.keys(S.module.textures ?? {}).sort().map((n) => ({ key: n, name: n })),
      has: (n) => !!S.module.textures?.[n],
      async read (n) {
        const src = await blobBytes(`sources/textures/${n}.texproj.json`)
        return { payload: src ?? await blobBytes(`textures/${n}.png`) ?? new Uint8Array(0), name: n }
      },
      async write (n, payload) {
        const bytes = toBytes(payload)
        if (isPng(bytes)) {
          const blob = new Blob([bytes], { type: 'image/png' })
          let bmp
          try { bmp = await createImageBitmap(blob) } catch { return { ok: false, error: 'that is not a PNG the studio can read' } }
          const meta = (S.module.textures ??= {})[n] ?? {}
          S.module.textures[n] = { ...meta, w: bmp.width, h: bmp.height }
          bmp.close?.()
          assets()[`textures/${n}.png`] = blob
          delete assets()[`sources/textures/${n}.texproj.json`]
          if (S.imageUrls.has(n)) URL.revokeObjectURL(S.imageUrls.get(n))
          S.imageUrls.set(n, URL.createObjectURL(blob))
          S.textures?.forget(n)
          return { ok: true, said: `${n} (${S.module.textures[n].w}×${S.module.textures[n].h})` }
        }
        // A project: the source is kept, the picture is baked from it.
        let json
        try { json = JSON.parse(text(bytes)) } catch { return { ok: false, error: 'neither a PNG nor a texture project' } }
        if (!S.bakeSource) return { ok: false, error: 'a texture project needs the texture baker, and this studio has none' }
        const prev = assets()[`sources/textures/${n}.texproj.json`]
        assets()[`sources/textures/${n}.texproj.json`] = new Blob([bytes], { type: 'application/json' })
        const r = await S.bakeSource('file:texture', n)
        if (!r.ok) {
          if (prev) assets()[`sources/textures/${n}.texproj.json`] = prev; else delete assets()[`sources/textures/${n}.texproj.json`]
          return r
        }
        return { ok: true, said: `${n} (${json.w ?? '?'}×${json.h ?? '?'}, from its project)` }
      }
    },

    // A sound pack: a DigidreamSound project, merged with the others into
    // the bank the game plays (soundpacks.js).
    'file:sfxproj': {
      label: 'sound pack',
      binary: false,
      list: () => (S.module.sounds?.packs ?? []).map((p) => ({ key: p.id, name: p.name ?? p.id })),
      has: (id) => !!(S.module.sounds?.packs ?? []).find((p) => p.id === id),
      async read (id) {
        const b = assets()[packPath(id)]
        return { payload: b ? await b.text() : '', name: (S.module.sounds?.packs ?? []).find((p) => p.id === id)?.name ?? id }
      },
      async write (id, payload) {
        const t = text(payload)
        let json
        try { json = JSON.parse(t) } catch (e) { return { ok: false, error: `not a sound project: ${e.message}` } }
        if (!Array.isArray(json.sounds) || !json.sounds.length) return { ok: false, error: 'it defines no sounds' }
        const check = await S.engineAcceptsBank?.(new TextEncoder().encode(t)) ?? { ok: true }
        if (!check.ok) return { ok: false, error: check.why }
        assets()[packPath(id)] = new Blob([t], { type: 'application/json' })
        S.module.sounds ??= { packs: [] }
        let pack = S.module.sounds.packs.find((p) => p.id === id)
        // A pack made in the editor ("+ new sound pack") joins the module here, last.
        if (!pack) S.module.sounds.packs.push(pack = { id, name: json.name ?? id, enabled: true })
        else if (json.name) pack.name = json.name
        S.packs ??= new Map()
        S.packs.set(id, json)
        S.remergePacks?.()
        return { ok: true, said: `${id} (${json.sounds.length} sounds)` }
      }
    },

    // A sprite project and a music project: the sources the module keeps for
    // its sheets and tracks; the bakers make what the game loads.
    'file:tsprite': sourceKind(S, { label: 'sprite', dir: 'sprites', ext: '.tsprite', binary: true, names: () => Object.keys(S.module.sprites ?? {}) }),
    // Music is baked when asked for (the Music page's "bake now") or at Play and
    // Export, not on every save: a song can take a while, and is edited often.
    'file:msproj': sourceKind(S, { label: 'music', dir: 'music', ext: '.msproj', binary: false, names: () => [...(S.trackUrls?.keys() ?? [])], bakeOnSave: false }),

    // The module's own Lua (module.scripts), as text.
    'record:script': {
      label: 'script',
      binary: false,
      list: () => Object.keys(S.module.scripts ?? {}).sort().map((n) => ({ key: n, name: n })),
      has: (n) => (S.module.scripts ?? {})[n] !== undefined,
      read: async (n) => ({ payload: String(S.module.scripts?.[n] ?? ''), name: n }),
      async write (n, payload) {
        (S.module.scripts ??= {})[n] = text(payload)
        return { ok: true, said: `${n} (${text(payload).split('\n').length} lines)` }
      }
    },

    // A monster (module.mobs.mobs[name]), as JSON.
    'record:mob': {
      label: 'monster',
      binary: false,
      list: () => Object.keys(S.module.mobs?.mobs ?? {}).sort().map((n) => ({ key: n, name: n })),
      has: (n) => !!S.module.mobs?.mobs?.[n],
      read: async (n) => ({ payload: JSON.stringify(S.module.mobs?.mobs?.[n] ?? {}, null, 2), name: n }),
      async write (n, payload) {
        let m
        try { m = JSON.parse(text(payload)) } catch (e) { return { ok: false, error: `not JSON: ${e.message}` } }
        if (!m || typeof m !== 'object' || Array.isArray(m)) return { ok: false, error: 'a monster is an object' }
        const problems = S.mobProblems?.(n, m) ?? []
        if (problems.length) return { ok: false, error: problems.slice(0, 3).join('; ') }
        S.module.mobs ??= { missiles: {}, mobs: {} }
        S.module.mobs.mobs[n] = m
        return { ok: true, said: n }
      }
    }
  }
  for (const [id, k] of Object.entries(kinds)) k.id = id
  return kinds
}

/** A kind whose documents are source files under sources/<dir>/, baked into what the game loads. */
function sourceKind (S, { label, dir, ext, binary, names, bakeOnSave = true }) {
  const path = (n) => `sources/${dir}/${n}${ext}`
  return {
    label,
    binary,
    list: () => [...new Set([...names(), ...Object.keys(S.rec.assets ?? {}).filter((p) => p.startsWith(`sources/${dir}/`) && p.endsWith(ext)).map((p) => p.slice(dir.length + 9, -ext.length))])]
      .sort().map((n) => ({ key: n, name: n, source: !!S.rec.assets?.[path(n)] })),
    has: (n) => !!S.rec.assets?.[path(n)] || names().includes(n),
    async read (n) {
      const b = S.rec.assets?.[path(n)]
      if (!b) return { payload: binary ? new Uint8Array(0) : '', name: n }
      return { payload: binary ? new Uint8Array(await b.arrayBuffer()) : await b.text(), name: n }
    },
    async write (n, payload) {
      const assets = (S.rec.assets ??= {})
      const prev = assets[path(n)]
      assets[path(n)] = new Blob([toBytes(payload)], { type: binary ? 'application/octet-stream' : 'application/json' })
      if (!S.bakeSource) return { ok: true, said: `${n} (its source; nothing bakes it in this studio)` }
      if (!bakeOnSave) return { ok: true, said: `${n} (baked at Play, or with "bake now")` }
      const r = await S.bakeSource(`file:${ext.slice(1)}`, n)
      if (!r.ok) { if (prev) assets[path(n)] = prev; else delete assets[path(n)] }
      return r.ok ? { ok: true, said: r.said ?? n } : r
    }
  }
}
