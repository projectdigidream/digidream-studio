//
// The soundtrack: baked tracks in the module, cues per map, and a way to hear them.
//
// Moved out of main.js as a section of the module (app/router.js); it reaches
// the studio's shared state and verbs through S, given at install.
//
import { shell } from '../bridge.js'
import { el, button, row, text, muted, select, ask, confirmDialog } from '../ui.js'

let S = null

// --- the soundtrack: baked tracks in the module, cues per map, and a way to hear them ------------
//
// A track is a .mstk the synth project bakes (midisynth/docs/TRACK_FORMAT.md):
// the song, its instruments and its loop points in one sealed file. The game
// finds a map's music by the map's name in assets/music/index.json, which the
// emitter writes from doc.music (module_emit.js).
async function importTrack () {
  const f = await shell.importFile('.mstk,application/octet-stream')
  if (!f) return null
  const name = f.name.replace(/\.mstk$/i, '').toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 40)
  if (!name) { S.status('the file needs a name made of letters and digits', 'error'); return null }
  if (f.bytes.length < 16 || String.fromCharCode(...f.bytes.slice(0, 4)) !== 'MSTK') { S.status(`${f.name} is not a baked track (.mstk from the synth's Bake)`, 'error'); return null }
  const blob = new Blob([f.bytes], { type: 'application/octet-stream' })
  S.rec.assets ??= {}
  S.rec.assets[`music/${name}.mstk`] = blob
  if (S.trackUrls.has(name)) URL.revokeObjectURL(S.trackUrls.get(name))
  S.trackUrls.set(name, URL.createObjectURL(blob))
  S.save()
  S.status(`track ${name} added (${(f.bytes.length / 1024).toFixed(0)} KB)`, 'ok')
  return name
}

function trackNames () { return [...S.trackUrls.keys()].sort() }

/** Hear a track here, through the same synth the game uses. */
async function listen (name) {
  const url = S.trackUrls.get(name)
  if (!url) { S.status(`no track called ${name}`, 'warn'); return }
  if (!S.music) {
    const { Music } = await import('/src/audio/music.js')
    S.music = new Music({ log: (m) => console.log(m) })
  }
  try { await S.music.start() } catch (e) { S.status(`the synth did not start: ${e.message ?? e}`, 'error'); return }
  await S.music.play(url, { loop: true, fadeMs: 0 })
  S.status(`♪ ${name}`, 'ok')
  if (soundtrackOpen()) showMusic()
}

const soundtrackOpen = () => S.route() === 'music'

function stopListening () {
  S.music?.stop()
  S.status('♪ stopped', 'ok')
  if (soundtrackOpen()) showMusic()
}

function showMusic () {
  S.doc.music ??= {}
  const tracks = trackNames()
  const playing = (t) => !!S.music?.current && S.music.current === S.trackUrls.get(t)
  const usedBy = (t) => Object.values(S.docs).reduce((n, d) => n + Object.values(d.music ?? {}).filter((x) => x === t).length, 0)
  const cueRows = Object.entries(S.doc.music).map(([cue, track]) => el('div', { class: 'st-row', 'data-cue': cue }, [
    el('span', { class: 'st-entry', text: cue }),
    select('', track, [['', '(choose a track)'], ...tracks], (v) => { if (v) S.doc.music[cue] = v; else delete S.doc.music[cue]; S.commit(); showMusic() }).lastChild,
    button(playing(track) ? '■' : '▶', () => (playing(track) ? stopListening() : listen(track))),
    button('✕', () => { delete S.doc.music[cue]; S.commit(); showMusic() })
  ]))
  const trackRows = tracks.map((t) => el('div', { class: 'st-trow', 'data-track': t }, [
    el('div', { class: 'st-trow-text' }, [
      el('div', { class: 'st-trow-name', text: t }),
      el('div', { class: 'st-muted', text: `${(S.rec.assets[`music/${t}.mstk`].size / 1024).toFixed(0)} KB · in ${usedBy(t)} cue(s)` })
    ]),
    button(playing(t) ? '■' : '▶', () => (playing(t) ? stopListening() : listen(t))),
    button('✕', async () => {
      const n = usedBy(t)
      if (!await confirmDialog(`delete track ${t}?${n ? ` ${n} cue(s) use it; they go too.` : ''}`)) return
      if (playing(t)) stopListening()
      delete S.rec.assets[`music/${t}.mstk`]
      URL.revokeObjectURL(S.trackUrls.get(t)); S.trackUrls.delete(t)
      for (const d of Object.values(S.docs)) for (const [cue, x] of Object.entries(d.music ?? {})) if (x === t) delete d.music[cue]
      S.commit(); S.moduleChanged(); showMusic()
    }, 'st-danger')
  ]))
  S.ui.showSheet('Soundtrack', [
    el('div', { class: 'st-section-head', text: `♪ ${S.docName}: cues` }),
    ...cueRows,
    cueRows.length ? null : muted('No music for this map yet. The game starts the cue called default; a script can switch to another.'),
    button('+ cue', async () => {
      const raw = await ask('cue name', S.doc.music.default ? 'fight' : 'default')
      const cue = String(raw ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '')
      if (!cue) return
      if (S.doc.music[cue]) { S.status(`there is a cue called ${cue} already`, 'warn'); return }
      S.doc.music[cue] = tracks[0] ?? ''
      S.commit(); showMusic()
    }),
    el('div', { class: 'st-section-head', text: '♫ tracks in the module' }),
    ...trackRows,
    trackRows.length ? null : muted('No tracks yet. Bake one in the synth project (midisynth/tool/daw.html, "Bake .mstk") and import it here.'),
    button('+ import track (.mstk)', async () => {
      const n = await importTrack()
      if (!n) return
      if (!S.doc.music.default) { S.doc.music.default = n; S.commit() }
      showMusic()
    }),
    S.music ? muted(S.music.health() ?? 'synth starting…') : null,
    muted('Cues cut from one parent track crossfade into each other; unrelated tracks swap. Every map of the module keeps its own cues.')
  ])
}

/** Hand it the studio's state, and publish what others call. */
export function install (s) {
  S = s
  S.trackNames = trackNames
  S.importTrack = importTrack
  S.listen = listen
  S.stopListening = stopListening
  S.showMusic = S.sectionAlias('music', showMusic)
}
