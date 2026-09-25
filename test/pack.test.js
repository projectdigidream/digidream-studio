//
// A pack the studio writes is a zip anything can open, and one the studio
// reads is checked before a byte of it is trusted.
//
// ORACLES: the system's `unzip -t` (skipped loudly when absent) and Node's
// own zlib, which inflates every entry independently of the reader under test.
//
import { writeFileSync, mkdtempSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { inflateRawSync } from 'node:zlib'
import { writePack, readPack, crc32, okPath } from '../src/pack.js'

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

check(crc32(new TextEncoder().encode('123456789')) === 0xCBF43926, 'CRC-32 check value')

const noise = new Uint8Array(5000)
for (let i = 0; i < noise.length; i++) noise[i] = (i * 7919) & 0xFF
const entries = [
  { path: 'module.txt', bytes: 'name Test\nid test\n' },
  { path: 'maps/first.map', bytes: 'sector floor 0 ceil 8\n'.repeat(40) },
  { path: 'maps/first.dnpm', bytes: noise },
  { path: 'assets/textures/empty.png', bytes: new Uint8Array(0) }
]
const zip = await writePack(entries)
check(zip.length > 0 && zip[0] === 0x50 && zip[1] === 0x4b, 'it starts like a zip')

// Read back through Node's zlib rather than through readPack, by walking the
// central directory here, so the writer is checked against something else.
{
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const eocd = zip.length - 22
  check(v.getUint32(eocd, true) === 0x06054b50, 'the end record is where a comment-less zip puts it')
  const count = v.getUint16(eocd + 10, true)
  check(count === entries.length, `${count} entries in the central directory`)
  let at = v.getUint32(eocd + 16, true)
  const dec = new TextDecoder()
  for (let n = 0; n < count; n++) {
    const method = v.getUint16(at + 10, true)
    const csize = v.getUint32(at + 20, true)
    const nlen = v.getUint16(at + 28, true)
    const local = v.getUint32(at + 42, true)
    const path = dec.decode(zip.subarray(at + 46, at + 46 + nlen))
    const lnlen = v.getUint16(local + 26, true)
    const data = zip.subarray(local + 30 + lnlen, local + 30 + lnlen + csize)
    const raw = method === 8 ? new Uint8Array(inflateRawSync(data)) : data
    const want = entries.find((e) => e.path === path)
    const wantBytes = typeof want.bytes === 'string' ? new TextEncoder().encode(want.bytes) : want.bytes
    check(raw.length === wantBytes.length && raw.every((b, i) => b === wantBytes[i]), `zlib inflates ${path} to the original`)
    if (path === 'maps/first.map') check(method === 8, 'repetitive text was deflated')
    at += 46 + nlen + v.getUint16(at + 30, true) + v.getUint16(at + 32, true)
  }
}

const back = await readPack(zip)
check(back.length === entries.length, `readPack returns ${back.length} entries`)
for (const e of entries) {
  const got = back.find((b) => b.path === e.path)
  const want = typeof e.bytes === 'string' ? new TextEncoder().encode(e.bytes) : e.bytes
  check(got && got.bytes.length === want.length && got.bytes.every((b, i) => b === want[i]), `${e.path} round-trips`)
}

const stored = await writePack(entries, { deflate: false })
const back2 = await readPack(stored)
check(back2.length === entries.length && back2.every((b) => b.bytes.length === back.find((x) => x.path === b.path).bytes.length),
      'a stored (uncompressed) pack reads back the same')

// CONTROL: a flipped byte inside an entry is refused, not returned.
{
  const bad = new Uint8Array(zip)
  const v = new DataView(bad.buffer)
  // The third entry's data starts after its local header; find it by name.
  const name = new TextEncoder().encode('maps/first.dnpm')
  let at = -1
  for (let i = 0; i < bad.length - name.length; i++) {
    if (v.getUint32(i, true) === 0x04034b50 && bad.subarray(i + 30, i + 30 + name.length).every((b, k) => b === name[k])) { at = i; break }
  }
  check(at >= 0, 'CONTROL: found the entry to corrupt')
  bad[at + 30 + name.length + 100] ^= 0xFF
  let refused = null
  try { await readPack(bad) } catch (e) { refused = e.message }
  check(refused !== null && /checksum|inflate/.test(refused), `CONTROL: a corrupt entry is refused (${refused})`)
}

// CONTROL: an entry that would escape the module directory is refused.
check(!okPath('../etc/passwd') && !okPath('/abs') && !okPath('a//b') && !okPath('C:/x') && okPath('maps/a.dnpm'),
      'CONTROL: escaping paths are refused, plain ones pass')
let esc = null
try { await writePack([{ path: '../x', bytes: 'y' }]) } catch (e) { esc = e.message }
check(esc !== null, 'CONTROL: the writer refuses an escaping path too')

// The system's unzip agrees, when there is one.
const has = spawnSync('unzip', ['-v'], { encoding: 'utf8' })
if (has.error) {
  console.log('pack: no unzip on this machine -- the system oracle is skipped')
} else {
  const dir = mkdtempSync(join(tmpdir(), 'dnp-pack-'))
  const f = join(dir, 'test.zip')
  writeFileSync(f, zip)
  const r = spawnSync('unzip', ['-t', f], { encoding: 'utf8' })
  check(r.status === 0 && /No errors detected/.test(r.stdout), `unzip -t accepts the pack:\n${r.stdout}${r.stderr}`)
}

console.log(`\npack: ${checks} checks, ${fails} failures`)
process.exit(fails === 0 ? 0 : 1)
