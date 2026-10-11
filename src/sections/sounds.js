//
// Sound effects: the module's sound PACKS, merged into the one bank the game
// plays, heard here, and the names they give every sound field.
//
// A pack is a DigidreamSound project (.sfxproj, docs/SOUNDS.md): recipes, not
// recordings, made in the sound tool. A module may hold several -- DOOM's
// monsters, a UI set, its own -- kept as the sources they were imported as
// (sources/sounds/<id>.sfxproj) and merged in the module's order when it is
// written (soundpacks.js): a name two packs give is the higher pack's, and the
// page says which were dropped. Every pack is checked by the sound engine's
// own loader on import, because JSON that parses is not a bank that plays.
//
import { shell } from '../bridge.js'
import { el, button, muted, toggle, confirmDialog, ask, withIcon, icon } from '../ui.js'
import { mergeBanks, bankNames, packId, packPath } from '../soundpacks.js'
import { editArg } from '../plugins/frame.js'
import { graphsOf } from '../graphs_emit.js'

let S = null

/** The engine that plays sounds here: the client's own Sfx, in its own context. */
async function sfxEngine () {
  if (S.sfx?.ready) return S.sfx
  const { Sfx } = await import('/src/audio/sfx.js')
  S.sfxCtx ??= new AudioContext()
  await S.sfxCtx.resume()
  S.sfx ??= new Sfx({ log: (m) => console.log(m) })
  await S.sfx.attach(S.sfxCtx)
  S.sfx.listener({ x: 0, y: 0, z: 0 }, 0)
  return S.sfx
}

/**
 * Read the module's packs out of the record and merge them: S.packs (id ->
 * parsed project), S.merged (soundpacks.mergeBanks), S.moduleSounds (the
 * merged names). Called when a module opens and whenever its packs change.
 */
async function loadPacks () {
  S.packs = new Map()
  for (const p of S.module.sounds?.packs ?? []) {
    const blob = S.rec.assets?.[packPath(p.id)]
    if (!blob) continue
    try { S.packs.set(p.id, JSON.parse(await blob.text())) } catch (e) { console.warn('[studio] sound pack', p.id, e.message) }
  }
  remerge()
}

function remerge () {
  S.merged = mergeBanks((S.module.sounds?.packs ?? []).map((p) => ({ ...p, json: S.packs?.get(p.id) })))
  S.moduleSounds = bankNames(S.merged.bank)
  if (S.mergedUrl) URL.revokeObjectURL(S.mergedUrl)
  S.mergedUrl = S.merged.bank ? URL.createObjectURL(new Blob([JSON.stringify(S.merged.bank)], { type: 'application/json' })) : null
}

/** The bank the studio plays from: the module's merged packs, else the app's. */
const bankUrl = () => S.mergedUrl ?? '/sounds/bank.sfxproj'

async function hear (name) {
  try {
    const sfx = await sfxEngine()
    await sfx.setBank(bankUrl())
    // The bank loads in the worklet; give it a moment the first time.
    for (let i = 0; i < 60 && !sfx.loaded; i++) await new Promise((r) => setTimeout(r, 50))
    if (!sfx.play(name, { x: 0, y: 0, z: 0 }, { seed: Date.now() })) S.status(`no sound called ${name} in the module's packs`, 'warn')
  } catch (e) { S.status(`sound did not start: ${e.message ?? e}`, 'error') }
}

/** Every sound name the module's monsters, weapons and graphs say, with where. */
function soundsUsed () {
  const used = new Map()
  const note = (n, where) => { if (typeof n === 'string' && n) (used.get(n) ?? used.set(n, new Set()).get(n)).add(where) }
  const walk = (o, where) => {
    if (Array.isArray(o)) { for (const x of o) walk(x, where); return }
    if (!o || typeof o !== 'object') return
    if (o.action === 'sound') note(o.name, where)
    if (typeof o.sound === 'string') note(o.sound, where)
    for (const v of Object.values(o)) walk(v, where)
  }
  const walkGraph = (g, where) => { for (const n of g?.nodes ?? []) if (typeof n.sound === 'string') note(n.sound, where) }
  for (const [n, m] of Object.entries(S.module.mobs?.mobs ?? {})) walk(m, n)
  for (const [n, m] of Object.entries(S.module.mobs?.missiles ?? {})) walk(m, n)
  for (const [n, w] of Object.entries(S.module.weapons?.weapons ?? {})) walk(w, n)
  for (const [n, p] of Object.entries(S.module.weapons?.pickups ?? {})) walk(p, n)
  // The graphs: a play_sound's sound, a typed subtitle's letter sound.
  for (const d of Object.values(S.docs ?? {})) for (const [n, g] of graphsOf(d)) walkGraph(g, `graph ${d.name}.${n}`)
  for (const [n, g] of graphsOf(S.module)) walkGraph(g, `the game's graph ${n}`)
  return used
}

/** Does the sound engine's own loader take this project? { ok, why }. */
async function engineAccepts (bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/json' }))
  try {
    const sfx = await sfxEngine()
    await sfx.setBank(url)
    for (let i = 0; i < 60 && !sfx.loaded; i++) await new Promise((r) => setTimeout(r, 50))
    return { ok: sfx.loaded, why: sfx.loaded ? '' : 'the sound engine did not accept it (see the console)' }
  } catch (e) {
    // No audio here (a test page, a locked-down WebView): the merge still
    // happens, and Play will say what the game's engine thinks.
    console.warn('[studio] could not check the pack with the engine:', e)
    return { ok: true, why: '' }
  } finally {
    URL.revokeObjectURL(url)
    S.sfx?.setBank(bankUrl())
  }
}

/** Import one pack or several. */
async function importPacks () {
  const files = await shell.importFiles('.sfxproj,application/json')
  const added = []
  for (const f of files) {
    let json
    try { json = JSON.parse(new TextDecoder().decode(f.bytes)) } catch (e) { S.status(`${f.name} is not a sound project: ${e.message}`, 'error'); continue }
    if (!bankNames(json).length) { S.status(`${f.name} defines no sounds (a .sfxproj from the sound tool has a "sounds" list)`, 'error'); continue }
    const check = await engineAccepts(f.bytes)
    if (!check.ok) { S.status(`${f.name}: ${check.why}`, 'error'); continue }
    S.module.sounds ??= { packs: [] }
    const id = packId(f.name, S.module.sounds.packs.map((p) => p.id))
    S.rec.assets ??= {}
    S.rec.assets[packPath(id)] = new Blob([f.bytes], { type: 'application/json' })
    S.module.sounds.packs.push({ id, name: json.name ?? id, enabled: true })
    S.packs ??= new Map()
    S.packs.set(id, json)
    added.push(`${id} (${bankNames(json).length})`)
  }
  if (!added.length) return
  remerge()
  S.moduleChanged()
  S.status(`sound pack${added.length > 1 ? 's' : ''} added: ${added.join(', ')}`, 'ok')
  showSounds()
}

function showSounds () {
  const packs = S.module.sounds?.packs ?? []
  const merged = S.merged ?? { origin: {}, collisions: [], warnings: [] }
  const used = soundsUsed()
  const known = new Set(S.soundNames())
  const changed = () => { remerge(); S.moduleChanged(); S.sfx?.setBank(bankUrl()); showSounds() }
  const body = []
  const editor = S.plugins?.editorsFor('file:sfxproj').find((e) => !e.builtin)
  body.push(el('div', { class: 'st-row' }, [
    editor ? button('+ new sound pack', async () => {
      const raw = await ask('the new pack\'s name', 'sounds')
      const id = packId(`${raw ?? ''}.sfxproj`, packs.map((p) => p.id))
      if (!raw || !id) return
      S.go('edit', editArg(editor.key, 'file:sfxproj', id))
    }) : null,
    button('+ import sound packs (.sfxproj)', importPacks)
  ].filter(Boolean)))
  body.push(el('div', { class: 'st-section-head' }, withIcon('section.sounds', `packs, highest first (${packs.length})`)))
  packs.forEach((p, i) => {
    const json = S.packs?.get(p.id)
    const total = bankNames(json).length
    const kept = Object.values(merged.origin).filter((x) => x === p.id).length
    body.push(el('div', { class: 'st-card', 'data-pack': p.id }, [
      el('div', { class: 'st-row' }, [
        el('span', { class: 'st-entry', text: p.name === p.id ? p.id : `${p.name} (${p.id})` }),
        ...(S.editButtons?.('file:sfxproj', p.id) ?? []),
        i > 0 ? button(withIcon('action.up'), () => { [packs[i - 1], packs[i]] = [packs[i], packs[i - 1]]; changed() }) : null,
        i < packs.length - 1 ? button(withIcon('action.down'), () => { [packs[i + 1], packs[i]] = [packs[i], packs[i + 1]]; changed() }) : null,
        button(withIcon('action.close'), async () => {
          if (!await confirmDialog(`remove the pack ${p.id}? Its sounds go silent unless another pack has them.`)) return
          packs.splice(i, 1); delete S.rec.assets[packPath(p.id)]; S.packs?.delete(p.id); changed()
        }, 'st-danger')
      ].filter(Boolean)),
      toggle('in the game', p.enabled !== false, (v) => { p.enabled = v; changed() }),
      muted(p.enabled === false ? `${total} sounds, switched off` : `${total} sounds${kept < total ? `, ${total - kept} given by a pack above` : ''}`)
    ]))
  })
  if (!packs.length) body.push(muted(`No packs of the module's own${S.servedSounds?.length ? `; until there are, the app's ${S.servedSounds.length} sounds are offered` : ''}.`))
  if (merged.collisions.length) {
    body.push(el('div', { class: 'st-warn-box', text: `In more than one pack -- the higher one's is kept: ${merged.collisions.map((c) => `${c.name} (${c.kept} over ${c.dropped.join(', ')})`).join('; ')}` }))
  }
  for (const w of merged.warnings) body.push(el('div', { class: 'st-warn-box', text: w }))
  const missing = [...used.keys()].filter((n) => !known.has(n))
  if (missing.length) body.push(el('div', { class: 'st-danger st-problem', text: `Named but in no pack (silent in the game): ${missing.map((n) => `${n} (${[...used.get(n)].join(', ')})`).join('; ')}` }))

  // Every sound, by pack, with a ▶ and who uses it.
  const names = S.moduleSounds?.length ? S.moduleSounds : (S.servedSounds ?? [])
  const byPack = new Map()
  for (const n of names) { const k = merged.origin[n] ?? 'the app'; (byPack.get(k) ?? byPack.set(k, []).get(k)).push(n) }
  for (const [k, list] of byPack) {
    body.push(el('div', { class: 'st-section-head' }, withIcon('action.expand', `${k} (${list.length})`)))
    for (const n of list) {
      const by = used.get(n)
      body.push(el('div', { class: 'st-row', 'data-sound': n }, [
        el('span', { class: 'st-entry', text: n }),
        by ? el('span', { class: 'st-muted', text: [...by].join(', ') }) : null,
        button(withIcon('transport.play'), () => hear(n))
      ].filter(Boolean)))
    }
  }
  body.push(muted('Make and edit packs in the sound tool (sound/tool/sfx.html). A sound is its name -- weapon.shotgun.fire, monster.imp.sight -- and every sound field in the monsters and weapons offers these, grouped by pack, with a ▶.'))
  S.ui.showSheet('Sounds', body.filter(Boolean))
}

/** Hand it the studio's state, and publish what others call. */
export function install (s) {
  S = s
  S.hear = hear
  S.loadPacks = loadPacks
  // For the plugins (plugins/kinds.js): a pack an editor hands back is checked
  // by the engine's own loader and merged like an imported one.
  S.remergePacks = remerge
  S.engineAcceptsBank = engineAccepts
  S.soundsUsed = soundsUsed
  S.soundsByPack = () => {
    const merged = S.merged ?? { origin: {} }
    const out = new Map()
    for (const n of (S.moduleSounds?.length ? S.moduleSounds : (S.servedSounds ?? []))) {
      const k = merged.origin[n] ?? 'the app'
      ;(out.get(k) ?? out.set(k, []).get(k)).push(n)
    }
    return out
  }
  S.showSounds = S.sectionAlias('sounds', showSounds)
}
