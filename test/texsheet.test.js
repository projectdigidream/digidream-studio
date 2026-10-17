//
// Animated textures from sprite sheets (src/texsheet.js): what the studio
// writes into animations.txt is what the client reads, and the studio cuts a
// sheet where the client does.
//
// ORACLES: the client's parseAnimations (render/animtex.js) and sheetFrame
// (render/textures.js).
//
import { guessSheet, frameRect, frameSize, sheetProblems, sheetLine, animationsTxt, DEFAULT_FPS } from '../src/texsheet.js'
import { parseAnimations } from '../../engine/client/src/render/animtex.js'
import { sheetFrame } from '../../engine/client/src/render/textures.js'

let checks = 0
let fails = 0
const check = (ok, label) => { checks++; if (!ok) { fails++; console.log(`  FAIL ${label}`) } }

// --- the guess, from a picture's shape -------------------------------------------------
check(JSON.stringify(guessSheet(64, 512)) === JSON.stringify({ layout: 'vertical', frames: 8, fps: DEFAULT_FPS }), 'a picture eight squares tall is offered as eight vertical frames (qPainter\'s layout)')
check(guessSheet(256, 64)?.layout === 'horizontal' && guessSheet(256, 64).frames === 4, 'four squares wide, as four horizontal frames')
check(guessSheet(256, 128) === null && guessSheet(512, 256) === null, 'CONTROL: twice as wide as tall is a sky strip\'s shape, a still picture, not two frames')
check(guessSheet(64, 64) === null && guessSheet(64, 100) === null && guessSheet(64, 64 * 300) === null, 'CONTROL: a square, an uneven shape and too many frames are not guessed')

// --- cut where the client cuts -----------------------------------------------------------
let same = true
for (const [layout, frames, w, h] of [['vertical', 8, 64, 512], ['horizontal', 4, 256, 64], ['vertical', 3, 32, 100], ['horizontal', 7, 100, 20]]) {
  for (let k = 0; k < frames; k++) if (JSON.stringify(frameRect({ layout, frames }, w, h, k)) !== JSON.stringify(sheetFrame(layout, frames, w, h, k))) same = false
}
check(same, 'every frame of every layout is where the client\'s sheetFrame puts it, uneven sizes included')
check(frameSize({ layout: 'vertical', frames: 3 }, 32, 100).spare === 1 && frameSize({ layout: 'horizontal', frames: 4 }, 256, 64).spare === 0, 'what an uneven sheet leaves over is counted')

// --- what it writes, read back by the client -------------------------------------------------
const module = { textures: {
  LAVAFALL: { w: 64, h: 512, sheet: { layout: 'vertical', frames: 8, fps: 10 } },
  TORCH: { w: 256, h: 64, sheet: { layout: 'horizontal', frames: 4, fps: DEFAULT_FPS } },
  STONE: { w: 64, h: 64 }
} }
const txt = animationsTxt(module)
check(/^sheet LAVAFALL vertical 8 fps 10$/m.test(txt) && /^sheet TORCH horizontal 4$/m.test(txt) && !/STONE/.test(txt), `one line per sheet, the default speed unsaid (${txt.split('\n').filter((l) => l.startsWith('sheet')).join(' | ')})`)
const read = parseAnimations(txt)
const lava = read.sheets.get('LAVAFALL'); const torch = read.sheets.get('TORCH')
check(read.warnings.length === 0 && lava?.layout === 'vertical' && lava.frames === 8 && lava.fps === 10 && torch?.layout === 'horizontal' && torch.frames === 4 && torch.fps === DEFAULT_FPS,
      `the client reads every line as written, with no warning (${JSON.stringify([...read.sheets.values()])})`)
check(read.groups.find((g) => g.sheet === 'LAVAFALL')?.frames.join() === 'LAVAFALL,LAVAFALL#1,LAVAFALL#2,LAVAFALL#3,LAVAFALL#4,LAVAFALL#5,LAVAFALL#6,LAVAFALL#7', 'and plays it as the group NAME, NAME#1, …')
check(!/^sheet/m.test(animationsTxt({ textures: { STONE: { w: 1, h: 1 } } })) && animationsTxt({ textures: {} }) === null,
      'a module with textures but no sheet writes the file with no lines (so a sheet turned off stops), one with none writes nothing')
check(sheetLine('X', { layout: 'vertical', frames: 2, fps: 2.5 }) === 'sheet X vertical 2 fps 2.5' && parseAnimations(sheetLine('X', { layout: 'vertical', frames: 2, fps: 2.5 })).sheets.get('X').fps === 2.5, 'a fractional speed is written and read')

// --- what is said ---------------------------------------------------------------------------
check(sheetProblems('A', { layout: 'vertical', frames: 3 }, 32, 100).some((p) => /last 1 px are not shown/.test(p)), 'an uneven sheet is said, as the client says it')
check(sheetProblems('A', { layout: 'vertical', frames: 1 }, 32, 64).some((p) => /2 to 256/.test(p)) && sheetProblems('A', { layout: 'sideways', frames: 2 }, 32, 64).length === 1, 'too few frames and a layout the client lacks are said')
check(sheetProblems('A', { layout: 'vertical', frames: 8, fps: 10 }, 64, 512).length === 0, 'CONTROL: a good sheet is not')

console.log(`texsheet: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
