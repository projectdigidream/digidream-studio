// THE MAP A MODULE STARTS ON: the one its Settings name, else the first by
// name -- which is what the game does when nothing says otherwise (the server
// started without --map, a packaged game whose game.json names none). Play
// from Home starts here; the map editor's Play starts on the map being edited.
//
// Pure.

/** `module.startMap` when the module has that map, else the first of `names` by name; null without maps. */
export function startMapOf (module, names) {
  const all = [...names].sort()
  if (module?.startMap && all.includes(module.startMap)) return module.startMap
  return all[0] ?? null
}
