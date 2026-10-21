//
// The module's home: what it is, its maps, and every section of it.
//
// Moved out of main.js as a section of the module (app/router.js); it reaches
// the studio's shared state and verbs through S, given at install.
//
import { newModule, cleanId } from '../module_emit.js'
import { moduleProps } from '../props.js'
import { el, button, row, text, muted, chips, ask, icon, withIcon } from '../ui.js'
import { moduleProblems } from '../app/problems.js'
import { lastPlay } from '../playlog.js'
import { thumbCanvas } from '../thumbs.js'
import { lookCard } from './look.js'
import { STUDIO_VERSION } from '../version.js'
import { startMapOf } from '../startmap.js'
import { checkForUpdate, skipped, skipVersion, apkUrl } from '../updates.js'
import { shell } from '../bridge.js'
import { choose } from '../plugins/frame.js'
import { giveWeaponLook } from '../placeholders.js'
import { newArsenal } from '../weapons_emit.js'
import { WEAPON_RECIPES } from '../editors/recipes.js'

let S = null
// Home's "delete a module…" open: the other modules each with a delete button.
let deletingModules = false

/**
 * Make a module: a copy of the starter template -- the starter as this studio
 * version shipped it, which nothing can edit -- else a blank room.
 */
async function newModuleFlow () {
  const id = await ask('module id (letters, digits, dashes)', 'my-level')
  if (!id) return
  // Accents come off ("île" -> "ile"); a letter with no plain spelling is
  // shown, and the id asked again, rather than dropped unseen.
  let { id: clean, dropped } = cleanId(id)
  if (dropped.length) {
    const again = await ask(`An id is a-z, 0-9, _ and -: ${dropped.join(' ')} cannot be in it. Type the id again`, clean || 'my-level')
    if (!again) return
    ;({ id: clean, dropped } = cleanId(again))
    if (dropped.length) { S.status(`${dropped.join(' ')} cannot be in an id: not made`, 'warn'); return }
  }
  if (!clean) return
  if (await S.store.load(clean)) { S.status(`a module called ${clean} already exists`, 'warn'); return }
  const kind = await choose('What kind of game is it?', [
    { label: 'first person: a shooter', value: 'fps' }, { label: 'a platformer, seen from outside', value: 'platformer' }, { label: 'cancel', value: null }])
  if (!kind) return
  const made = await S.newFromTemplate(clean, id)
  if (!made) {
    const rec = { id: clean, module: newModule(clean, id), docs: { first: S.starterDoc('first', { fresh: true }) }, assets: {} }
    await S.store.save(rec)
  }
  await S.openModule(clean)
  setUpNewModule(kind)
  S.status(made ? `${clean}: made from the starter template (prop ids from ${made.module.propIdBase})` : `${clean}: the starter template could not be read, so a blank room`, made ? 'ok' : 'warn')
}

/**
 * A new module made the author's own: none of the starter's words, the game
 * kind asked for, and a clean screen in the game (no debug numbers). First
 * person also starts with a gun in hand, drawn with the studio's placeholder
 * until it has pictures.
 */
function setUpNewModule (kind) {
  const m = S.module
  m.about = ''
  m.controls = kind
  m.debug = false
  if (kind === 'fps') {
    m.weapons ??= newArsenal()
    if (!Object.keys(m.weapons.weapons ?? {}).length) {
      const r = WEAPON_RECIPES.pistol
      const pool = Object.keys(m.weapons.ammo ?? {})[0]
      m.weapons.weapons.gun = { label: 'Gun', order: 1, initial: 'draw', phases: r.phases(null), ...(pool ? { ammo: pool, per: r.per } : {}) }
      giveWeaponLook(S, 'gun')
      // the starter's own effects when it has them, plain to see: 20 a muzzle
      // flash, 21 a tracer, 22 sparks where it hits (the engine's own were
      // too small to tell a shot had been fired)
      const has = (id) => (m.vfx ?? []).some((v) => Number(v.id) === id)
      for (const p of m.weapons.weapons.gun.phases.fire?.sequence ?? []) {
        if (p.action === 'hitscan') { if (has(21)) p.tracer = 21; if (has(22)) p.hit_vfx = 22 }
        if (p.action === 'vfx' && has(20)) p.effect = 20
      }
    }
    // the keys it shows as it starts are a first person's: on a computer, and
    // on a touch screen, where the controls are first person's too (touch_fps)
    // (the starter's 'controls' panel, which its welcome graph opens: an author edits it on the Panels page)
    const decor = (id) => (m.panels?.controls?.decor ?? []).find((d) => d.id === id)
    const keys = decor('keys'); const touch = decor('keys_touch')
    if (keys) keys.text = 'WASD walk | mouse look | click or F fire | SPACE jump | E use'
    if (touch) touch.text = 'left thumb walks | drag to look | the buttons on the right: FIRE, JUMP, USE'
  }
  S.save()
  S.redraw?.()
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
  const tile = (id, label, note) => el('button', { class: 'sd-tile', 'data-section': id, onclick: () => S.go(id) },
    [icon(`section.${id}`, 'ico'), el('span', { class: 'lbl', text: label }), el('span', { class: 'st-muted', text: note })])
  const list = await S.store.list()
  // Left while the list was read (a quick tap, a slow phone's storage): drawn
  // now it would open as a sheet over the section that was gone to.
  if (!S.ui.pageTitles?.test('Home')) return
  S.ui.showSheet('Home', [
    el('div', { class: 'sd-hero' }, [
      el('div', { class: 'sd-hero-name', text: m.name || m.id }),
      el('div', { class: 'st-muted', text: m.about || 'A module: maps, and everything they share.' }),
      el('div', { class: 'st-row sd-version-row' }, [
        el('span', { class: 'st-muted sd-version', 'data-version': STUDIO_VERSION, text: `studio ${STUDIO_VERSION}` }),
        el('button', { class: 'sd-check-update', 'data-action': 'check-update', onclick: (e) => checkNow(e.currentTarget) }, 'check for updates'),
        // A plugin's word on this module (a sync's state), kept current by main.js.
        syncBadge(m.id)
      ]),
      ...updateRows(),
      el('div', { class: 'st-row' }, [button(withIcon('transport.play', `play from ${startMapOf(m, maps) ?? 'the start'}`), () => S.play({ start: startMapOf(m, maps) })), button(withIcon('action.export', 'export'), () => S.exportPack()), button(withIcon('action.import', 'import pack'), () => S.importPack()),
        button(withIcon('action.add', 'new module'), () => newModuleFlow()),
        el('button', { 'data-section': 'snapshots', onclick: () => S.go('snapshots') }, withIcon('section.snapshots', 'snapshots')),
        el('button', { 'data-section': 'plugins', onclick: () => S.go('plugins') }, withIcon('section.plugins', `plugins (${S.plugins?.list().filter((p) => !p.manifest.hidden).length ?? 0})`)),
        // What the last play-test left to read, when there was one.
        lastPlay() ? el('button', { 'data-section': 'playlog', onclick: () => S.go('playlog') }, withIcon('section.playlog', `play log (${String(lastPlay().map).replace(/\.dnpm$/, '')})`)) : null].filter(Boolean))
    ]),
    el('div', { class: 'st-section-head' }, withIcon('section.maps', `maps (${maps.length})`)),
    el('div', { class: 'sd-maps' }, [
      ...maps.map((n) => el('button', { class: 'sd-map', 'data-map': n, onclick: () => S.go('map', n) },
        [thumbCanvas(S.docs[n], { imageFor: S.imageFor, skin: S.skin }), el('span', { class: 'lbl', text: n }), el('span', { class: 'st-muted', text: `${plural(S.docs[n].order.length, 'room')} · ${plural(S.docs[n].entities.length, 'thing')}` })])),
      el('button', { class: 'sd-map', onclick: () => S.go('maps') }, [el('span', { class: 'lbl', text: 'all maps…' })])
    ]),
    ...problemRows(),
    el('div', { class: 'st-section-head' }, withIcon('section.home', 'the module')),
    el('div', { class: 'sd-tiles' }, [
      tile('monsters', 'Monsters', `${count(m.mobs?.mobs)}`),
      tile('player', 'Player', m.player?.prop ?? 'default'),
      tile('weapons', 'Weapons', `${count(m.weapons?.weapons)}`),
      // the props page's own count: bodies no monster uses (a monster's body is the monster's)
      tile('props', 'Props', `${moduleProps(m).length}`),
      tile('particles', 'Particles', `${(m.vfx ?? []).length}`),
      tile('textures', 'Textures', `${Object.keys(m.textures ?? {}).length} own`),
      tile('music', 'Music', `${S.trackNames().length} tracks`),
      tile('sounds', 'Sounds', `${(S.moduleSounds ?? []).length}`),
      tile('screens', 'Screens', m.ui ? 'own' : 'default'),
      tile('scripts', 'Scripts', `${Object.keys(m.scripts ?? {}).length}`),
      tile('settings', 'Settings', m.controls ?? 'platformer')
    ]),
    // The example projects, each opened as a module of the user's own.
    el('div', { class: 'st-section-head' }, withIcon('section.home', 'examples')),
    ...S.examples.map((ex) => el('div', { class: 'st-row', 'data-example': ex.id }, [
      button(withIcon('action.open', ex.name), () => S.openExample(ex.id)),
      list.some((r) => r.id === ex.id) ? button('a fresh copy', () => S.openExample(ex.id, { fresh: true })) : null,
      muted(ex.about)
    ].filter(Boolean))),
    // The style the studio wears, chosen (or brought in) here as well as in Settings.
    lookCard(S, showHome, { title: 'Style', about: false }),
    list.length > 1 ? el('div', { class: 'st-section-head' }, withIcon('action.swap', 'other modules')) : null,
    list.length > 1 ? chips(list.map((r) => ({ id: r.id, label: S.moduleBadge?.(r.id)?.text ? `${r.id} · ${S.moduleBadge(r.id).text}` : r.id, on: r.id === S.rec.id })), async (it) => { if (it.id !== S.rec.id) await S.openModule(it.id) }) : null,
    // Taking one off the device: each OTHER module, behind a tap that says what it is for.
    list.length > 1 ? el('div', { class: 'st-row', 'data-delete-modules': '1' }, deletingModules
      ? [...list.filter((r) => r.id !== S.rec.id).map((r) => button(withIcon('action.delete', `delete ${r.id}`), async () => { if (await S.deleteModule(r.id)) { deletingModules = false; showHome() } }, 'st-danger')),
          button('done', () => { deletingModules = false; showHome() })]
      : [button(withIcon('action.delete', 'delete a module…'), () => { deletingModules = true; showHome() })]) : null
  ])
}

/** What is wrong anywhere in the module, each line a way to where it is. */
// The badge a plugin set for a module: a dot and its words. Always drawn
// (hidden when empty) so main.js can fill it in place as the state changes.
export function syncBadge (id) {
  const b = S.moduleBadge?.(id)
  const level = b?.level && b.level !== 'info' ? ` ui-dot--${b.level}` : ''
  const node = el('span', { class: 'sd-sync st-muted', 'data-badge-module': id, 'data-status-level': b?.level ?? 'info' }, [el('span', { class: `ui-dot${level}` }), el('span', { class: 'sd-sync-text', text: b?.text ?? '' })])
  node.hidden = !b?.text
  return node
}

// A NEWER STUDIO, when there is one (updates.js; main.js asks at boot): what
// it is, what changed, and the way to it. "Not now" keeps it away until a
// later one is out.
function updateRows () {
  const u = S.update
  if (!u || u.state !== 'newer' || skipped() === u.latest) return []
  return [el('div', { class: 'st-card sd-update', 'data-update': u.latest }, [
    el('div', { class: 'lbl', text: `Studio ${u.latest} is out (you have ${u.current})` }),
    u.notes.length ? el('ul', { class: 'sd-update-notes' }, u.notes.map((n) => el('li', { class: 'st-muted', text: n }))) : null,
    el('div', { class: 'st-row' }, [
      selfUpdateButton(u),
      button(withIcon('action.export', 'download'), () => shell.openUrl(u.url)),
      button('not now', () => { skipVersion(u.latest); S.router?.remount?.() })
    ])
  ].filter(Boolean))]
}

// ON ANDROID the newer APK installs over the studio (the shell's selfUpdate).
// Which newer one is updates.js's: a stable build is only ever offered a
// stable release, a dev build the newest of either. The first time, Android's
// "install unknown apps" switch opens instead, and the button asks to be
// pressed again.
function selfUpdateButton (u) {
  const n = globalThis.dnp?.studio
  const url = apkUrl(u, S.bundledPlugins > 0)
  if (!n?.selfUpdate || !url) return null
  const b = button(withIcon('action.export', 'update now'), async () => {
    b.disabled = true
    b.textContent = 'downloading…'
    globalThis.__dnpSelfUpdateFailed = (msg) => { b.disabled = false; b.textContent = `update failed: ${msg} (try again)` }
    try {
      const r = await n.selfUpdate(url)
      b.disabled = r === 'installing'
      b.textContent = r === 'settings' ? 'allow installs, then press again' : 'installing…'
    } catch (e) { globalThis.__dnpSelfUpdateFailed(e?.message ?? String(e)) }
  })
  b.dataset.action = 'self-update'
  return b
}

// The button beside the version: ask GitHub now, and say what it answered.
async function checkNow (btn) {
  btn.disabled = true
  btn.textContent = 'checking…'
  const u = await checkForUpdate(STUDIO_VERSION, { force: true })
  S.update = u
  if (u.state === 'newer') { if (skipped() === u.latest) skipVersion(''); S.router?.remount?.(); return }
  btn.disabled = false
  btn.textContent = u.state === 'current' ? `up to date (${u.latest} is the latest)` : `could not check: ${u.error ?? 'no answer'}`
}

function problemRows () {
  const p = moduleProblems(S)
  const items = [
    ...p.maps.map((x) => ({ go: ['map', x.map], icon: 'section.maps', text: `${x.map}: ${x.msg}` })),
    ...p.metamap.map((m) => ({ go: ['maps'], icon: 'section.maps', text: `metamap: ${m}` })),
    ...p.graphs.map((m) => ({ go: ['graphs'], icon: 'section.graphs', text: `${m}` })),
    ...(p.sky ?? []).map((m) => ({ go: ['sky'], icon: 'section.sky', text: `${m}` })),
    ...(p.player ?? []).map((m) => ({ go: ['player'], icon: 'section.player', text: `${m}` })),
    ...(p.textures ?? []).map((m) => ({ go: ['textures'], icon: 'section.textures', text: `${m}` })),
    ...(p.controls ?? []).map((m) => ({ go: ['controls'], icon: 'section.controls', text: `${m}` })),
    ...(p.markers ?? []).map((m) => ({ go: ['screens'], icon: 'section.screens', text: `${m}` })),
    ...p.monsters.map((m) => ({ go: ['monsters'], icon: 'section.monsters', text: `${m}` })),
    ...p.weapons.map((m) => ({ go: ['weapons'], icon: 'section.weapons', text: `${m}` })),
    ...p.sounds.map((m) => ({ go: ['sounds'], icon: 'section.sounds', text: `${m}` }))
  ]
  if (!items.length) return [el('div', { class: 'st-muted', 'data-problems': '0' }, withIcon('status.ok', 'nothing wrong that the studio can see'))]
  return [el('div', { class: 'st-section-head' }, withIcon('status.error', `to fix (${items.length})`)),
    ...items.slice(0, 30).map((it) => el('button', { class: 'sd-problem', 'data-problem': it.go[0], onclick: () => S.go(...it.go) }, withIcon(it.icon, it.text))),
    items.length > 30 ? muted(`and ${items.length - 30} more`) : null]
}

/** Hand it the studio's state, and publish what others call. */
export function install (s) {
  S = s
  S.showHome = S.sectionAlias('home', showHome)
}
