// The Code plugin: a Lua editor for the module's scripts (record:script), and
// the example of a record editor in docs/PLUGINS.md. No dependencies: one
// tokenizer drives both the highlighting and the block check.
import { inSuite, connectSuite } from './suite-sdk.js'
import { wearSkin } from './suite-skin.js'

const KEYWORDS = new Set(['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'goto', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while'])

/** Lua source -> tokens { t: 'kw'|'id'|'num'|'str'|'com'|'op'|'ws', v, line, open? } */
export function tokenize (src) {
  const out = []
  let i = 0, line = 1
  const push = (t, v, extra = {}) => { out.push({ t, v, line, ...extra }); line += (v.match(/\n/g) ?? []).length }
  const longBracket = (at) => { const m = /^\[(=*)\[/.exec(src.slice(at)); return m ? m[1].length : -1 }
  while (i < src.length) {
    const c = src[i]
    const rest = src.slice(i)
    let m
    if ((m = /^\s+/.exec(rest))) { push('ws', m[0]); i += m[0].length; continue }
    if (rest.startsWith('--')) {
      const lb = longBracket(i + 2)
      if (lb >= 0) {
        const close = ']' + '='.repeat(lb) + ']'
        const end = src.indexOf(close, i + 4 + lb)
        const v = end < 0 ? rest : src.slice(i, end + close.length)
        push('com', v, { open: end < 0 }); i += v.length; continue
      }
      const nl = rest.indexOf('\n')
      const v = nl < 0 ? rest : rest.slice(0, nl)
      push('com', v); i += v.length; continue
    }
    if (c === '[' && longBracket(i) >= 0) {
      const lb = longBracket(i)
      const close = ']' + '='.repeat(lb) + ']'
      const end = src.indexOf(close, i + 2 + lb)
      const v = end < 0 ? rest : src.slice(i, end + close.length)
      push('str', v, { open: end < 0 }); i += v.length; continue
    }
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1
      const closed = src[j] === c
      const v = src.slice(i, closed ? j + 1 : j)
      push('str', v, { open: !closed }); i += v.length; continue
    }
    if ((m = /^(0[xX][0-9a-fA-F]+|\d+\.?\d*([eE][+-]?\d+)?|\.\d+)/.exec(rest))) { push('num', m[0]); i += m[0].length; continue }
    if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest))) { push(KEYWORDS.has(m[0]) ? 'kw' : 'id', m[0]); i += m[0].length; continue }
    if ((m = /^(\.\.\.|\.\.|==|~=|<=|>=|::|\/\/|[-+*/%^#<>=(){}[\];:,.&|~])/.exec(rest))) { push('op', m[0]); i += m[0].length; continue }
    push('op', c); i += 1
  }
  return out
}

/** Blocks, brackets, strings and comments that do not close: [{ line, msg }]. */
export function check (src) {
  const problems = []
  const stack = []
  const opens = { function: 'end', if: 'end', do: 'end', repeat: 'until', '(': ')', '[': ']', '{': '}' }
  for (const tk of tokenize(src)) {
    if (tk.open) problems.push({ line: tk.line, msg: tk.t === 'com' ? 'a comment that never closes' : 'a string that never closes' })
    if (tk.t !== 'kw' && tk.t !== 'op') continue
    const v = tk.v
    // `while … do` and `for … do` open one block, at their `do`.
    if (v in opens) stack.push({ v, line: tk.line })
    else if (v === 'end' || v === 'until' || v === ')' || v === ']' || v === '}') {
      const top = stack.pop()
      if (!top) problems.push({ line: tk.line, msg: `"${v}" with nothing open` })
      else if (opens[top.v] !== v) problems.push({ line: tk.line, msg: `"${v}" closes "${top.v}" from line ${top.line}` })
    }
  }
  for (const s of stack) problems.push({ line: s.line, msg: `"${s.v}" is never closed` })
  return problems.sort((a, b) => a.line - b.line)
}

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
function render (src, problems) {
  const hl = document.getElementById('hl')
  hl.innerHTML = tokenize(src).map((tk) => (tk.t === 'kw' || tk.t === 'str' || tk.t === 'com' || tk.t === 'num') ? `<span class="${tk.t}">${esc(tk.v)}</span>` : esc(tk.v)).join('') + '\n'
  const bad = new Set(problems.map((p) => p.line))
  const n = src.split('\n').length
  document.getElementById('gutter').innerHTML = Array.from({ length: n }, (_, k) => bad.has(k + 1) ? `<span class="bad">${k + 1}</span>` : String(k + 1)).join('\n')
  document.getElementById('problems').textContent = problems.length ? `line ${problems[0].line}: ${problems[0].msg}${problems.length > 1 ? ` (+${problems.length - 1})` : ''}` : ''
  const ta = document.getElementById('text')
  ta.style.height = 'auto'
  ta.style.height = `${Math.max(ta.scrollHeight, hl.scrollHeight)}px`
}

if (typeof document !== 'undefined') {
  const ta = document.getElementById('text')
  let given = ''
  let suite = null
  const update = () => {
    const problems = check(ta.value)
    render(ta.value, problems)
    if (suite) {
      suite.dirty(ta.value !== given)
      suite.draft(ta.value)
      suite.diagnostics(problems.map((p) => ({ line: p.line, col: 1, sev: 'error', msg: p.msg })))
    }
  }
  ta.addEventListener('input', update)
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const { selectionStart: a, selectionEnd: b, value } = ta
      ta.value = value.slice(0, a) + '  ' + value.slice(b)
      ta.selectionStart = ta.selectionEnd = a + 2
      update()
    }
  })
  if (inSuite()) {
    suite = await connectSuite({
      onInit ({ name, payload }) {
        given = typeof payload === 'string' ? payload : new TextDecoder().decode(payload)
        ta.value = given
        document.getElementById('name').textContent = name
        update()
        suite.dirty(false)
      },
      onSave: () => ta.value,
      onSaved () { given = ta.value; suite.dirty(false) },
      // The studio's skin: the page's colours from its tokens; code stays monospace,
      // its highlighting in the skin's info / ok / warn colours.
      onSkin: (bundle, mode, pointer) => wearSkin(bundle, mode, pointer, {
        vars: { '--bg': 'color.bg.app', '--panel': 'color.bg.code', '--line': 'color.line.main', '--fg': 'color.text.primary', '--dim': 'color.text.dim',
          '--kw': 'color.info', '--str': 'color.ok', '--com': 'color.text.dim', '--num': 'color.warn', '--bad': 'color.error' },
        font: false, mono: ['body']
      })
    })
  } else update()
  globalThis.__code = { ta, check }
}
