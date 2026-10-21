//
// A whole module, as files, from the module document and its map documents.
//
// This is the one place that knows the layout of a module on disk
// (docs/MODULES.md) and what the studio adds to it:
//
//   module.txt                     name / id / about, controls, persist, game lines
//   module.studio.json             the module document (props, mobs, textures)
//   maps/<map>.studio.json         the map document -- THE source
//   maps/<map>.map                 generated, so a checkout can re-bake it
//   maps/<map>.dnpm                baked, what the server loads
//   maps/<map>.lua                 generated: placed things and triggers
//   maps/mobs.lua                  generated: the module's monsters (if any)
//   maps/*.lua                     mapc's copies of the runtime scripts
//   maps/arsenal.lua               generated: the weapons, run ONCE for the game
//   maps/weapon_vocab.lua, weapons.lua   copies of the runtime, for the game lines
//   assets/props.txt               generated: bodies for the module's kinds
//   assets/textures/index.json     generated: sizes of every texture used
//   assets/textures/*.png          the module's own pictures
//   assets/ui/index.json, *.json   generated: the HUD, touch controls, panel templates
//   maps/metamap.txt               generated: where the levels sit on the grid
//   sources/sounds/*.sfxproj       the sound packs, merged into assets/sounds/bank.sfxproj
//   assets/sprites/*               the module's own sheets
//
// Every map declares, in order: the mob vocabulary and runtime, the module's
// mobs, the trigger vocabulary and runtime, the module's own scripts, and the
// map's own file. The runtime scripts are declared by the repository-relative
// path a checkout has them at, so the same .map bakes with desktop mapc.
//
import { weaponsJson, spriteIndexJson, viewPictures, pngSize, expandSheetViews } from './viewmodel_emit.js'
import { decodePng, encodePng } from './bake/png.js'
import { swingsJson } from './swings_emit.js'
import { normalize, derive } from './topology.js'
import { emitMap } from './mapfmt.js'
import { emitMapLua, makeResolver } from './lua_emit.js'
import { emitGraph, graphFile, gameGraphFile, hasGraph, liveGraphs } from './graphs_emit.js'
import { triggerPanels, graphPanels } from './panels_emit.js'
import { emitMobsLua } from './mobs_emit.js'
import { emitWeaponsLua, hasWeapons } from './weapons_emit.js'
import { keyLines } from './keys_emit.js'
import { animationsTxt } from './texsheet.js'
import { playerLines, playerFor, hasMoveSounds, emitPlayerSoundsLua, emitPlayerHurtLua, emitPickupSoundsLua } from './player.js'
import { emitProps } from './props_emit.js'
import { CAP } from './doc.js'
import { toLua } from './lua.js'
import { skyLines } from './sky_emit.js'
import { uiFiles } from './ui_emit.js'
import { metamapText, metamapProblems } from './metamap.js'
import { mergeBanks, packPath } from './soundpacks.js'
import { newMetamap, MODULE_VERSION } from './migrate.js'

export const RUNTIME_SCRIPTS = ['mob_vocab.lua', 'mobs.lua', 'trigger_vocab.lua', 'triggers.lua',
                               'weapon_vocab.lua', 'weapons.lua', 'graph_vocab.lua', 'graphs.lua', 'player_sounds.lua']

/**
 * ONE FILE FOR EVERYTHING THE MODULE DEFINES, and it is a budget that forces
 * it rather than tidiness.
 *
 * A map may declare eight scripts (MAX_MAP_SCRIPTS) and the three runtimes
 * cost two apiece -- six, before the module has said anything of its own. A
 * file each for the monsters, the arsenal and every module script put a module
 * with all three over the cap the moment a weapon was added, which is a studio
 * making one of its own features unusable.
 *
 * So the module's Lua is one file: its mobs.load, its weapons.load and its own
 * scripts, in that order, leaving six for the runtimes, one for this and one
 * for the map's own -- exactly eight, whatever the module contains.
 *
 * Each of the module's own scripts is wrapped in `do ... end` so its locals
 * stay its own, which is what being a separate chunk bought it. A trailing
 * `return` is still legal there and still discarded, exactly as mapc running
 * the file discarded it.
 */
export const MODULE_FILE = 'module.lua'

export function emitModuleLua (module, { hooks = [] } = {}) {
  const parts = []
  const mobs = emitMobsLua(module)
  if (mobs !== null) parts.push({ text: mobs, hooks: false })
  // The player's pain and death, through the mob runtime in each level.
  const hurt = emitPlayerHurtLua(module)
  if (hurt !== null) parts.push({ text: hurt, hooks: false })
  for (const [name, text] of Object.entries(module.scripts ?? {})) {
    parts.push({ text: `-- >>> ${name}\ndo\n${String(text).trimEnd()}\nend\n-- <<< ${name}\n`, hooks: true })
  }
  if (!parts.length) return null

  // HOOKS ARE HARVESTED PER CHUNK and this file is one chunk, so two parts
  // that both define `on_tick` would leave one of them: the second assignment
  // wins and the first is never seen. Before these shared a file they were
  // separate chunks and both ran.
  //
  // So each part's hooks are taken as soon as it has run and chained at the
  // end, which is what the server would have done for separate files. The
  // names come from the trigger vocabulary's events -- the same list vm.cpp
  // harvests -- rather than a second copy written here.
  const names = hooks.filter((n) => /^on_/.test(n))
  const chain = names.length > 1 || parts.filter((p) => p.hooks).length > 1
  const L = [
    '--',
    `-- GENERATED by the studio: every definition module ${module.id} makes.`,
    '-- One file because a map may declare eight scripts and three runtimes cost',
    "-- six; edit the monsters, the weapons and the module's scripts in the studio.",
    '--',
    ''
  ]
  if (chain) {
    L.push(`local __hook_names = { ${names.map((n) => `"${n}"`).join(', ')} }`)
    L.push('local __chained = {}')
    L.push('local function __take()')
    L.push('  for _, n in ipairs(__hook_names) do')
    L.push('    local f = _G[n]')
    L.push('    if f ~= nil then')
    L.push('      __chained[n] = __chained[n] or {}')
    L.push('      __chained[n][#__chained[n] + 1] = f')
    L.push('      _G[n] = nil')
    L.push('    end')
    L.push('  end')
    L.push('end')
    L.push('')
  }
  for (const p of parts) {
    L.push(p.text)
    if (chain && p.hooks) L.push('__take()')
  }
  if (chain) {
    L.push('')
    L.push('-- Re-installed, one handler or a chain of them. The engine calls a hook')
    L.push('-- for no result (lua_pcall with zero returns), so running them in order')
    L.push('-- is the whole of what a list of chunks did.')
    L.push('for n, list in pairs(__chained) do')
    L.push('  if #list == 1 then _G[n] = list[1]')
    L.push('  else _G[n] = function(...) for i = 1, #list do list[i](...) end end end')
    L.push('end')
  }
  return L.join('\n')
}
// Where the runtime lives, as a map declares it: the engine's folder in the
// repository (engine/maps/scripts), and the same path in the virtual tree a
// bake here is given, so the two agree.
const RUNTIME_DIR = 'engine/maps/scripts'

/**
 * An id as somebody typed it, made one the module, its files and its server
 * take: lower-case letters, digits, _ and -. Accented letters lose their
 * accents ("l'île" -> "l-ile"), spaces and apostrophes become dashes, and
 * whatever has no plain-letter spelling is reported in `dropped`, so the
 * caller can say so instead of losing it in silence.
 * @returns { id, dropped: string[] }
 */
export function cleanId (raw) {
  const SPELT = { ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ð: 'd', ł: 'l', þ: 'th', ı: 'i' }
  const dropped = []
  let out = ''
  for (const ch of String(raw ?? '').trim().toLowerCase().normalize('NFD')) {
    if (/[a-z0-9_-]/.test(ch)) out += ch
    else if (/\p{M}/u.test(ch)) continue                   // the accent of the letter before
    else if (SPELT[ch]) out += SPELT[ch]
    else if (/[\s'’.,/–—]/.test(ch)) out += '-'
    // a LETTER with no plain spelling is named (it would vanish); a sign is just left out, as ever
    else if (/\p{L}/u.test(ch) && !dropped.includes(ch)) dropped.push(ch)
  }
  return { id: out.replace(/-{2,}/g, '-').replace(/^-+|-+$/g, ''), dropped }
}

export function newModule (id, name = id) {
  return {
    version: MODULE_VERSION,
    id,
    name,
    about: '',
    propIdBase: 1000,
    props: [],
    mobs: { missiles: {}, mobs: {} },
    scripts: {},              // { 'name.lua': text } -- the module's own Lua, declared by every map
    textures: {},             // { NAME: { w, h, cutout } } -- pictures live as files beside this
    sprites: {},              // { SHEET: { image: 'SHEET.png' } } -- ThreeSprite manifests
    // The arsenal, as weapons.load{} takes it: pools, ceilings, phase machines
    // and pickups (maps/scripts/weapon_vocab.lua).
    weapons: { ammo: {}, health: null, weapons: {}, pickups: {} },
    // Which record draws a player, and which state each animation condition
    // picks. `prop` names one of `props` above.
    player: null,             // { prop, blend, when, body, set, start } -- every map's; a map overrides with playerOverride
    vfx: [],                  // [{ id, type: 'particles'|'tracer', ... }] -- bursts and tracers
    controls: 'platformer',   // or 'fps' (module.txt `controls`)
    persist: [],              // any of PERSIST (module.txt `persist`)
    // Sound packs, highest first; each kept as sources/sounds/<id>.sfxproj and
    // merged into assets/sounds/bank.sfxproj when written (soundpacks.js).
    sounds: { packs: [] },    // [{ id, name, enabled }]
    // Levels on a grid (maps/metamap.txt): off, or a pitch and cells.
    metamap: newMetamap()
  }
}

/**
 * THE WEAPONS RUN ONCE, FOR THE WHOLE GAME (docs/MODULES.md, Game scripts).
 *
 * Loaded per level, every level had its own inventory and its own weapon
 * panel: walking into the next map handed the player a fresh pistol. A
 * `game` line in module.txt runs a script once in the game VM instead, and
 * the weapons follow the player.
 *
 * Game lines name files in the module's own maps/ -- a packaged build copies
 * modules alone -- so the runtime travels as copies beside the generated
 * arsenal, the same way mapc copies a map's scripts beside it.
 */
export const GAME_FILE = 'arsenal.lua'
export const GAME_RUNTIME = ['weapon_vocab.lua', 'weapons.lua']

// The player's jump and landing sounds: the runtime's game script, then the
// file that sets them (player.js, emitPlayerSoundsLua).
export const PLAYER_GAME_RUNTIME = 'player_sounds.lua'
export const PLAYER_GAME_FILE = 'player_setup.lua'

// The game's graph: the trigger and graph runtimes in the game VM too. They
// are SHARED -- the levels keep their own copies, which a plain game line
// would take from them (docs/GRAPHS.md, The game's graph).
export const GRAPH_GAME_RUNTIME = ['trigger_vocab.lua', 'triggers.lua', 'graph_vocab.lua', 'graphs.lua']

/** Does the module have a graph of its own, for the game? */
export const hasGameGraph = (module) => hasGraph(module)

/**
 * The module's game scripts, in load order, as module.txt says them: a file,
 * with ` shared` when the levels keep their copies too. Empty when it needs none.
 */
export function gameScripts (module) {
  const out = hasWeapons(module) ? [...GAME_RUNTIME, GAME_FILE] : []
  if (hasMoveSounds(module)) out.push(PLAYER_GAME_RUNTIME, PLAYER_GAME_FILE)
  // Each of the module's graphs a game line of its own, after their runtimes
  // -- and after the panels they open, which the runtime checks them against.
  if (hasGameGraph(module)) {
    out.push(...GRAPH_GAME_RUNTIME.map((f) => `${f} shared`))
    if (emitGamePanelsLua(module) !== null) out.push(GAME_PANELS_FILE)
    out.push(...liveGraphs(module).map(([name]) => gameGraphFile(name)))
  }
  return out
}

/**
 * THE GAME'S PANELS. A graph's `ui_open` is the trigger runtime's verb, which
 * opens a panel of the trigger table loaded in its VM. A level has its map's
 * table; the game VM has none -- so the game's graphs get one: a cardless
 * table holding the module's panels they open, loaded once in the game VM
 * after the shared runtimes and before the graphs. The panel is then the
 * game's (it survives a level change), and its buttons come back to the
 * game's graphs as `on_ui_event`.
 */
export const GAME_PANELS_FILE = 'module_panels.lua'
export function emitGamePanelsLua (module) {
  const panels = module.panels ? triggerPanels(module, module.panels) : {}
  if (!Object.keys(panels).length) return null
  return ['-- module_panels.lua -- written by the studio from module.studio.json.',
    '-- The panels the game\'s graphs open (ui_open), as a trigger table of no cards.',
    `triggers.load${toLua({ name: 'module', panels, triggers: [] })}`, ''].join('\n')
}

/** A game line's file, without its ` shared`. */
export const gameFileOf = (line) => line.split(' ')[0]

/** The game-wide file: the arsenal, and what every player starts holding. */
export function emitGameLua (module) {
  const arms = emitWeaponsLua(module)
  if (arms === null) return null
  const start = module.player?.start?.weapons
  const L = [arms]
  if (Array.isArray(start) && start.length) {
    L.push('-- What every player starts holding (the Player window\'s kit).')
    L.push(`weapons.initial_weapons = { ${start.map((n) => `"${n}"`).join(', ')} }`)
  }
  const pickups = emitPickupSoundsLua(module)
  if (pickups) { L.push('-- What taking a pickup sounds like (the Player window\'s sounds).'); L.push(pickups.trimEnd()) }
  return L.join('\n') + '\n'
}

// What module.txt may say about how the module is played and what it keeps
// (docs/MODULES.md, docs/SAVING.md). The studio offers exactly these.
export const CONTROLS = ['platformer', 'fps']
export const PERSIST = ['levels', 'saves', 'server']

/**
 * @param debug  the debug overlay for this emit: true / false to say it
 *               whatever the module does (a play-test's own choice), or
 *               undefined to say what the module does (its `debug` setting).
 */
export function moduleTxt (module, docs = [], { debug } = {}) {
  const L = [`name    ${module.name}`, `id      ${module.id}`]
  for (const line of (module.about ?? '').split('\n')) if (line.trim()) L.push(`about   ${line}`)
  // Platformer is the engine's default, so it goes unsaid; a module that says
  // it would override an fps flavour stacked on top of it.
  if (module.controls === 'fps') L.push('controls fps')
  // The engine's debug overlay (numbers, controls legend, swing drawings):
  // on unless the module turns it off -- or a play-test says either way.
  // `on` is said only for a play-test, where a module beneath may say off.
  const shown = debug ?? (module.debug !== false)
  if (!shown) L.push('debug off')
  else if (debug === true) L.push('debug on')
  // The module's own keys (docs/KEYS.md), in order: key i is bit i.
  L.push(...keyLines(module))
  for (const p of PERSIST) if (module.persist?.includes(p)) L.push(`persist ${p}`)
  for (const f of gameScripts(module)) L.push(`game ${f}`)
  // The skies (docs/SKY.md): the module's, then each map's own, by name.
  L.push(...skyLines(module, docs))
  // How the player moves (docs/PLAYER.md): the module's, then each map's own.
  L.push(...playerLines(module, docs))
  return L.join('\n') + '\n'
}

/** The script declarations a map in this module carries, in order. */
/**
 * The key a map's music is filed under: its content hash, the trailing eight
 * bytes of the .dnpm, little-endian, as lowercase hex with no padding --
 * what the client's own `map.hash.toString(16)` produces when it looks the
 * track up (client/src/main.js, musicFor) and what tools/wad/music_all.js
 * writes for the DOOM soundtrack. A rebake changes it, which is why the
 * index is generated beside the bake rather than kept.
 */
export function musicKey (dnpm) {
  const b = dnpm instanceof Uint8Array ? dnpm : new Uint8Array(dnpm)
  if (b.byteLength < 8) throw new Error('not a baked map')
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getBigUint64(b.byteLength - 8, true).toString(16)
}

/**
 * assets/music/index.json: { mapName: { cue: 'track.mstk' } } for every map
 * with cues (doc.music).
 *
 * KEYED BY THE LEVEL'S NAME, which the client looks up first
 * (engine/client/src/audio/musickey.js): the server names a level by its map
 * file's stem, which is the document's name. A content hash also works, but a
 * re-bake changes it and silently unmaps the soundtrack; a name survives.
 *
 * `tracks` is the set of track names the module holds, or null when unknown
 * (the workstation tool); a cue naming a track that is not there is a
 * warning, and the entry is written anyway so the game says which file it
 * lacked.
 */
export function musicIndex (baked, tracks = null) {
  const index = {}
  const warnings = []
  for (const { doc } of baked) {
    const cues = Object.entries(doc.music ?? {}).filter(([, track]) => track)
    if (!cues.length) continue
    const table = {}
    for (const [cue, track] of cues) {
      table[cue] = `${track}.mstk`
      if (tracks && !tracks.has(track)) warnings.push({ map: doc.name, msg: `cue '${cue}' names track '${track}', which is not in the module` })
    }
    if (!table.default) warnings.push({ map: doc.name, msg: `no cue called 'default': the game starts with that one (has ${Object.keys(table).join(', ')})` })
    index[doc.name] = table
  }
  return { index, warnings }
}

/**
 * What a map declares, in load order.
 *
 * ONLY WHAT IS USED, within MAX_MAP_SCRIPTS (sixteen): two slots per runtime
 * the level needs, its graph if it has one, one for everything the module
 * defines (MODULE_FILE), and one for the map's own.
 *
 * The weapons are not here: they are game scripts. But a module that arms
 * anybody still needs the MOB runtime in every level, because the game's
 * weapons do their shooting through the level the player stands in
 * (`mobs.weapon_runtime`) -- the ray, the missile and the blast are the mob
 * runtime's, which owns the monsters and their health.
 */
export function scriptDecls (module, { hasMobs = false, hasTriggers = true, hasWeapons = false, graph = null, graphs = null } = {}) {
  // The map's graph files, each a script line of its own (one slot each).
  graphs = graphs ?? (graph ? [graph] : [])
  const decls = []
  if (hasMobs || hasWeapons) decls.push(`../../../${RUNTIME_DIR}/mob_vocab.lua`, `../../../${RUNTIME_DIR}/mobs.lua`)
  // A graph's verbs ARE the trigger runtime's (triggers.verbs), so a map with
  // a graph needs it whether or not it has a trigger table.
  if (hasTriggers || graphs.length) decls.push(`../../../${RUNTIME_DIR}/trigger_vocab.lua`, `../../../${RUNTIME_DIR}/triggers.lua`)
  if (graphs.length) decls.push(`../../../${RUNTIME_DIR}/graph_vocab.lua`, `../../../${RUNTIME_DIR}/graphs.lua`, ...graphs)
  // After every runtime, because it calls into all of them.
  if (emitModuleLua(module) !== null) decls.push(MODULE_FILE)
  return decls
}

/**
 * Emit one map: the .map text, its Lua, and the bake.
 *
 * @param bake     studio/src/bake.js's bake()
 * @param runtime  { 'mobs.lua': text, ... } the four runtime scripts
 * @returns { ok, mapText, luaText, dnpm, copies, errors, warnings, emitted }
 */
/** Does this graph runtime read a graph's `panels` (docs/PANELS.md)? Written only then: an older one refuses the field. */
export const graphTakesPanels = (gv) => !!gv?.graph_fields?.some((f) => f.name === 'panels')

export async function emitLevel (module, doc, { bake, runtime, hooks = [], graphVocab = null }) {
  normalize(doc)
  const derived = derive(doc)
  const live = liveGraphs(doc)
  const moduleLua = emitModuleLua(module, { hooks })
  const decls = scriptDecls(module, { hasMobs: emitMobsLua(module) !== null, hasTriggers: doc.triggers.length > 0, hasWeapons: hasWeapons(module),
                                      graphs: live.map(([name]) => graphFile(doc.name, name)) })
  const errors = []
  if (decls.length + 1 > CAP.scripts) {
    errors.push({ line: 0, msg: `a map can declare ${CAP.scripts} scripts and this module needs ${decls.length + 1}: ${decls.map((d) => d.split('/').pop()).join(', ')}.` })
  }
  const emitted = emitMap(derived, doc, [...decls, `${doc.name}.lua`], { body: playerFor(module, doc).body })
  // The module's panels this map opens through its trigger table; a document
  // from before panels were the module's still carries its own.
  const lua = emitMapLua(doc, emitted, { panels: module.panels ? triggerPanels(doc, module.panels) : (doc.panels ?? null) })
  for (const p of lua.problems) errors.push({ line: 0, msg: p })
  // The graphs, each its own file under its own name, their verbs' places
  // resolved as the trigger table's are.
  const graphTexts = {}
  for (const [name, graph] of live) {
    const unresolved = []
    const g = emitGraph(graph, name, makeResolver(doc, emitted, { problems: unresolved }), makeResolver(doc, emitted, { guards: false, problems: unresolved }),
                        { panels: graphTakesPanels(graphVocab) ? graphPanels(graph, module.panels) : null })
    for (const p of [...g.problems, ...unresolved]) errors.push({ line: 0, msg: `graph '${name}': ${p}` })
    graphTexts[graphFile(doc.name, name)] = g.text
  }
  // The first, for a caller that asks about "the" graph.
  const graphText = Object.values(graphTexts)[0] ?? null
  if (errors.length) return { ok: false, mapText: emitted.text, luaText: lua.text, graphText, graphTexts, dnpm: null, copies: {}, errors, warnings: derived.warnings, emitted }

  const files = {}
  for (const name of RUNTIME_SCRIPTS) files[`${RUNTIME_DIR}/${name}`] = runtime[name]
  const mapsDir = `modules/${module.id}/maps`
  if (moduleLua !== null) files[`${mapsDir}/${MODULE_FILE}`] = moduleLua
  for (const [file, text] of Object.entries(graphTexts)) files[`${mapsDir}/${file}`] = text
  files[`${mapsDir}/${doc.name}.lua`] = lua.text

  const r = await bake({ mapPath: `${mapsDir}/${doc.name}.map`, mapText: emitted.text, files })
  return { ok: r.ok, mapText: emitted.text, luaText: lua.text, graphText, graphTexts, dnpm: r.dnpm, copies: r.copies,
           errors: r.errors, warnings: derived.warnings, emitted, hash: r.hash }
}

/**
 * Every file of the module, ready to write or pack: [{ path, bytes }], with
 * paths relative to the module root.
 *
 * @param docs     the module's map documents
 * @param assets   { 'textures/NAME.png': Uint8Array, 'sprites/SPIR.json': ..., ... }
 * @param textureSizes  (name) => { w, h } | null, for index.json
 * @returns { ok, files, problems: [{ map, errors, warnings }] }
 */
export async function emitModule (module, docs, { bake, runtime, hooks = [], assets = {}, textureSizes = () => null, graphVocab = null, debug, onMap } = {}) {
  const files = []
  const problems = []
  const used = new Set()
  files.push({ path: 'module.txt', bytes: moduleTxt(module, docs, { debug }) })
  files.push({ path: 'module.studio.json', bytes: JSON.stringify(module, null, 2) })
  const props = emitProps(module)
  files.push({ path: 'assets/props.txt', bytes: props })
  // The module's own Lua, generated into one file; the scripts it carries stay
  // beside it as the sources they were edited as.
  const moduleLua = emitModuleLua(module, { hooks })
  if (moduleLua !== null) files.push({ path: `maps/${MODULE_FILE}`, bytes: moduleLua })
  for (const [name, text] of Object.entries(module.scripts ?? {})) files.push({ path: `scripts/${name}`, bytes: text })
  // Where the levels sit, when the module has them on a grid.
  const mm = metamapText(module.metamap)
  if (mm) files.push({ path: 'maps/metamap.txt', bytes: mm })
  for (const p of metamapProblems(module.metamap, docs.map((d) => d.name))) problems.push({ map: 'metamap', errors: [{ line: 0, msg: p }], warnings: [] })
  // The screens: the HUD, the touch controls and panel templates, when the
  // module has a layout of its own (docs/UI_LAYOUT.md).
  files.push(...uiFiles(module, docs))
  // The game scripts module.txt names: the runtime's copies, then the arsenal.
  const game = emitGameLua(module)
  if (game !== null) {
    for (const name of GAME_RUNTIME) files.push({ path: `maps/${name}`, bytes: runtime[name] })
    files.push({ path: `maps/${GAME_FILE}`, bytes: game })
  }
  const playerGame = emitPlayerSoundsLua(module)
  if (playerGame !== null) {
    files.push({ path: `maps/${PLAYER_GAME_RUNTIME}`, bytes: runtime[PLAYER_GAME_RUNTIME] })
    files.push({ path: `maps/${PLAYER_GAME_FILE}`, bytes: playerGame })
  }

  // The game's graphs: the runtimes they need beside them, then each graph.
  if (hasGameGraph(module)) {
    for (const name of GRAPH_GAME_RUNTIME) files.push({ path: `maps/${name}`, bytes: runtime[name] })
    const panelsLua = emitGamePanelsLua(module)
    if (panelsLua !== null) files.push({ path: `maps/${GAME_PANELS_FILE}`, bytes: panelsLua })
    for (const [name, graph] of liveGraphs(module)) {
      const g = emitGraph(graph, name, null, null, { panels: graphTakesPanels(graphVocab) ? graphPanels(graph, module.panels) : null })
      files.push({ path: `maps/${gameGraphFile(name)}`, bytes: g.text })
      if (g.problems.length) problems.push({ map: 'module graph', errors: g.problems.map((msg) => ({ line: 0, msg: `graph '${name}': ${msg}` })), warnings: [] })
    }
  }

  // A metamap the server would refuse is fatal there, so it is here.
  let ok = !problems.some((p) => (p.map === 'metamap' || p.map === 'module graph') && p.errors.length)
  const baked = []
  for (const [i, doc] of docs.entries()) {
    // Before each map's bake (mapc, which holds the page): who is watching
    // (Play's screen) says which map, and paints before it starts.
    await onMap?.({ i, n: docs.length, name: doc.name })
    const r = await emitLevel(module, doc, { bake, runtime, hooks, graphVocab })
    files.push({ path: `maps/${doc.name}.studio.json`, bytes: JSON.stringify(doc, null, 2) })
    files.push({ path: `maps/${doc.name}.map`, bytes: r.mapText })
    files.push({ path: `maps/${doc.name}.lua`, bytes: r.luaText })
    for (const [file, text] of Object.entries(r.graphTexts ?? {})) files.push({ path: `maps/${file}`, bytes: text })
    if (r.ok) {
      baked.push({ doc, dnpm: r.dnpm })
      files.push({ path: `maps/${doc.name}.dnpm`, bytes: r.dnpm })
      for (const [name, bytes] of Object.entries(r.copies)) {
        if (name === `${doc.name}.lua`) continue
        if (!files.some((f) => f.path === `maps/${name}`)) files.push({ path: `maps/${name}`, bytes })
      }
    } else ok = false
    if (r.errors.length || r.warnings.length) problems.push({ map: doc.name, errors: r.errors, warnings: r.warnings })
    for (const sid of doc.order) {
      const s = doc.sectors[sid]
      for (const t of [s.floorTex, s.ceilTex]) if (t) used.add(t)
      for (const v of s.verts) for (const t of [v.edge.middle, v.edge.upper, v.edge.lower]) if (t) used.add(t)
    }
  }

  const index = { sizes: {}, cutout: {} }
  for (const name of [...used].sort()) {
    const size = module.textures?.[name] ?? textureSizes(name)
    if (!size) continue
    index.sizes[name] = [size.w, size.h]
    if (size.cutout) index.cutout[name] = true
  }
  files.push({ path: 'assets/textures/index.json', bytes: JSON.stringify(index, null, 1) })
  // Its textures that are sprite sheets (texsheet.js; docs/TEXTURE_SHEETS.md).
  const anims = animationsTxt(module)
  if (anims !== null) files.push({ path: 'assets/animations.txt', bytes: anims })
  // The soundtrack's table, keyed by the bakes just made. Only when a map has
  // music: an empty table would shadow another module's in a shell that
  // serves the first file it finds.
  const trackNames = Object.keys(assets).filter((p) => /^music\/[^/]+\.mstk$/.test(p)).map((p) => p.slice(6, -5))
  const music = musicIndex(baked, Object.keys(assets).length ? new Set(trackNames) : null)
  for (const w of music.warnings) problems.push({ map: w.map, errors: [], warnings: [{ sector: 'music', msg: w.msg }] })
  if (Object.keys(music.index).length) files.push({ path: 'assets/music/index.json', bytes: JSON.stringify(music.index, null, 1) })
  // The sound packs, merged into the one bank the engine plays; the packs
  // themselves travel as sources at the module root.
  const dec = new TextDecoder()
  const packs = (module.sounds?.packs ?? []).map((p) => {
    const b = assets[packPath(p.id)]
    let json = null
    try { json = b ? JSON.parse(typeof b === 'string' ? b : dec.decode(b)) : null } catch { json = null }
    if (b && !json) problems.push({ map: 'sounds', errors: [], warnings: [{ sector: 'sounds', msg: `pack ${p.id} is not a sound project any more` }] })
    return { ...p, json }
  })
  const merged = mergeBanks(packs)
  if (merged.bank) files.push({ path: 'assets/sounds/bank.sfxproj', bytes: JSON.stringify(merged.bank) })
  for (const c of merged.collisions) problems.push({ map: 'sounds', errors: [], warnings: [{ sector: 'sounds', msg: `${c.name} is in ${c.kept} and ${c.dropped.join(', ')}; ${c.kept}'s is kept` }] })
  // How swings look in the game (docs/SWINGS.md): only when the module says.
  // The weapon in first person (viewmodel_emit.js): its frames, and the
  // index of the pictures' sizes and offsets the client places them by.
  // A weapon drawn from a sprite sheet (a ThreeSprite project) is cut into a
  // picture per frame here, placed where it sits on the sheet's canvas.
  const bytesOf = async (b) => (typeof b?.arrayBuffer === 'function' ? new Uint8Array(await b.arrayBuffer()) : typeof b === 'string' ? new TextEncoder().encode(b) : b)
  const manifests = {}
  for (const v of Object.values(module.viewmodels?.weapons ?? {})) {
    const n = v.sheet?.name
    if (n && !(n in manifests)) {
      try { manifests[n] = assets[`sprites/${n}.json`] ? JSON.parse(new TextDecoder().decode(await bytesOf(assets[`sprites/${n}.json`]))) : null } catch { manifests[n] = null }
      if (!manifests[n]) problems.push({ map: 'weapons', errors: [], warnings: [{ sector: 'first person', msg: `no sprite sheet ${n} in this module: the first-person view has nothing to draw` }] })
    }
  }
  const expanded = expandSheetViews(module, (n) => manifests[n])
  const views = weaponsJson(expanded.module)
  if (views) {
    files.push({ path: 'assets/sprites/weapons.json', bytes: views })
    const pics = Object.keys(assets).filter((p) => /^sprites\/[^/]+\.png$/.test(p) && !assets[p.replace(/\.png$/, '.json')])
    const sizes = {}
    for (const p of pics) sizes[p.slice(8, -4)] = pngSize(await bytesOf(assets[p]))
    const index = JSON.parse(spriteIndexJson(expanded.module, Object.keys(sizes), (n) => sizes[n]) ?? '{"sizes":{},"offsets":{}}')
    const sheets = {}
    for (const pic of expanded.pictures) {
      try {
        sheets[pic.sheet] ??= decodePng(await bytesOf(assets[`sprites/${pic.sheet}.png`]))
        const src = sheets[pic.sheet]; const { x, y, w, h } = pic.rect
        const out = new Uint8Array(w * h * 4)
        for (let r = 0; r < h; r++) out.set(src.rgba.subarray(((y + r) * src.w + x) * 4, ((y + r) * src.w + x + w) * 4), r * w * 4)
        files.push({ path: `assets/sprites/${pic.name}.png`, bytes: encodePng(w, h, out) })
        index.sizes[pic.name] = pic.size
        index.offsets[pic.name] = pic.offset
      } catch (e) { problems.push({ map: 'weapons', errors: [], warnings: [{ sector: 'first person', msg: `${pic.name}: the frame could not be cut from ${pic.sheet} (${e.message})` }] }) }
    }
    files.push({ path: 'assets/sprites/index.json', bytes: JSON.stringify(index, null, 1) })
    for (const n of viewPictures(module)) if (!sizes[n]) problems.push({ map: 'weapons', errors: [], warnings: [{ sector: 'first person', msg: `${n} is not a picture of this module: the first-person view does not draw it` }] })
  }
  const swings = swingsJson(module)
  if (swings) files.push({ path: 'assets/sprites/swings.json', bytes: swings })
  for (const [path, bytes] of Object.entries(assets)) {
    if (path.startsWith('sources/')) files.push({ path, bytes })
    else if (swings && path === 'sprites/swings.json') continue
    else if (views && (path === 'sprites/weapons.json' || path === 'sprites/index.json')) continue
    else if (!(merged.bank && path === 'sounds/bank.sfxproj')) files.push({ path: `assets/${path}`, bytes })
  }
  return { ok, files, problems }
}
