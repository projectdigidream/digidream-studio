// AN IMPORTED SHEET'S ANIMATIONS, EDITED (src/animedit.js): renamed, timed,
// re-framed, made from frames the sheet has, removed -- every result read by
// the client's own atlas parser (the oracle), and a rename followed by the
// props and weapon views that name the animation.
//
//   node studio/test/animedit.test.js

import { readFileSync } from 'node:fs'
import { readPack } from '../src/pack.js'
import { framePalette, renameAnim, setAnim, setFrames, addAnim, removeAnim, renameReferences, referencesTo, animNameOk, applyLoops } from '../src/animedit.js'
import { parseAtlas } from '../../engine/client/src/render/atlas.js'

const name = 'animedit'
let checks = 0
let fails = 0
const check = (ok, label) => { checks++; if (!ok) { fails++; console.log(`  FAIL ${label}`) } else console.log(`  ok   ${label}`) }
const throws = (fn, re) => { try { fn(); return false } catch (e) { return re.test(e.message) } }
const parses = (m) => { try { parseAtlas(m, 'SPIR'); return true } catch (e) { console.log('    parse:', e.message); return false } }

const pack = await readPack(new Uint8Array(readFileSync(new URL('../src/templates/starter.zip', import.meta.url))))
const sheet = JSON.parse(new TextDecoder().decode(pack.find((e) => e.path.endsWith('sprites/SPIR.json')).bytes))
const names = (m) => m.animations.map((a) => a.name).join()
check(parses(sheet), `the starter's sheet parses as it is (${names(sheet)})`)

const pal = framePalette(sheet)
check(pal.length > 3 && pal.every((f) => f.views && f.from), `the palette: every distinct frame, with where it came from (${pal.length}, first ${pal[0].from})`)

const r = renameAnim(sheet, 'walk', 'stride')
check(parses(r) && names(r).includes('stride') && !names(r).split(',').includes('walk') && names(sheet).includes('walk'), 'a rename parses, and the manifest given is left as it was')
check(throws(() => renameAnim(sheet, 'walk', 'idle'), /already/) && throws(() => renameAnim(sheet, 'walk', 'two words'), /not a name/), 'CONTROL: a name taken, or no name, is refused')

const t = setAnim(sheet, 'idle', { fps: 12, loop: false })
const idle = t.animations.find((a) => a.name === 'idle')
check(parses(t) && idle.fps === 12 && idle.loop === false, 'fps and looping are set')
check(throws(() => setAnim(sheet, 'idle', { fps: 0 }), /fps/), 'CONTROL: fps 0 is refused')

const walk = sheet.animations.find((a) => a.name === 'walk')
const back = setFrames(sheet, 'walk', [...walk.frames].reverse().concat([walk.frames[0]]))
const w2 = back.animations.find((a) => a.name === 'walk')
check(parses(back) && w2.frames.length === walk.frames.length + 1 && w2.frames.every((f, i) => f.index === i) &&
      JSON.stringify(w2.frames[0].views) === JSON.stringify(walk.frames.at(-1).views), 'frames reordered and repeated, numbered again from 0')
check(throws(() => setFrames(sheet, 'walk', []), /at least one/), 'CONTROL: no frames is refused')

const made = addAnim(sheet, 'wave', [pal[0], pal[2], pal[0]].map((f) => ({ views: f.views })), { fps: 8, loop: true })
check(parses(made) && made.animations.at(-1).name === 'wave' && made.animations.at(-1).frames.length === 3, 'a new animation of the sheet\'s own frames parses')
check(throws(() => addAnim(sheet, 'idle', [{ views: pal[0].views }]), /already/), 'CONTROL: a new animation cannot take a name in use')

const gone = removeAnim(made, 'wave')
check(parses(gone) && names(gone) === names(sheet), 'removing one leaves the others')
check(throws(() => removeAnim({ animations: [sheet.animations[0]] }, sheet.animations[0].name), /at least one/), 'CONTROL: the last animation is kept')

// References follow a rename.
const module = {
  props: [{ name: 'spirit', art: { kind: 'atlas', sheet: 'SPIR', states: { 0: 'idle', 1: 'walk' } } }, { name: 'other', art: { kind: 'atlas', sheet: 'OTHER', states: { 1: 'walk' } } }],
  viewmodels: { weapons: { wand: { sheet: { name: 'SPIR', ready: 'walk', fire: 'idle' }, anims: { 5: { sheetAnim: 'walk' } } } } }
}
check(referencesTo(module, 'SPIR', 'walk').length === 3, `what names it is found (${referencesTo(module, 'SPIR', 'walk').join('; ')})`)
const moved = renameReferences(module, 'SPIR', 'walk', 'stride')
check(moved === 3 && module.props[0].art.states[1] === 'stride' && module.viewmodels.weapons.wand.sheet.ready === 'stride' && module.viewmodels.weapons.wand.anims[5].sheetAnim === 'stride',
      'a rename follows the props and weapon views drawn with the sheet')
check(module.props[1].art.states[1] === 'walk', 'CONTROL: another sheet\'s "walk" is left alone')
check(animNameOk('idle_2') && animNameOk('walk.left') && !animNameOk('') && !animNameOk('a b'), 'names: letters, digits, _ . -')

// The module's loop choices over a baked sheet's.
const looped = applyLoops(sheet, { death: false, Attack: false })
check(parses(looped) && looped.animations.find((a) => a.name === 'death').loop === false && looped.animations.find((a) => a.name === 'idle').loop === sheet.animations.find((a) => a.name === 'idle').loop,
      'the module\'s loop choices are applied, the animations it names nothing about keep theirs')
check(applyLoops(sheet, null) === sheet && applyLoops(sheet, {}) === sheet, 'CONTROL: no choices, the manifest as it came')

console.log(`\n${name}: ${checks} checks, ${fails} failures`)
process.exit(fails === 0 ? 0 : 1)
