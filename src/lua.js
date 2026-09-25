//
// JSON-shaped data to a Lua table literal.
//
// The trigger and mob tables the server loads are data, and the studio keeps
// them as JSON. This writes that JSON as the Lua the runtime reads, and it is
// deliberately dumb: keys in the order they were given, values as they are,
// nothing inferred. The one opinion it has is about numbers -- a fractional
// JS number is refused, because the runtime refuses a fractional Lua number
// (docs/TRIGGERS.md, "Numbers") and the studio must not be the thing that
// turned "0.25" into 0.25 on the way through.
//
// A fixed-point value is therefore a whole number, an exact decimal STRING, or
// a two-element array [numerator, denominator], which comes out as `{ n, d }`
// -- the fraction form the runtime accepts.
//

const KEYWORDS = new Set(('and break do else elseif end false for function if in local nil ' +
                          'not or repeat return then true until while').split(' '))

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

export function luaString (s) {
  let out = '"'
  for (const ch of s) {
    const c = ch.codePointAt(0)
    if (ch === '"') out += '\\"'
    else if (ch === '\\') out += '\\\\'
    else if (ch === '\n') out += '\\n'
    else if (ch === '\r') out += '\\r'
    else if (ch === '\t') out += '\\t'
    else if (c < 0x20 || c === 0x7f) out += '\\' + String(c).padStart(3, '0')
    else out += ch
  }
  return out + '"'
}

const luaKey = (k) => (IDENT.test(k) && !KEYWORDS.has(k)) ? k : `[${luaString(k)}]`

const isScalar = (v) => v === null || v === undefined || typeof v !== 'object'

/**
 * @param value   null, boolean, integer, string, array or plain object
 * @param indent  current indentation (for nested tables)
 * @param path    where we are, for the error a fractional number raises
 */
export function toLua (value, indent = '', path = 'value') {
  if (value === null || value === undefined) return 'nil'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new Error(`${path}: ${value} is not a whole number; write it as an exact decimal string or [numerator, denominator]`)
    }
    return String(value)
  }
  if (typeof value === 'string') return luaString(value)
  if (typeof value !== 'object') throw new Error(`${path}: cannot write a ${typeof value}`)

  const inner = indent + '  '
  if (Array.isArray(value)) {
    if (value.length === 0) return '{}'
    if (value.every(isScalar)) return `{ ${value.map((v, i) => toLua(v, inner, `${path}[${i}]`)).join(', ')} }`
    const items = value.map((v, i) => `${inner}${toLua(v, inner, `${path}[${i}]`)},`)
    return `{\n${items.join('\n')}\n${indent}}`
  }
  const keys = Object.keys(value).filter((k) => value[k] !== undefined)
  if (keys.length === 0) return '{}'
  const flat = keys.every((k) => isScalar(value[k]))
  const parts = keys.map((k) => `${luaKey(k)} = ${toLua(value[k], inner, `${path}.${k}`)}`)
  const oneLine = `{ ${parts.join(', ')} }`
  if (flat && oneLine.length + indent.length <= 100) return oneLine
  return `{\n${parts.map((p) => `${inner}${p},`).join('\n')}\n${indent}}`
}

/** A .lua file with the `-- >>> level editor: <name>` / `-- <<<` markers around `body`. */
export function block (name, body) {
  return `-- >>> level editor: ${name}\n${body}\n-- <<< level editor: ${name}`
}
