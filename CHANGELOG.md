# Changelog

What changed in each release of the studio, fixes first. Kept as fixes land:
anything not released yet is under **Unreleased**.

## Unreleased

### Added

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
