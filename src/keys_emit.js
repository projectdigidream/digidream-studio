//
// THE MODULE'S OWN KEYS (docs/KEYS.md): actions of its own -- reload, map,
// inventory -- each a keyboard key and, if it has a label, a touch button.
//
//   module.keys = [{ name, code, touch? }]        in order: key i is bit i
//
// written as module.txt lines in the server's own words,
//
//   key reload KeyR touch RELOAD
//
// and answered in graphs by when_button_pressed / _released / button_held,
// which take a key's name or one of the engine's own buttons.
//
// Pure: the Controls section, module_emit.js, the graph checks and the tests use it.
//

export const MAX_KEYS = 8
export const NAME_RE = /^[a-z0-9_]{1,16}$/
export const CODE_RE = /^[A-Za-z0-9_]{1,24}$/
export const LABEL_MAX = 12

/**
 * The engine's own buttons, as graphs name them (graphs.lua BUTTON), with the
 * keys the client binds them to (client/src/main.js) and their touch labels.
 */
export const ENGINE_BUTTONS = [
  { name: 'jump', keys: ['Space'], touch: 'JUMP' },
  { name: 'dash', keys: ['ShiftLeft', 'ShiftRight'], touch: 'DASH' },
  { name: 'use', keys: ['KeyE'], touch: 'USE' },
  { name: 'attack', keys: ['KeyF', 'mouse left'], touch: 'ATK' },
  { name: 'alt_attack', keys: ['mouse right'], touch: 'ALT' },
  { name: 'crouch', keys: ['KeyC'], touch: null },
  { name: 'grab', keys: ['KeyG'], touch: 'GRAB' },
  { name: 'hover', keys: [], touch: null },
  { name: 'fly', keys: [], touch: null },
  { name: 'grapple', keys: [], touch: null }
]
export const ENGINE_BUTTON_NAMES = ENGINE_BUTTONS.map((b) => b.name)

/** Every key the client already does something with: a module key there does both. */
export const ENGINE_KEYS = new Map([
  ...ENGINE_BUTTONS.flatMap((b) => b.keys.filter((k) => !k.startsWith('mouse')).map((k) => [k, b.name])),
  ['KeyW', 'moving'], ['KeyA', 'moving'], ['KeyS', 'moving'], ['KeyD', 'moving'],
  ['ArrowUp', 'moving'], ['ArrowDown', 'moving'], ['ArrowLeft', 'moving or turning'], ['ArrowRight', 'moving or turning'],
  ['KeyQ', 'turning the camera'], ['KeyR', 'turning the camera'],
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => [`Digit${d}`, 'choosing a weapon']),
  ['F2', 'a new game'], ['F5', 'saving'], ['F9', 'loading']
])

/** The codes a key can be chosen from without a keyboard to press. */
export const CODES = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => `Key${c}`),
  ...'0123456789'.split('').map((d) => `Digit${d}`),
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
  'Tab', 'Space', 'Enter', 'Backspace', 'Escape', 'ShiftLeft', 'ControlLeft', 'AltLeft',
  'Backquote', 'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Semicolon', 'Quote', 'Comma', 'Period', 'Slash',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'
]

/** A code as a person says it: KeyR -> R, Digit1 -> 1, ShiftLeft -> Shift. */
export function keyLabel (code) {
  if (!code) return '—'
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit\d$/.test(code)) return code.slice(5)
  if (/^Numpad\d$/.test(code)) return `num ${code.slice(6)}`
  const words = { ShiftLeft: 'Shift', ShiftRight: 'right Shift', ControlLeft: 'Ctrl', ControlRight: 'right Ctrl', AltLeft: 'Alt', AltRight: 'right Alt',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
    Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\' }
  return words[code] ?? code
}

/** A name a person typed, as a key's: lower case, a-z 0-9 _, 16 at most. */
export const cleanKeyName = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 16)
/** A touch label: upper case as the engine's are, 12 at most, no spaces (module.txt words). */
export const cleanLabel = (s) => String(s ?? '').toUpperCase().replace(/\s+/g, '_').slice(0, LABEL_MAX)

/** The module.txt lines, in order. */
export function keyLines (module) {
  return (module?.keys ?? []).filter((k) => k?.name && k?.code).map((k) => `key ${k.name} ${k.code}${k.touch ? ` touch ${k.touch}` : ''}`)
}

/**
 * What the server refuses (an error) and what would surprise (a warning):
 * [{ key, msg, level: 'error'|'warn' }].
 */
export function keyProblems (module) {
  const out = []
  const keys = module?.keys ?? []
  const say = (key, msg, level = 'error') => out.push({ key, msg, level })
  if (keys.length > MAX_KEYS) say(null, `${keys.length} keys; a game has ${MAX_KEYS} of its own at most -- the server ignores the rest`)
  const names = new Map(); const codes = new Map()
  keys.forEach((k, i) => {
    const who = k.name || `key ${i + 1}`
    if (!NAME_RE.test(k.name ?? '')) say(k.name, `${who}: a name is 1 to 16 of a-z, 0-9 and _`)
    if (!CODE_RE.test(k.code ?? '')) say(k.name, `${who}: needs a key (a code such as KeyR)`)
    if (k.touch !== undefined && k.touch !== null && (k.touch === '' || k.touch.length > LABEL_MAX || /\s/.test(k.touch))) say(k.name, `${who}: a touch label is 1 to ${LABEL_MAX} characters, no spaces`)
    if (names.has(k.name)) say(k.name, `${who}: two keys have this name; the server keeps the first`)
    names.set(k.name, i)
    if (ENGINE_BUTTON_NAMES.includes(k.name)) say(k.name, `${who}: the engine has a button called ${k.name}, and a graph naming it means the engine's`, 'warn')
    if (k.code && codes.has(k.code)) say(k.name, `${who}: ${keyLabel(k.code)} is ${codes.get(k.code)}'s key too -- both fire`, 'warn')
    if (k.code) codes.set(k.code, who)
    if (ENGINE_KEYS.has(k.code)) say(k.name, `${who}: ${keyLabel(k.code)} is the engine's key for ${ENGINE_KEYS.get(k.code)} -- pressing it does both`, 'warn')
  })
  return out
}

/** What a graph's button field may name: the engine's buttons, then the module's keys. */
export const buttonNames = (module) => [...ENGINE_BUTTON_NAMES, ...(module?.keys ?? []).map((k) => k.name).filter(Boolean)]
