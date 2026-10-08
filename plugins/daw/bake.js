//
// THE MUSIC BAKER: a DAW project (.msproj) -> the track the game plays
// (music/NAME.mstk). A baker (docs/PLUGINS.md, Bakers): no DOM, the same bytes
// in a page's Worker and in node.
//
// It is the DAW's own bake (daw/export.js bakeProject), without the audio
// thread: the project as the DAW reads it (ProjectStore.fromJSON), its song
// as the DAW writes it (projectToSmf), and the synth's bakeTrackFromBuffer with
// the bank and kit the project carries -- or the GM ones the DAW falls back to
// -- and its effects with the mastering, exactly as the DAW passes them. The
// wasm is the DAW's own build (app/tool/dist), embedded, so it loads anywhere.
//
import createMidiSynth from './app/tool/dist/midisynth.mjs'
import { ProjectStore } from './app/tool/daw/project.js'
import { projectToSmf } from './app/tool/daw/smf.js'

export const version = '1'

async function readText (rel) {
  const u = new URL(rel, import.meta.url)
  if (u.protocol === 'file:') { const { readFile } = await import('node:fs/promises'); return readFile(u, 'utf8') }
  const r = await fetch(u)
  if (!r.ok) throw new Error(`${r.status} ${u.pathname}`)
  return r.text()
}

let synth = null
let gm = null
async function engine () {
  if (!synth) {
    const mod = await createMidiSynth()
    synth = { mod, s: new mod.WebSynth() }
  }
  if (!gm) gm = { bank: JSON.parse(await readText('./app/content/patches/gm_bank.json')), kit: JSON.parse(await readText('./app/content/drums/gm_kit.json')) }
  return synth
}

export async function bake ({ key, bytes }) {
  const p = ProjectStore.fromJSON(new TextDecoder().decode(bytes))
  const { mod, s } = await engine()
  const smf = projectToSmf(p)
  const ptr = s.songBufferPrepare(smf.length)
  mod.HEAPU8.set(smf, ptr)
  const rep = JSON.parse(s.bakeTrackFromBuffer(
    JSON.stringify(p.bank || gm.bank), JSON.stringify(p.kit || gm.kit),
    JSON.stringify({ ...p.fx, master: p.master }), key, 0))
  if (!rep.ok) throw new Error((rep.errors ?? [rep.error ?? 'the synth refused the song']).map((e) => e.text ?? e).join('; '))
  const size = s.bakedTrackSize()
  const out = new Uint8Array(size)
  out.set(new Uint8Array(mod.HEAPU8.buffer, s.bakedTrackPtr(), size))
  return { files: { [`music/${key}.mstk`]: out }, meta: { bytes: size }, problems: (rep.warnings ?? []).map((w) => w.text ?? String(w)) }
}
