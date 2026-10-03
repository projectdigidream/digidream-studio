//
// Which rooms a refused bake is about.
//
// mapc says what is wrong in three ways: by LINE of the .map (`12: sector
// could not be triangulated`), by SECTOR INDEX (`sector 3 partially overlaps
// sector 5`), and by SIDE INDEX (`side 40 names sector 9, which does not
// exist`). Each of those is a number in a file the studio wrote, and the
// emitter kept the tables to read them back (mapfmt.emitMap: lineOwner,
// sectorIndex, sides) -- so every complaint that names a place becomes the
// sector, and where it can the wall, in the document. The studio's own
// checks (doc.validate, topology's warnings) already speak in sector ids.
//
// A message that names no place stays a message: the status line still has
// it, and nothing is highlighted for it rather than something guessed.
//

/**
 * @param errors    [{ line, msg }] from the bake (mapc's stderr, one per line)
 * @param emitted   mapfmt.emitMap's result for the same text, or null
 * @param extra     [{ sector, msg, level? }] from the studio's own checks
 * @returns [{ sector, edge?, msg, level: 'error' | 'warn' }]
 */
export function sectorProblems (errors = [], emitted = null, extra = []) {
  const out = []
  const idOf = new Map()
  for (const [id, i] of emitted?.sectorIndex ?? []) idOf.set(i, id)
  let last = []
  for (const e of errors) {
    if (!String(e.msg).trim()) continue
    const found = []
    const own = e.line > 0 ? emitted?.lineOwner?.[e.line] : null
    if (own) found.push({ sector: own.sector, edge: own.edge })
    for (const m of String(e.msg).matchAll(/\bsector (\d+)\b/g)) {
      const id = idOf.get(Number(m[1]))
      if (id && !found.some((f) => f.sector === id)) found.push({ sector: id })
    }
    for (const m of String(e.msg).matchAll(/\bside (\d+)\b/g)) {
      const rec = emitted?.sides?.[Number(m[1])]
      if (rec && !found.some((f) => f.sector === rec.sector)) found.push({ sector: rec.sector, edge: rec.edge?.id })
    }
    if (found.length) {
      last = found.map((f) => ({ ...f, msg: nameSectors(String(e.msg).trim(), emitted), level: 'error' }))
      out.push(...last)
    } else if (e.line === 0 && last.length && /^\s|^[a-z(]/.test(e.msg)) {
      // mapc's longer explanations run over several lines; the rest of one
      // belongs to the rooms its first line named.
      for (const p of last) p.msg += ` ${String(e.msg).trim()}`
    } else last = []
  }
  for (const p of extra) if (p.sector) out.push({ sector: p.sector, edge: p.edge, msg: p.msg, level: p.level ?? 'error' })
  return out
}

/** The problems about one sector, as text, for its inspector. */
export function problemsFor (problems, sectorId) {
  return (problems ?? []).filter((p) => p.sector === sectorId)
}

/**
 * mapc's message with its sector indices replaced by the studio's own names
 * for them ("sector 0" -> "sector s11"), which is what the inspector's title
 * and every other place in the studio calls a room. A side index is named by
 * its room.
 */
export function nameSectors (msg, emitted) {
  if (!emitted?.sectorIndex) return msg
  const idOf = new Map()
  for (const [id, i] of emitted.sectorIndex) idOf.set(i, id)
  return String(msg)
    .replace(/\bsector (\d+)\b/g, (all, n) => (idOf.has(Number(n)) ? `sector ${idOf.get(Number(n))}` : all))
    .replace(/\bside (\d+)\b/g, (all, n) => { const rec = emitted.sides?.[Number(n)]; return rec ? `a wall of sector ${rec.sector}` : all })
}
