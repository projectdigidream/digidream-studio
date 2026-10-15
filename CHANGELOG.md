# Changelog

What changed in each release of the studio, fixes first. Kept as fixes land:
anything not released yet is under **Unreleased**.

## Unreleased

### Added

- **Which animations loop, for a sheet baked from a ThreeSprite project**: its
  card on the Sprites page has a "loops" switch per animation. ThreeSprite
  leaves the flag at its default (every animation looping, a death too); the
  studio keeps its choice in the module and applies it to every bake, and an
  animation that does not loop plays once and holds its last frame.

## 0.3.4.2 -- 2026-10-15

Built on engine 0.1.5.

### Added

- **An imported sprite sheet's animations are edited on the Sprites page**: a
  finished sheet (an atlas .json + .png) shows its animations, and the one
  picked plays beside its name, fps and loop; its frames can be moved,
  repeated and taken out, and any frame the sheet already has added; a new
  animation is made from the one shown, and one can be deleted. Only the
  sheet's JSON changes (checked by the client's own parser), never its
  pixels; a renamed animation is followed by the props and weapon views that
  name it. A sheet baked from a ThreeSprite project is still edited there.

### Fixed

- An imported sheet's card said "0 animation(s)": it now lists the sheet's own.

## 0.3.4.1 -- 2026-10-15

Built on engine 0.1.5.

### Added

- **The player's states, without a monster**: the Player page's skin tab sets
  the player's sprite sheet and which animation each of its states plays, and
  can make the player a body of its own ("+ a body of its own"). Before, the
  states could only be set from a monster's Body tab, so changing how the
  player was drawn meant making a monster. A body that also draws a monster
  is said, with a button to give the player a copy of its own.

### Fixed

- **A monster's own animation states could not be given an animation**: the
  Body tab listed only states 0-4, so a brain state with `anim 5` (a leap, a
  charge) or a `set_anim` to one had nothing to set. The list now holds every
  state number the brain uses, named by the states that use it, and "+ another
  state" adds one; the preview plays them too.
- A state given no animation was written to props.txt as `anim` with nothing
  after it; it is left out.

## 0.3.4 -- 2026-10-15

Built on engine 0.1.5.

### Added

- **This map's limits on the shared world's grid**: when the map has a cell on
  a metamap with a pitch, the map editor outlines that cell with a thick,
  bright band (the skin's `map.cell.edge`), the same thickness on screen at
  any zoom, so where it ends and a neighbour begins reads at a glance.

### Fixed

- **A sprite's per-view layer order from ThreeSprite was not baked**: a view
  that stacks its parts its own way (an arm in front from the front, behind
  from the back) came out in the one default order, because the studio baked
  with a ThreeSprite runtime from before the feature. It bakes with the
  current one, and every sprite is baked again at the next Play or Export.

## 0.3.3.1 -- 2026-10-15

Built on engine 0.1.4.1.

### Fixed

- GitHub sync: a big push no longer fails with "Sorry, your request timed
  out": a module's folder is built on its own, in batches GitHub can take
  (smaller ones when it still times out), and brief GitHub failures, its
  rate limit for fast writes and requests that never answer are waited out
  and tried again.
- GitHub sync: a conflict could keep coming back after "Keep these". A choice
  now holds even when GitHub moved on since (the version not kept stays in its
  history), the page says it is applying it, and only one studio tab syncs at a
  time.
- GitHub sync: with a module open in two tabs of the same browser, GitHub's
  change could be written into one tab and then saved over from the other --
  and pushed over GitHub's change. A module open in another tab is no longer
  written into; its badge says to close one.
- **On Android, GitHub sync could not fetch the repository** (and the update
  check never answered): the Android shell refused every request off the
  app. The studio's shell now reaches the hosts its plugins declare (engine
  0.1.4.1).

## 0.3.2 -- 2026-10-15

Built on engine 0.1.3.

### Fixed

- An edit in the DAW plugin made before its audio had started did not mark
  the editor "changed" (no draft, and the plugin test waited for it for
  good): the DAW now reports edits at once (DigidreamSynth, Unreleased).

### Added

- **Sync with GitHub** (the Sync page, a bundled plugin): keep modules in a
  GitHub repository and open them on your other devices. Paste a token for
  one repository -- or one for all of them, and pick from your repositories
  or make a new private one on the Sync page -- and the modules sync by themselves -- on open, a few seconds
  after a save, when the app comes back -- each sync a commit. Edits to
  different maps on two devices merge; a file changed on both asks which to
  keep, and the other stays in GitHub's history or the Snapshots. Modules
  only on GitHub come here with Get. No server of ours: the page talks to
  GitHub directly.
- The Sync page shows **progress bars** while it works: one per module with
  a word on the step (checking, downloading 2/6, saving, uploading, committing,
  waiting), and one for the whole run (1 of 4 modules).
- Plugins can open a web page in the system's browser (`open-url`).
- **What a sync plugin needs** (docs/PLUGINS.md, "A plugin that keeps modules
  somewhere else"): every module's files, unbaked and byte-stable
  (`record-files`, `modules`); a revision per module that rises on every save;
  `module-write`, which replaces a module -- the open one in place, keeping
  the map and view, after a snapshot -- and refuses one edited since; events
  (`module-opened`, `module-saved`, `foreground`); background **services**
  (hidden pages that run all session); **permissions** in plugin.json
  (`module-write`, `background`, `net:<host>`), shown when a plugin is
  installed and on the Plugins page; and `status` badges on Home and the rail.
- **A starting map** (Settings): the map the game starts on. **Play on Home
  starts there** -- it used to start on whichever map was open in the editor;
  Play in the map editor still starts on the map being edited. Unset, it is
  the first map by name, which is where the game starts too. The Package page
  starts its map choice on it.
- **A newer studio is said on Home**: the studio asks its GitHub releases
  (at most every six hours, never in the way), and when a later one is out
  Home shows it with what changed, a download that opens the release in the
  system's browser, and "not now". A "check for updates" button beside the
  version asks at once.
- **Play shows what it is doing**: a full-screen panel, in the studio's skin,
  from the press until the game appears -- baking sources, checking maps and
  graphs, baking maps, writing the module, starting the game -- with a bar and
  each step's time. Before, the studio went silent and then the game
  appeared. A step that fails stays on screen with its error, the play log
  and a way back.

## 0.3.1 -- 2026-10-15

Built on engine 0.1.2.

### Fixed

- Weapons with a swing arc set as a fraction (`{ 1, 8 }`) ran unpredicted on
  Android, so the first-person weapon never played its swing (engine 0.1.2).
- Play on a phone in first person asked for a pointer lock the WebView never
  grants, and "Click to look around" stayed on screen (engine 0.1.2).

## 0.3.0 -- 2026-10-14

The first public release. Rebuilt on 2026-10-15 (same version) with the
fixes below.

### Fixed

- **A first room was invisible**: new rooms had no textures, so a room
  showed as an outline in plan view and not at all in 3D. A new room now
  takes the module's own textures (a FLOOR and a WALL by name when there
  are such), then the app's; a module with none gets two plain ones,
  `PLAIN_FLOOR` and `PLAIN_WALL`.
- A new module's first map could take textures from the module open before.
- **No music or sound effects on Android**, in the studio's Play and in
  games packaged from it: the engine's kits lacked the audio engines (engine
  0.1.1.1's rebuild).

### Changed

- The Package page shows where kits come from and offers to download a
  missing one from the engine's releases.
- A README: download, a first room, running it from source.
