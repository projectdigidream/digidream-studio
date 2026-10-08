//
// PNG in and out, in plain JS, for the bakers (docs/PLUGINS.md, Bakers).
//
// A baker runs in a page's Worker and in node and must make the same bytes in
// both -- the bake cache and `emit_module.mjs --check` depend on it -- so the
// deflate is fflate's (pure JS, vendor/fflate.js), never the platform's
// CompressionStream, whose zlib differs between Chrome, Safari and node.
//
// Decoding takes what a canvas or a paint program writes: 8-bit (and 1/2/4-bit
// grey and palette) colour types 0, 2, 3, 4 and 6, with tRNS, not interlaced.
// Encoding writes 8-bit RGBA, each row with the filter that suits it best.
//
import { zlibSync, unzlibSync } from '../../vendor/fflate.js'

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32 (bytes, from = 0, to = bytes.length) {
  let c = 0xFFFFFFFF
  for (let i = from; i < to; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

export const isPng = (b) => b && b.length > 8 && SIG.every((x, i) => b[i] === x)

/** PNG bytes -> { w, h, rgba: Uint8Array (straight alpha) }. Throws on what it cannot read. */
export function decodePng (bytes) {
  if (!isPng(bytes)) throw new Error('not a PNG')
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let at = 8
  let w = 0, h = 0, depth = 0, type = 0, interlace = 0
  let palette = null, trns = null
  const idat = []
  while (at + 8 <= bytes.length) {
    const len = dv.getUint32(at)
    const kind = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7])
    const data = bytes.subarray(at + 8, at + 8 + len)
    if (kind === 'IHDR') {
      w = dv.getUint32(at + 8); h = dv.getUint32(at + 12)
      depth = bytes[at + 16]; type = bytes[at + 17]; interlace = bytes[at + 20]
    } else if (kind === 'PLTE') palette = data
    else if (kind === 'tRNS') trns = data
    else if (kind === 'IDAT') idat.push(data)
    else if (kind === 'IEND') break
    at += 12 + len
  }
  if (!w || !h) throw new Error('a PNG without a size')
  if (interlace) throw new Error('an interlaced PNG (save it again without interlacing)')
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type]
  if (!channels) throw new Error(`a PNG of colour type ${type}`)
  if (depth === 16) throw new Error('a 16-bit PNG (save it as 8-bit)')
  if (type !== 0 && type !== 3 && depth !== 8) throw new Error(`a ${depth}-bit PNG of colour type ${type}`)
  let total = 0
  for (const d of idat) total += d.length
  const z = new Uint8Array(total)
  let o = 0
  for (const d of idat) { z.set(d, o); o += d.length }
  const raw = unzlibSync(z)
  const bpp = Math.max(1, (channels * depth) >> 3)             // bytes per pixel, for the filters
  const stride = Math.ceil((w * channels * depth) / 8)
  if (raw.length < h * (stride + 1)) throw new Error('a PNG whose data is short')
  const lines = new Uint8Array(h * stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const out = lines.subarray(y * stride, (y + 1) * stride)
    const up = y ? lines.subarray((y - 1) * stride, y * stride) : null
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0
      const b = up ? up[i] : 0
      const c = up && i >= bpp ? up[i - bpp] : 0
      let v = src[i]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c } else if (f !== 0) throw new Error(`a PNG row with filter ${f}`)
      out[i] = v & 0xFF
    }
  }
  const rgba = new Uint8Array(w * h * 4)
  const sample = (row, x) => {                                    // one grey or palette sample, any depth up to 8
    if (depth === 8) return row[x]
    const bit = x * depth
    return (row[bit >> 3] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1)
  }
  const greyKey = type === 0 && trns?.length >= 2 ? (trns[0] << 8) | trns[1] : -1
  const rgbKey = type === 2 && trns?.length >= 6 ? [(trns[0] << 8) | trns[1], (trns[2] << 8) | trns[3], (trns[4] << 8) | trns[5]] : null
  for (let y = 0; y < h; y++) {
    const row = lines.subarray(y * stride, (y + 1) * stride)
    for (let x = 0; x < w; x++) {
      const d = (y * w + x) * 4
      if (type === 6) { rgba.set(row.subarray(x * 4, x * 4 + 4), d) } else if (type === 2) {
        const r = row[x * 3], g = row[x * 3 + 1], b = row[x * 3 + 2]
        rgba[d] = r; rgba[d + 1] = g; rgba[d + 2] = b
        rgba[d + 3] = rgbKey && r === rgbKey[0] && g === rgbKey[1] && b === rgbKey[2] ? 0 : 255
      } else if (type === 4) {
        const g = row[x * 2]
        rgba[d] = rgba[d + 1] = rgba[d + 2] = g; rgba[d + 3] = row[x * 2 + 1]
      } else if (type === 0) {
        const s = sample(row, x)
        const g = Math.round((s * 255) / ((1 << depth) - 1))
        rgba[d] = rgba[d + 1] = rgba[d + 2] = g; rgba[d + 3] = s === greyKey ? 0 : 255
      } else {
        const i = sample(row, x)
        if (!palette || i * 3 + 2 >= palette.length) throw new Error('a palette PNG pointing past its palette')
        rgba[d] = palette[i * 3]; rgba[d + 1] = palette[i * 3 + 1]; rgba[d + 2] = palette[i * 3 + 2]
        rgba[d + 3] = trns && i < trns.length ? trns[i] : 255
      }
    }
  }
  return { w, h, rgba }
}

function chunk (type, data) {
  const out = new Uint8Array(12 + data.length)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  dv.setUint32(8 + data.length, crc32(out, 4, 8 + data.length))
  return out
}

/** 8-bit straight RGBA -> PNG bytes; the same bytes wherever it runs. */
export function encodePng (w, h, rgba) {
  const ihdr = new Uint8Array(13)
  const dv = new DataView(ihdr.buffer)
  dv.setUint32(0, w); dv.setUint32(4, h)
  ihdr[8] = 8; ihdr[9] = 6
  const stride = w * 4
  const raw = new Uint8Array(h * (stride + 1))
  // Each row takes the filter whose output has the smallest sum of absolute
  // values (the usual heuristic, as libpng's): deterministic, so the same
  // pixels are always the same bytes, and a third smaller than no filter.
  const cand = Array.from({ length: 5 }, () => new Uint8Array(stride))
  for (let y = 0; y < h; y++) {
    const row = rgba.subarray(y * stride, (y + 1) * stride)
    const up = y ? rgba.subarray((y - 1) * stride, y * stride) : null
    let best = 0, bestSum = Infinity
    for (let f = 0; f < 5; f++) {
      const out = cand[f]
      let sum = 0
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? row[i - 4] : 0, b = up ? up[i] : 0, c = up && i >= 4 ? up[i - 4] : 0
        let pred = 0
        if (f === 1) pred = a
        else if (f === 2) pred = b
        else if (f === 3) pred = (a + b) >> 1
        else if (f === 4) { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
        const v = (row[i] - pred) & 0xFF
        out[i] = v
        sum += v < 128 ? v : 256 - v
      }
      if (sum < bestSum) { bestSum = sum; best = f }
    }
    raw[y * (stride + 1)] = best
    raw.set(cand[best], y * (stride + 1) + 1)
  }
  const parts = [new Uint8Array(SIG), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw, { level: 9 })), chunk('IEND', new Uint8Array(0))]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

/** A data: URL's bytes (what a qPainter project keeps its pictures as). */
export function dataUrlBytes (url) {
  const m = /^data:[^,]*?(;base64)?,(.*)$/s.exec(String(url))
  if (!m) throw new Error('not a data URL')
  if (!m[1]) return new TextEncoder().encode(decodeURIComponent(m[2]))
  const bin = atob(m[2])
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
