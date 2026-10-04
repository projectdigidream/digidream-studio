//
// The map's own .lua: its placed things and its triggers, from the document.
//
// GENERATED WHOLE. The old convention spliced marker blocks into a file a
// person might also edit; here the document is the only source, so the file
// is rewritten from scratch on every bake and the markers are kept only so
// the blocks are recognisable. A level's hand-written Lua, if it needs any,
// lives in the document's `extraLua` and is written first, verbatim.
//
// GEOMETRY BY REFERENCE, INDICES AT THE END. A trigger in the document points
// at an edge or a sector by id. This resolves each one through the tables
// mapfmt.emitMap built while writing the .map, and writes the guards the
// runtime insists on beside every index (docs/TRIGGERS.md, "side_is"):
//
//   { edge: e }       -> side = <index of e>,        expect_neighbour = <its neighbour or -1>
//   { edgeTwin: e }   -> side = <index facing e>,    expect_neighbour = <e's own sector>
//   { sector: s }     -> sector = <index of s>,      expect_tag = <s's tag>
//   { trigger: t }    -> the name of t
//
// The index and the guard come from the same walk that wrote the .map, so the
// runtime's check passes by construction -- and still runs, because a .map
// someone re-baked by hand is exactly the case it exists for.
//
import { RES } from './doc.js'
import { toLua, luaString, block } from './lua.js'

const ENTITIES_HEADER = `-- Placed props and monsters. Positions are eighths of a unit, which is the
-- studio's grid, so fx.frac(n, 8) is exact.`

/**
 * @param doc       the document
 * @param emitted   what mapfmt.emitMap returned for the same document
 * @param guards    TEST ONLY: false leaves the staleness guards out
 * @returns { text, problems }   problems are references that did not resolve
 */
export function emitMapLua (doc, emitted, { guards = true, panels = doc.panels ?? null } = {}) {
  const problems = []
  const L = []
  L.push(`-- ${doc.name}.lua -- written by the studio from ${doc.name}.studio.json.`)
  L.push('-- Edit the level there; this file is rewritten on every bake.')
  if (doc.extraLua && doc.extraLua.trim()) {
    L.push('')
    L.push(doc.extraLua.trimEnd())
  }

  // --- the camera -------------------------------------------------------------
  // For everyone who joins the map (docs/protocol.md §11.1). Turns and units,
  // written as thousandths over 1000 so the file holds only whole numbers.
  const cam = doc.camera ?? {}
  const milli = (v) => Math.round(v * 1000)
  const camFields = []
  if (cam.yaw != null) camFields.push(`yaw = ${milli(cam.yaw)} / 1000`)
  if (cam.pitch != null) camFields.push(`pitch = ${milli(cam.pitch)} / 1000`)
  if (cam.distance != null) camFields.push(`distance = ${milli(cam.distance)} / 1000`)
  if (cam.lockYaw) camFields.push('lock_yaw = 1')
  if (cam.lockZoom) camFields.push('lock_zoom = 1')
  // The camera modes (design §4.1). `cam_path` is a path's TAG; the wire says
  // NEGATIVE means none, so a map that names no path says nothing at all here
  // rather than sending a 0, which is a legal tag.
  const MODE = { follow: 0, track: 1, flythrough: 2, auto: 3 }
  if (cam.mode && cam.mode in MODE) camFields.push(`cam_mode = ${MODE[cam.mode]}`)
  if (cam.path != null) camFields.push(`cam_path = ${Math.round(cam.path)}`)
  if (cam.speed != null) camFields.push(`cam_path_speed = ${milli(cam.speed)} / 1000`)
  if (cam.attach != null) camFields.push(`cam_path_attach = ${milli(cam.attach)} / 1000`)
  if (cam.blend != null) camFields.push(`cam_path_blend = ${milli(cam.blend)} / 1000`)
  if (camFields.length) {
    L.push('')
    L.push('-- The camera this map is played from, for everyone who joins it.')
    L.push('if dnp ~= nil and dnp.level_camera ~= nil then')
    L.push(`  dnp.level_camera{ ${camFields.join(', ')} }`)
    L.push('end')
  }

  // --- entities ---------------------------------------------------------------
  const props = doc.entities.filter((e) => e.kind === 'prop')
  const mobs = doc.entities.filter((e) => e.kind === 'mob')
  if (props.length || mobs.length) {
    const P = (e) => `{name=${luaString(e.name)}, x=${Math.round(e.x * RES)}, y=${Math.round(e.y * RES)}, z=${Math.round(e.z * RES)}` +
                     (e.dormant ? ', dormant=true}' : '}')
    const body = [
      ENTITIES_HEADER,
      'if dnp ~= nil and fx ~= nil and vec3 ~= nil then',
      `  local function du(n) return fx.frac(n, ${RES}) end`,
      '  -- props',
      '  for _, p in ipairs({',
      ...props.map((e) => `    ${P(e)},`),
      '  }) do dnp.spawn_prop(p.name, vec3.new(du(p.x), du(p.y), du(p.z))) end',
      '  -- end props',
      '  -- monsters',
      '  local M = {',
      ...mobs.map((e) => `    ${P(e)},`),
      '  }',
      '  -- end monsters',
      '  if #M > 0 and mobs ~= nil then',
      '    local placed, unknown = 0, {}',
      '    for _, e in ipairs(M) do',
      '      local m = mobs.spawn(e.name, vec3.new(du(e.x), du(e.y), du(e.z)), { dormant = e.dormant == true })',
      '      if m ~= nil then placed = placed + 1 else unknown[#unknown + 1] = e.name end',
      '    end',
      '    print(("[studio] %d monster(s) placed%s"):format(placed,',
      '      #unknown > 0 and (", " .. #unknown .. " the mob runtime does not define: " .. table.concat(unknown, ", ")) or ""))',
      '  end',
      'end'
    ].join('\n')
    L.push('')
    L.push(block('entities', body))
  }

  // --- triggers ---------------------------------------------------------------
  // A panel a graph's `ui_open` opens is the trigger table's too, so a map
  // with such a panel and no cards still writes a (cardless) table.
  const hasPanels = panels && Object.keys(panels).length > 0
  if (doc.triggers.length || hasPanels) {
    const resolve = makeResolver(doc, emitted, { guards, problems })
    const table = {
      name: doc.name,
      ...(hasPanels ? { panels } : {}),
      triggers: doc.triggers.map((t) => {
        const where = `trigger "${t.name}"`
        const out = { name: t.name }
        if (t.event) out.event = t.event
        if (t.once) out.once = true
        if (t.enabled === false) out.enabled = false
        if (t.conditions?.length) out.conditions = t.conditions.map((c) => resolve(c, where))
        out.actions = (t.actions ?? []).map((a) => resolve(a, where))
        return out
      })
    }
    L.push('')
    L.push(block('triggers', `triggers.load${toLua(table)}`))
  }
  L.push('')
  return { text: L.join('\n'), problems }
}

/**
 * Geometry references to the numbers the runtime takes, from the same ordered
 * walk that wrote the .map: `{edge}` / `{edgeTwin}` to a side index with its
 * `expect_neighbour` guard, `{sector}` to an index with its `expect_tag`, and
 * `{trigger}` to the trigger's name. Shared by the trigger table and a map's
 * graph (graphs_emit.js), whose verbs are the trigger vocabulary's.
 *
 * @returns resolve(obj, where) -> a copy with every reference replaced;
 *          what cannot be resolved is pushed onto `problems`
 */
export function makeResolver (doc, emitted, { guards = true, problems = [] } = {}) {
  const byId = new Map((doc.triggers ?? []).map((t) => [t.id, t]))
  const sideOf = (ref, where) => {
    if ('edge' in ref) {
      const idx = emitted.sideIndex.get(ref.edge)
      if (idx === undefined) { problems.push(`${where}: edge ${ref.edge} is not in the map`); return null }
      const n = emitted.sides[idx].neighbor
      return { side: idx, expect_neighbour: n === null ? -1 : emitted.sectorIndex.get(n) }
    }
    const idx = emitted.twinIndex.get(ref.edgeTwin)
    const own = emitted.sides[emitted.sideIndex.get(ref.edgeTwin)]
    if (idx === undefined || idx < 0 || !own) { problems.push(`${where}: nothing faces edge ${ref.edgeTwin}`); return null }
    return { side: idx, expect_neighbour: emitted.sectorIndex.get(own.sector) }
  }
  return (obj, where) => {
    const out = {}
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        if ('edge' in v || 'edgeTwin' in v) {
          const s = sideOf(v, where)
          if (s) { out.side = s.side; if (guards) out.expect_neighbour = s.expect_neighbour }
        } else if ('sector' in v) {
          const idx = emitted.sectorIndex.get(v.sector)
          if (idx === undefined) { problems.push(`${where}: sector ${v.sector} is not in the map`); continue }
          out[k] = idx
          if (guards) out.expect_tag = doc.sectors[v.sector].tag
        } else if ('trigger' in v) {
          const t = byId.get(v.trigger)
          if (!t) { problems.push(`${where}: trigger ${v.trigger} does not exist`); continue }
          out[k] = t.name
        } else {
          problems.push(`${where}: cannot write ${JSON.stringify(v)}`)
        }
      } else {
        out[k] = v
      }
    }
    return out
  }
}
