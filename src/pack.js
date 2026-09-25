//
// A module pack is a zip of the module's root, nothing more.
//
// The engine already knows how to load a directory called a module
// (docs/MODULES.md); a pack is that directory in one file, so the standalone
// engine uses one by unzipping it into modules/ and passing --module. No
// manifest, no signing, no format of our own: `unzip` is the reference
// reader, and the test holds this writer to it.
//
// Written by hand because the browser has no zip and the studio has no
// dependencies. Deflate comes from CompressionStream where the platform has
// it (every WebView the studio runs in, and Node) and entries are stored raw
// where it does not. The reader checks every CRC and refuses any path that
// could escape the directory it is unpacked into -- a pack is a file somebody
// else made.
//

const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
  CRC_TABLE[n] = c >>> 0
}

export function crc32 (bytes) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

const enc = new TextEncoder()
const dec = new TextDecoder()

async function pipe (bytes, Stream, kind) {
  const s = new Stream(kind)
  const w = s.writable.getWriter()
  w.write(bytes)
  w.close()
  const out = []
  let total = 0
  for await (const chunk of s.readable) { out.push(chunk); total += chunk.length }
  const all = new Uint8Array(total)
  let at = 0
  for (const c of out) { all.set(c, at); at += c.length }
  return all
}

const canDeflate = () => typeof CompressionStream === 'function'

// MS-DOS date and time for a header, from a JS Date; the format has nothing
// better and nothing reads it anyway.
function dosTime (d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, date }
}

/**
 * @param entries  [{ path, bytes: Uint8Array | string }] -- paths relative to
 *                 the pack root, forward slashes, no leading slash
 * @returns Uint8Array, the zip
 */
export async function writePack (entries, { when = new Date(2020, 0, 1, 0, 0, 0), deflate = canDeflate() } = {}) {
  const parts = []
  const central = []
  let offset = 0
  const { time, date } = dosTime(when)
  for (const e of entries) {
    if (!okPath(e.path)) throw new Error(`refusing to pack a path that could escape: ${e.path}`)
    const raw = typeof e.bytes === 'string' ? enc.encode(e.bytes) : e.bytes
    const name = enc.encode(e.path)
    const crc = crc32(raw)
    let data = raw
    let method = 0
    if (deflate && raw.length > 0) {
      const z = await pipe(raw, CompressionStream, 'deflate-raw')
      if (z.length < raw.length) { data = z; method = 8 }
    }
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)          // version needed
    local.setUint16(6, 0x0800, true)      // flags: UTF-8 names
    local.setUint16(8, method, true)
    local.setUint16(10, time, true)
    local.setUint16(12, date, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true)
    local.setUint32(22, raw.length, true)
    local.setUint16(26, name.length, true)
    local.setUint16(28, 0, true)
    parts.push(new Uint8Array(local.buffer), name, data)

    const cd = new DataView(new ArrayBuffer(46))
    cd.setUint32(0, 0x02014b50, true)
    cd.setUint16(4, 20, true)             // made by
    cd.setUint16(6, 20, true)             // needed
    cd.setUint16(8, 0x0800, true)
    cd.setUint16(10, method, true)
    cd.setUint16(12, time, true)
    cd.setUint16(14, date, true)
    cd.setUint32(16, crc, true)
    cd.setUint32(20, data.length, true)
    cd.setUint32(24, raw.length, true)
    cd.setUint16(28, name.length, true)
    cd.setUint16(30, 0, true)             // extra
    cd.setUint16(32, 0, true)             // comment
    cd.setUint16(34, 0, true)             // disk
    cd.setUint16(36, 0, true)             // internal attrs
    cd.setUint32(38, 0, true)             // external attrs
    cd.setUint32(42, offset, true)
    central.push(new Uint8Array(cd.buffer), name)
    offset += 30 + name.length + data.length
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0)
  const eocd = new DataView(new ArrayBuffer(22))
  eocd.setUint32(0, 0x06054b50, true)
  eocd.setUint16(4, 0, true)
  eocd.setUint16(6, 0, true)
  eocd.setUint16(8, entries.length, true)
  eocd.setUint16(10, entries.length, true)
  eocd.setUint32(12, cdSize, true)
  eocd.setUint32(16, offset, true)
  eocd.setUint16(20, 0, true)
  const all = [...parts, ...central, new Uint8Array(eocd.buffer)]
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of all) { out.set(p, at); at += p.length }
  return out
}

/** A path that stays inside the directory it is unpacked into. */
export function okPath (p) {
  if (typeof p !== 'string' || p.length === 0 || p.length > 512) return false
  if (p.startsWith('/') || p.includes('\\') || /^[A-Za-z]:/.test(p) || p.includes('\0')) return false
  return p.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..')
}

/**
 * @param bytes  a zip
 * @returns [{ path, bytes }] -- directories skipped, every CRC checked
 */
export async function readPack (bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // The end-of-central-directory record is the last thing in the file, after
  // an optional comment of up to 64K, so it is searched for backwards.
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('not a zip: no end-of-central-directory record')
  const count = view.getUint16(eocd + 10, true)
  let at = view.getUint32(eocd + 16, true)
  const out = []
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('corrupt zip: bad central directory entry')
    const method = view.getUint16(at + 10, true)
    const crc = view.getUint32(at + 16, true)
    const csize = view.getUint32(at + 20, true)
    const usize = view.getUint32(at + 24, true)
    const nlen = view.getUint16(at + 28, true)
    const xlen = view.getUint16(at + 30, true)
    const clen = view.getUint16(at + 32, true)
    const local = view.getUint32(at + 42, true)
    const path = dec.decode(bytes.subarray(at + 46, at + 46 + nlen))
    at += 46 + nlen + xlen + clen
    if (path.endsWith('/')) continue
    if (!okPath(path)) throw new Error(`refusing an entry that could escape the module directory: ${path}`)
    if (view.getUint32(local, true) !== 0x04034b50) throw new Error(`corrupt zip: bad local header for ${path}`)
    const lnlen = view.getUint16(local + 26, true)
    const lxlen = view.getUint16(local + 28, true)
    const start = local + 30 + lnlen + lxlen
    const data = bytes.subarray(start, start + csize)
    let raw
    if (method === 0) raw = data
    else if (method === 8) {
      try { raw = await pipe(data, DecompressionStream, 'deflate-raw') } catch (e) {
        throw new Error(`${path}: the data does not inflate (${e?.message || 'corrupt deflate stream'})`)
      }
    } else throw new Error(`${path}: compression method ${method} is not supported`)
    if (raw.length !== usize || crc32(raw) !== crc) throw new Error(`${path}: the data does not match its checksum`)
    out.push({ path, bytes: raw })
  }
  return out
}
