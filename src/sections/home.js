//
// The module's home: what it is, its maps, and every section of it.
//
// Moved out of main.js as a section of the module (app/router.js); it reaches
// the studio's shared state and verbs through S, given at install.
//
import { newModule } from '../module_emit.js'
import { el, button, row, text, muted, chips, ask } from '../ui.js'
import { moduleProblems } from '../app/problems.js'
import { lastPlay } from '../playlog.js'
import { thumbCanvas } from '../thumbs.js'
import { STUDIO_VERSION } from '../version.js'

let S = null

/** Make a module: a copy of the starter when the app has one, else a blank room. */
async function newModuleFlow () {
  const id = await ask('module id (letters, digits, dashes)', 'my-level')
  if (!id) return
  const clean = id.toLowerCase().replace(/[^a-z0-9_-]/g, '')
  if (!clean) return
  if (await S.store.load(clean)) { S.status(`a module called ${clean} already exists`, 'warn'); return }
  const copied = await S.copyModule('starter', clean, id)
  if (!copied) {
    const rec = { id: clean, module: newModule(clean, id), docs: { first: S.starterDoc('first') }, assets: {} }
    await S.store.save(rec)
  }
  await S.openModule(clean)
  S.status(copied ? `${clean}: a copy of the starter module (prop ids from ${copied.module.propIdBase})` : `${clean}: no starter module here, so a blank room`, 'ok')
}

/**
 * THE MODULE'S HOME: what it is, its maps, and every section of it. On a phone
 * held upright, where there is no rail, this is how the sections are reached.
 */
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

async function showHome () {
  const m = S.module
  const count = (o) => Object.keys(o ?? {}).length
  const maps = Object.keys(S.docs)
  const tile = (id, icon, label, note) => el('button', { class: 'sd-tile', 'data-section': id, onclick: () => S.go(id) },
    [el('span', { class: 'ico', text: icon }), el('span', { class: 'lbl', text: label }), el('span', { class: 'st-muted', text: note })])
  const list = await S.store.list()
  // Left while the list was read (a quick tap, a slow phone's storage): drawn
  // now it would open as a sheet over the section that was gone to.
  if (!S.ui.pageTitles?.test('Home')) return
  S.ui.showSheet('Home', [
    el('div', { class: 'sd-hero' }, [
      el('div', { class: 'sd-hero-name', text: m.name || m.id }),
      el('div', { class: 'st-muted', text: m.about || 'A module: maps, and everything they share.' }),
      el('div', { class: 'st-muted sd-version', 'data-version': STUDIO_VERSION, text: `studio ${STUDIO_VERSION}` }),
      el('div', { class: 'st-row' }, [button('▶ play', () => S.play()), button('⇪ export', () => S.exportPack()), button('⇩ import pack', () => S.importPack()),
        button('+ new module', () => newModuleFlow()),
        el('button', { 'data-section': 'snapshots', text: '🕘 snapshots', onclick: () => S.go('snapshots') }),
        // What the last play-test left to read, when there was one.
        lastPlay() ? el('button', { 'data-section': 'playlog', text: `📋 play log (${String(lastPlay().map).replace(/\.dnpm$/, '')})`, onclick: () => S.go('playlog') }) : null].filter(Boolean))
    ]),
    el('div', { class: 'st-section-head', text: `🗺 maps (${maps.length})` }),
    el('div', { class: 'sd-maps' }, [
      ...maps.map((n) => el('button', { class: 'sd-map', 'data-map': n, onclick: () => S.go('map', n) },
        [thumbCanvas(S.docs[n], { imageFor: S.imageFor }), el('span', { class: 'lbl', text: n }), el('span', { class: 'st-muted', text: `${plural(S.docs[n].order.length, 'room')} · ${plural(S.docs[n].entities.length, 'thing')}` })])),
      el('button', { class: 'sd-map', onclick: () => S.go('maps') }, [el('span', { class: 'lbl', text: 'all maps…' })])
    ]),
    ...problemRows(),
    el('div', { class: 'st-section-head', text: '◆ the module' }),
    el('div', { class: 'sd-tiles' }, [
      tile('monsters', '☠', 'Monsters', `${count(m.mobs?.mobs)}`),
      tile('player', '🧍', 'Player', m.player?.prop ?? 'default'),
      tile('weapons', '🔫', 'Weapons', `${count(m.weapons?.weapons)}`),
      tile('props', '📦', 'Props', `${(m.props ?? []).length}`),
      tile('particles', '✨', 'Particles', `${(m.vfx ?? []).length}`),
      tile('textures', '🧱', 'Textures', `${Object.keys(m.textures ?? {}).length} own`),
      tile('music', '♪', 'Music', `${S.trackNames().length} tracks`),
      tile('sounds', '🔊', 'Sounds', `${(S.moduleSounds ?? []).length}`),
      tile('screens', '▣', 'Screens', m.ui ? 'own' : 'default'),
      tile('scripts', '📜', 'Scripts', `${Object.keys(m.scripts ?? {}).length}`),
      tile('settings', '⚙', 'Settings', m.controls ?? 'platformer')
    ]),
    list.length > 1 ? el('div', { class: 'st-section-head', text: '⇄ other modules' }) : null,
    list.length > 1 ? chips(list.map((r) => ({ id: r.id, label: r.id, on: r.id === S.rec.id })), async (it) => { if (it.id !== S.rec.id) await S.openModule(it.id) }) : null
  ])
}

/** What is wrong anywhere in the module, each line a way to where it is. */
function problemRows () {
  const p = moduleProblems(S)
  const items = [
    ...p.maps.map((x) => ({ go: ['map', x.map], text: `🗺 ${x.map}: ${x.msg}` })),
    ...p.metamap.map((m) => ({ go: ['maps'], text: `▦ metamap: ${m}` })),
    ...p.graphs.map((m) => ({ go: ['graphs'], text: `◇ ${m}` })),
    ...(p.sky ?? []).map((m) => ({ go: ['sky'], text: `🌌 ${m}` })),
    ...(p.player ?? []).map((m) => ({ go: ['player'], text: `🧍 ${m}` })),
    ...(p.textures ?? []).map((m) => ({ go: ['textures'], text: `🧱 ${m}` })),
    ...p.monsters.map((m) => ({ go: ['monsters'], text: `☠ ${m}` })),
    ...p.weapons.map((m) => ({ go: ['weapons'], text: `🔫 ${m}` })),
    ...p.sounds.map((m) => ({ go: ['sounds'], text: `🔊 ${m}` }))
  ]
  if (!items.length) return [el('div', { class: 'st-muted', 'data-problems': '0', text: '✔ nothing wrong that the studio can see' })]
  return [el('div', { class: 'st-section-head', text: `✖ to fix (${items.length})` }),
    ...items.slice(0, 30).map((it) => el('button', { class: 'sd-problem', 'data-problem': it.go[0], onclick: () => S.go(...it.go) }, [el('span', { text: it.text })])),
    items.length > 30 ? muted(`and ${items.length - 30} more`) : null]
}

/** Hand it the studio's state, and publish what others call. */
export function install (s) {
  S = s
  S.showHome = S.sectionAlias('home', showHome)
}
