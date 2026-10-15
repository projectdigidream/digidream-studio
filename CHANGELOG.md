# Changelog

What changed in each release of the studio, fixes first. Kept as fixes land:
anything not released yet is under **Unreleased**.

## Unreleased

### Fixed

- **On Android, GitHub sync could not fetch the repository** (and the update
  check never answered): the Android shell refused every request off the
  app. The studio's shell now reaches the hosts its plugins declare (engine,
  Unreleased).

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
