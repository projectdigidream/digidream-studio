# Changelog

What changed in each release of the studio, fixes first. Kept as fixes land:
anything not released yet is under **Unreleased**.

## Unreleased

## 0.3.1 -- 2026-10-15

Built on engine 0.1.2.

### Fixed

- **A first room was invisible**: new rooms had no textures, so a room
  showed as an outline in plan view and not at all in 3D. A new room now
  takes the module's own textures (a FLOOR and a WALL by name when there
  are such), then the app's; a module with none gets two plain ones,
  `PLAIN_FLOOR` and `PLAIN_WALL`.
- A new module's first map could take textures from the module open before.
- **No music or sound effects on Android**, in the studio's Play and in
  games packaged from it (the engine's kits lacked the audio engines; see
  the engine's 0.1.2).
- Weapons with a swing arc set as a fraction ran unpredicted on Android,
  without their first-person animations (engine 0.1.2).

### Changed

- The Package page shows where kits come from and offers to download a
  missing one from the engine's releases.
- A README: download, a first room, running it from source.

## 0.3.0 -- 2026-10-14

The first public release.
