# Changelog

What changed in each release of the studio, fixes first. Kept as fixes land:
anything not released yet is under **Unreleased**.

## Unreleased

## 0.4.2.10 -- 2026-10-26

A development release (the dev branch), built on engine 0.2.3.10 (props, monsters
and players lit by the map).

- Its own light: a checkbox "its own light (not lit)" for props (the prop editor), monsters (Looks, and the body rows) and missiles (Looks), written as `bright` on the `prop` line; the game then draws it at full light instead of lighting it by its room and the lamps near it (engine 0.2.3.10).

## 0.4.2.9 -- 2026-10-26

A development release (the dev branch), built on engine 0.2.3.9 (map version
17, for effect areas).

### Added

- **Effect areas** (engine 0.2.3.9): a room's kind can be "effect area", a
  volume for its effects (rain, snow, dust, embers, fog) laid over anything --
  rooms, platforms, other effect areas -- with nothing drawn and nothing to
  bump into. Its panel is its bottom, top, effects and tag; "when sector
  entered" and "when sector left" hear a body come in and go out. It is outlined
  on the map, and taken by tapping its outline (a tap inside is the room's).

### Fixed

- **An effect's numbers showed a decimal comma** on a computer set to one ("0,5"):
  they show a point, and a comma typed is read.

### Fixed

- **On the metamap, the grid covers the map's own tile**: it was a square about
  the origin, which a tile larger than 256 units ran off and which went on past
  the tile's edge. It now fills the tile exactly, a line a unit and a brighter
  one every 8.

## 0.4.2.8 -- 2026-10-25

A development release (the dev branch), built on engine 0.2.3.8.

### Added

- **Several rooms at once in the map editor**: Shift+click a room (on a phone,
  hold it, or switch on "adding rooms" in its panel) to add it to the selection
  or take it out; Shift+drag on the floor takes a box of rooms; ⌘/Ctrl+A takes
  them all. Dragging one moves them all, with the rooms inside them and the
  monsters, props and lights standing in them. Their panel copies, duplicates,
  pastes, turns them a quarter either way, mirrors them, raises or lowers them
  (by a step or any typed amount), gives them one floor or ceiling texture or
  light, and deletes them. ⌘/Ctrl+C, V and D copy, paste and duplicate; a copy
  pastes on another map too (the map menu has "Paste rooms"), in the middle of
  the view. A copy carries no tag and no triggers, and the start stays where it
  is.
- **Heights in finer steps with the grid off**: a room's floor, ceiling and
  thickness, and a thing's height, take a 256th of a unit when the grid is
  switched off (they rounded what was typed to a quarter).
- **Variable jump** (engine 0.2.3.8): Player → jumping has "variable_jump" (a jump
  as high as JUMP is held) and "jump_release_keep".
- **The camera by its height over the player** (engine 0.2.3.8): the Camera
  panel's "behind the player" sets how high it sits and what it looks at, the
  angle down following from its height and distance. The avatar's animation
  rows have `hop` (a jump off a ledge), and the graph's "change player setting"
  lists the player's settings to choose from.

## 0.4.2.7 -- 2026-10-23

A development release (the dev branch), built on engine 0.2.3.7 (its snapshot
format changed: a studio and a game of different engine builds do not talk).
The desktop studio's "Play shows colliders" needs the next engine release's
shell; the Android studio has it now.

### Added

- **Ledge grab and coyote time** (engine 0.2.3.7): Player → climbing has
  "ledge_grab" (catch the edge of a higher floor a jump just misses) and
  "ledge_reach"; Player → jumping has "coyote_time". The avatar's animation rows
  have `hang`, beside `climb`.
- **A camera behind the player**: the map's Camera panel, "behind the player",
  swings it round behind the player unless they turned it lately, at a delay and
  rate of the map's, and can let walls pull it in.
- **Play shows colliders**: a switch in the map menu draws every collider over
  the game as it plays (F4 in the game turns them off and on).

## 0.4.2.6 -- 2026-10-22

A development release (the dev branch), built on engine 0.2.3.6, with
ThreeSprite 0.2.3.1, DigidreamSound 0.2.0.1 and the DAW from midisynth 0.2.0.1
bundled.

## 0.4.2.5 -- 2026-10-22

A development release (the dev branch), built on engine 0.2.3.6: the graph
nodes for how a player looks (set avatar, set layer, set animation for) and
the snapshot format they need.

## 0.4.2.4 -- 2026-10-22

A development release (the dev branch), built on engine 0.2.3.5. 0.4.2.3's
desktop apps could not start (a file of the engine's desktop shell was left
out), and it was withdrawn; this is 0.4.2.3 as it should have been.

## 0.4.2.3 -- 2026-10-22 (withdrawn: its desktop apps could not start; see 0.4.2.4)

A development release (the dev branch), built on engine 0.2.3.4.

### Added

- **The studio updates itself on macOS, Windows and Linux too**: Home's "update
  now" downloads the release for this computer, and the studio quits and comes
  back as the new one, with everything saved first. A stable studio is only
  offered stable releases. An app that cannot replace itself where it is (opened
  from Downloads on a Mac, an administrator's install) says so; "download"
  still works. Needs the engine's desktop shell from this release on.

## 0.4.2.2 -- 2026-10-22

A development release (the dev branch), built on engine 0.2.3.3.

### Added

- **A platform can reach across rooms**: a room drawn over two or more rooms,
  with its floor above all of them, is a platform standing on them (open edges),
  not a walled box. Needs engine 8c813aa; a level or sunk room across a border is
  still refused, saying why.

### Fixed

- **With the grid off, rooms still snapped to it**: every edit put each corner
  back on the map's grid, so the switch only held until the next change. Corners
  now stay where they are put, to a 256th of a unit (the finest step was a
  64th).
- **A new missile could hardly be seen**: its glowing dot was 0.35 m tall, a few
  pixels from across a room on a phone. A new missile is drawn 0.6 m tall and
  leaves a glowing particle trail in its colour (a particle kind of its own, on
  the Particles page). A small missile with no trail is flagged on the Missiles
  page.

## 0.4.2.1 -- 2026-10-21

A development release (the dev branch), built on engine 0.2.3.2.

### Added

- **Snap to the grid, or not**: the map's ⋯ menu (or G) switches the grid off,
  and corners, rooms, things and points go exactly where they are put, to a
  256th of a unit; a corner still joins another room's corner or wall it lands
  on. Remembered per device. The map's finest step is a 256th now (an 8th
  before); existing maps are unchanged.

- **A plain PNG imports as a sheet**: "+ import sheet..." (Player, Monsters,
  Props, Sprites) takes a single .png as a one-picture sheet, the same from
  every side. A file that is not a PNG is refused with a message.
- **The starter's controls are a panel**: a new module shows its keys in the
  panel `controls` near the top of the screen for ten seconds (the keyboard's
  keys on a computer, the on-screen controls on a touch screen), which a player
  can close with its ×.
  Its words and look are edited on the Panels page; delete the `welcome` graph
  or the panel to show nothing. The subtitle line stays free for the game's
  own words.

### Fixed

- **Undo did not survive Play**: coming back from the game, the map's and the
  module's undo started empty. They are kept over the trip, and so are each
  graph's zoom and scroll.
- **A despawn after "when prop touched" removed the player**, and the run
  stopped. Left at its default, despawn now removes the prop that was touched
  (who? reads "target -- the prop (default here)"); a remove with nothing linked
  takes the prop too. The board says so in red where a despawn or remove would
  still hit a player.
- **Graph errors were only in the Play log**: back from Play, what the game said
  about a graph is on its board, at the node that failed. The line goes once
  that node is changed, and at the next Play.
- **An opening line from "when level starts" reached nobody**: the level starts
  before any player is in it. The board says so for a subtitle, fade, cutscene,
  camera or sound node there, and suggests "when player arrives" (with a once).
- **A second wire from an exec output replaced the first unseen**: an exec
  output leads to one node, so the new wire still replaces the old, but the
  board names the wire that went, one undo brings it back, and it suggests a
  sequence for both. The graph window's warnings show on the board itself.
- **The graph's side panel jumped under the pointer** when a problem line
  cleared; it keeps its space while the same node stays picked, and "delete
  node" sits beside the node's title. A wire dragged to a node that just grew
  reaches its plug, and a field still being typed is saved first.
- **Choosing from a dropdown in the graph's side panel moved the focus** to
  "delete graph" or "delete node"; it stays on the dropdown.
- **"+ node..." dropped new nodes on top of others**: they go to the nearest
  free spot by their real size, and the view moves just enough to show them.
- **The play sound list said "(none)"** until the Sounds page had been opened.
- **Picked points were not numbers**: "pick a point on the map" fills x/y/z
  with numbers, so a spawn, a teleport or a when_near no longer says "`x` should
  be a number". Number fields show a decimal point and take a comma when typed.
- **Module and map ids lost accented letters**: "île" becomes "ile"; a letter
  with no plain spelling is named and the id asked again.
- **Weather broke the Room tool on slow phones**: with rain, snow, dust or embers
  on a map, taps and drags counted as holds. A hold now waits a frame before it
  counts, weather pauses while a finger is on the map, and a hold in the Room
  tool places a corner.
- **A dragged start flag kept height 0 on a raised floor**: spawns, lights and
  placed things dragged onto a room take that room's floor height.
- **Small rooms were hard to tap**: a tap well inside a small platform or thin
  door picks the room; walls and corners win only near its edge. A "tap a room"
  pick takes the room under the tap.
- **A deleted map was still played**: Play removes old baked maps the module no
  longer has, which the server was still loading.
- **Phone keyboard and Back**: the graph board returns to its place when the
  on-screen keyboard closes, and Back while typing only closes the keyboard.
- **The Sky preview stayed black** until dragged; it shows the picture at once.
- **The Panels page said "No panels yet"** behind a panel that was open, and
  its phone preview drew a computer's elements; it draws the touch-only ones.

## 0.4.2 -- 2026-10-20

Everything since 0.4.1, built on engine 0.2.3, with ThreeSprite 0.2.3 and
qPainter 0.2.1 bundled. (The development releases 0.4.1.1 to 0.4.1.5 below
had it piece by piece.)

### Added

- **The studio updates itself on Android**: when a newer stable studio is out,
  Home's card has **update now**, which downloads it and installs it over this
  one. The first time, Android asks to allow installs from the studio: allow it
  and press again. A stable studio is only ever offered another stable one.
- **qPainter and ThreeSprite work with the module directly**: both take the
  module's textures and its palette, and both can set the module's palette, so
  the two keep one palette. A texture bigger than a sprite comes in shrunk to
  fit.
- **Aim assist per weapon**: "Aim assist" (the default, on, off) and its reach
  in degrees, on the weapon's panel.
- **A wall's texture sized along it and up it on its own**: "size along" and
  "size up" on the wall's panel.
- **Every slider takes a typed value**, in the studio and in qPainter.
- **A corner leads to its walls**: its panel has a button for each of the two
  walls that meet at it.

### Changed

- **The sidebar is in groups**: World, Gameplay, Art, Sound, Interface, Logic
  and Module, each under a small heading (a line where the sidebar is icons
  only). Sky now sits with Maps; a plugin's section goes under Module.

### Fixed

- **qPainter and ThreeSprite on a phone could not export or import** (a palette,
  a PNG, an image): their files go through the studio's own save and file
  picker now.
- **A minus sign could not be typed on Android** in the number boxes.
- **Corners were hard to hit on a phone**: they are bigger on a touch screen,
  and a tap within a finger's width of one selects it.
- **The map's corners and labels follow the zoom**, within bounds: zoomed in,
  "start" no longer covers its room; zoomed out, corners no longer vanish.
- **The room tool shows every room's corners and walls** from the moment it is
  chosen, and **undo while drawing a room** takes back the last corner.
- **A monster given a new sprite of its own was drawn nowhere**: it shows as a
  still picture until the sprite has animations.
- **Whether a plugin editor's changes were kept was unclear**: its bar says
  "changed · saved when you go back".

## 0.4.1.5 -- 2026-10-20

A development release (the dev branch), built on engine 0.2.2.2.

### Added

- **Aim assist per weapon**: the weapon panel has "Aim assist" (the default, on,
  off) and "Aim assist reach" in degrees (the engine's `autoaim` and
  `autoaim_cone`, engine 43efccd); a reach over 180 is flagged.

## 0.4.1.4 -- 2026-10-20

A development release (the dev branch), built on engine 0.2.2.1, with
ThreeSprite 0.2.2.1 and qPainter 0.2.0.1 bundled.

### Added

- **Plugins share the module's palette and pictures**: 'set-palette' writes the
  module's palette (sources/palette.json, one undo step) that 'palette' reads,
  so qPainter and ThreeSprite can keep one palette; 'texture-png' gives a
  texture's picture. qPainter (bundled at 57d8664) takes the module's palette
  and textures, and sets the module's palette.
- **A wall's texture sized along it and up it on its own**: the wall's panel has
  "size along" and "size up" (the engine's `xscale` / `yscale`, engine
  d630c99). Written as `xscale`/`yscale` only when the two differ, so every
  other map is exactly as before.

### Fixed

- **qPainter in the studio on a phone could not export or import** (a palette, a
  PNG, an image): its files now go through the studio's own save and file
  picker. A plugin can ask for a file with the new 'import-file' question, as it
  gives one with 'share'. qPainter bundled at d3cf52e.

### Fixed

- **Corners were hard to hit on a phone**: on a touch screen they are drawn
  twice the size, a tap within a finger's width of one selects it, and closing
  a room on its first corner or snapping onto a corner reaches further.
- **Undo while drawing a room took back the change before it**: it now takes
  back the last corner tapped, one at a time.

### Added

- **A corner leads to its walls**: its panel has "wall to corner …" for each of
  the two walls that meet at it.

## 0.4.1.3 -- 2026-10-19

A development release (the dev branch), built on engine 0.2.2.

### Added

- **Every slider takes a typed value**: the missile preview's target distance
  and the monster preview's health now have the number box the other sliders
  have, and qPainter's sliders (bundled, at 6b1405e) have one too.

## 0.4.1.2 -- 2026-10-19

A development release (the dev branch), built on engine 0.2.2 and its dev
Android shell (the self update).

### Fixed

- **The map's corners and labels follow the zoom**: they kept the size of the
  moment they were drawn, so zoomed in "start" covered the room and zoomed out
  the corners shrank out of sight. They now grow and shrink with the map, within
  bounds (half to 1.6 times their size), every time the zoom moves.
- **The room tool shows every room's corners and walls from the moment it is
  chosen**, not from the first tap.

### Added

- **A dev build on Android updates itself**: Home's "Studio X is out" card has
  **update now**, which downloads the release's APK (the one with plugins, or
  without, as this build is) and installs it over the studio. The first time,
  Android asks to allow installs from the studio; allow it and press again. A
  dev build is offered the newest release, dev or main. Main builds are as
  before: the release page, in the browser.

## 0.4.1.1 -- 2026-10-19

A development release (the dev branch), built on engine 0.2.2.

### Fixed

- **"Check for updates" offers only releases on main**: releases are made on
  the dev branch too now, and a development build is never offered as an
  update. A release counts when main holds its tag.

- **A monster given a sprite of its own was drawn nowhere** -- its Looks
  preview stayed black (on a phone, where it was tried), and the game had no
  sheet for it: ThreeSprite composes a sheet from a sprite's animations, and a
  sprite as it is first drawn has none. It is drawn as one still picture until
  it has animations, and Looks names the states that play it for want of theirs.
- **Whether a plugin editor's changes were kept was unclear**: its bar said
  "changed". It says "changed · saved when you go back", and its two buttons
  say what each does (save and go back; throw the changes away).

## 0.4.1 -- 2026-10-17

Built on engine 0.2.2.

### Fixed

- **The Package page on Android offered "Download the android kit"** though
  the app carries it, and the button took the whole app to an error page it
  could not leave. It is no longer offered, and a link out of the app opens in
  the phone's browser (the engine's Android shell, next engine release).
- **A deleted room stayed drawn** in the plan and game views, and nothing could
  select it: its triggers (a door's, say) still named it, the map no longer
  baked, and the views kept the last map that did. Deleting a room now takes
  the triggers that worked it, says which, and undo brings them all back. A
  map that does not bake says the view shows it as it last baked.
- **The door preset seemed never to open**: pressing E on an open door shut
  it, so pressing again and again -- what anybody does when nothing seems to
  happen -- opened it and shut it in the same second. Pressing an open door
  now does nothing; it shuts by itself four seconds after opening (it was one
  and a half).
- **Importing a pack over its own module did nothing visible**: opening it
  saved the open module back over the pack. It now asks first, naming the
  pack's maps, brings them back, and says so.
- **Editing the module's id made a new module for every id typed.** The
  module is moved to the new id, snapshots and all; an id another module has
  is refused. Home can delete another module ("delete a module…").
- **⌘V switched the map to the game view**: a key held with ⌘, Ctrl or Alt is
  no longer read as the map's letter.
- **"all middles" bricked up doorways**: a room drawn against a wall gave the
  new opening a middle texture on both sides, so it was solid in the game. A
  wall that becomes an opening now has none, and "all middles" textures the
  room's solid walls only.
- **The "all middles / uppers / lowers" buttons said "(none)"** whatever the
  walls had. They show the walls' texture, or "(mixed)".
- **The texture list showed each of the module's textures twice**, and cut
  long names short. Each is listed once, its name on two lines if need be.
- **A second "spawn: start" made a second start**, and the player still
  began at the first. Placing a spawn the map has moves it.
- **Renaming a prop broke what used it** (a missile drawn as it lost its
  look). A missile's or monster's body, what a monster drops, the nearest it
  looks for, the player and a trigger's spawn_prop follow the new name.
- **Heights and the other sliders could only be dragged**: on a phone a
  nudge moved a floor by whole metres, and digits typed at them went to the
  map as its keys. Each slider's number is typed too (a decimal comma is a
  point), and a swipe up or down over a slider scrolls the page.
- **The graph's "+ node…" list printed each description over the next
  title**, and a new node could land on top of another. Rows hold their
  words, and a new node is put where nothing is.
- **Messages under a page went unseen** (an import on Home, a renamed id in
  Settings): the status strip is hidden there. They show over the page.
- **Tapping Props in the rail did not go back to the list** from a prop. The
  section showing, tapped again, goes back to its list.
- **Every new pickup healed 25**, an ammunition clip too: "+ health pickup",
  "+ ammunition pickup" and "+ armour pickup" each start as what they say.
- **Fit view hid part of the map under the rail**; it fits the part of the
  view one can see.
- **A room drawn inside another started at the last room's heights** (a pit's
  floor, a ceiling with no sky), and its panel came up over the spot being
  drawn after every rectangle. It starts as the room it is drawn in, and its
  panel opens only if one was open; the status line says what was drawn.
- **A light's colour picker opened over its delete button**, and a drag on the
  hue deleted the light: delete waits until the picker is closed. A colour
  field is brought up its panel first, so its picker has room (the fog's
  opened off the window).
- **A decimal comma in the editors' numbers was refused without a word**; it
  is read as a point.
- **Export said nothing** when it had saved the pack (on Home the status strip
  is hidden): it says what it saved.
- **The presets said nothing** about what they added; they name the triggers
  they wrote, long enough to read.
- **The pointer started as "touch" on a computer**: it follows the device
  ("auto"), and touch or mouse can still be chosen under Style.
- **The style and pointer chosen were lost after a forced quit** of the app:
  they are kept in a file of the app's as well.
- **"the new sprite's name (capitals and digits)"** read as a rule to follow;
  the studio upper-cases the name itself and no longer says so.
- **Closing a side panel twice flipped the map to the game view** (the panel's
  × sits where PLAN/GAME is), and the arrow keys then changed a slider in the
  closed panel. A tap there just after closing is let go, and the focus
  leaves with the panel.
- **A sky strip was imported as two frames**: a picture twice as wide as tall
  is the shape the Sky page asks for, and is a still picture now; side by
  side frames are guessed from three up.
- **Zoomed out, a corner snapped onto a wall metres away**, leaving a room
  touching the one it sits in (which no map bakes). Snapping reaches half a
  unit at most.
- **Looks offered eight sides for a sprite drawn from one**, and a state the
  sprite had no animation for (a death) played idle without a word. A
  one-view sprite has no sides to pick, and each such state is named with
  what the game plays instead.
- The Package page numbers the steps it shows (it skipped from 3 to 5 off
  Android), and says why a desktop build fetches the android kit.
- **Colour emoji as icons** (the rail in the default style, the trigger
  events, Missiles, Sync and Package in every style): every style draws them
  now, each in its own look -- lines, colour pixels, glass -- and nothing in
  the studio prints one as a character. The trigger events are listed by name
  first, so typing the first letters finds one.
- **A new sound pack opened as the sound tool's starter** (gun sounds, one
  named "flesh") under the name "starter". It starts empty, under its own name.
- **A missile with no launch height** is drawn leaving the monster's middle,
  as the engine now launches it (it was its feet).

### Changed

- **The starter** (what a new module is a copy of): the player's death is
  shown, on every map -- the screen goes dark, "You died. Back to the start!",
  and clears (a game graph, engine 0.2.2) -- where a player used to die without
  knowing it; its debug overlay is off, and the keys are said once as the game
  starts (a graph of its own, to change or delete); the spirit is drawn twice the size, with a body to match, and
  bites more gently; its script no longer charges a swing twice. It carries a
  muzzle flash, a tracer and sparks (particle kinds 20 to 22), and a first
  person module's gun uses them, with a flash in hand held long enough to be
  seen -- firing showed nothing anyone could see. Its door works as the door
  preset now does.
- **Modules made from the old starter** have its script replaced as they open,
  unless it was changed.
- **ThreeSprite 0.2.2** bundled: a canvas background, a bones toggle, move
  arrows that say the screen's direction, "How is it seen?" in New sprite, an
  Export tab that says the game needs nothing from it, and slow finger strokes
  no longer taken for a colour pick.
- **qPainter 0.2.0** bundled: flat tool icons, a palette that stays put, a
  calmer top bar.
- **The styles** (uikit): icons for a dark ground -- the 90s and PS1 colour
  icons outlined in white in their night modes, Aero's glass rimmed in white.

### Added

- **A missile's trail**: on the Missiles page, Looks → "Trail" picks one of
  the particle kinds to follow it from launch until it bursts, at that kind's
  rate, drawn along the flight in the preview. Needs the engine's missile
  trails.
- **Particles carried with their body**: on the Particles page, "on a body"
  says whether a trail's or an attached emitter's specks are left behind where
  they came out (smoke) or move with it (a flame, an aura). Every kind now
  keeps its rate, which a trail emits at.

## 0.4.0.2 -- 2026-10-17

Built on engine 0.2.1.2.

### Added

- **What a particle is drawn as** (engine 0.2.1.2): on the Particles page, "drawn
  as" a soft dot (as before), a hard disc, square, hexagon or star, or a
  picture of the module's own -- coloured by the kind's ramp, so one white
  picture makes a burst of any colour, and previewed by the game's own code.
- **ThreeSprite 0.2.1** bundled: it saves as you go (a new sprite is no longer
  lost on reload), lays itself out for a phone held sideways, and a sprite's
  id follows its name.

## 0.4.0.1 -- 2026-10-17

Built on engine 0.2.1.1.

### Changed

- **A swing is an attack like any other**: a step with its numbers in it --
  damage, how long, from which angle to which, how fast, and the rest under
  "more of it" -- for monsters and weapons alike, at the moment of the state it
  says, previewed like the other attacks (a newer swing replaces one still
  sweeping; one during the cooldown does not happen). What a step leaves out
  comes from the default swing, now named so on Advanced. A weapon state no
  longer has a swing form of its own; one that carries a swing from before
  shows it, with a way to turn it into a step.
- **Blade**, a weapon recipe: a slash each press, and a heavier one if pressed
  again during it.

### Fixed

- **A step could not be added to a monster's or a weapon's state** on a
  desktop: "+ add a step" opened its chooser squeezed to an empty bar in the
  column beside the list (0.4.0). It opens whole, and the column scrolls.

## 0.4.0 -- 2026-10-17

Built on engine 0.2.1.

New monster, weapon and missile editors; markers (world-anchored UI) in
Screens, on monsters, in graphs and as signs on maps; a wall's texture turned
and scaled; and many fixes.

### Fixed

- **First person, and on a phone:**
  - **A recipe's shooter never fired in the game**, while its preview showed
    it firing. Its missile had no prop to be drawn as, and the server fires
    no missile whose prop is missing. A recipe's missile, and a new one on the
    Missiles page, now gets a prop of its own name, walk-through, drawn as a
    glowing dot the studio paints; a copy is drawn as its source is. Problems
    names any missile with nothing to be drawn as, before Play.
  - **The Play log said "nothing looks like a failure"** over a server log
    full of that error. A Lua error is a failure whatever its words, and a
    line that comes again is listed once, counted.
  - **A shot left no trace**, so nobody could tell it landed. The Pistol
    recipe draws its ray and bursts sparks where it lands, and the shot step
    offers both ("its ray", "where it lands"; either may be "none").
  - **A recipe's weapon had no picture**: nothing was held on the screen. It
    gets a placeholder gun, at rest and firing, until it has pictures.
  - **A new module was the starter under another name**, with its words, the
    debug numbers over the game and platformer controls. It asks what kind of
    game it is; it starts with no description and a clean screen, and a first
    person one with a gun in hand.
  - **The ▶ on a map in the Maps list was not Play** (it marked the map being
    edited). That is a pencil now, and each map has a Play of its own; and a
    module reopens on the map last edited, so the rail's Play plays it.
  - **Scrolling stopped while the preview ran** on a phone. The preview draws
    less often there, not at all while the page scrolls, and rewrites its
    words only when they change.
  - **The first tap after typing was lost**: the field handed in its value as
    the tap began, and the page was redrawn under the finger. Such a change
    is held until the tap has landed.
  - **A flinch that plays the standing animation** is said on the pain card:
    in the game it would not be seen.
  - **The graph's labels were too small to tap on a phone**; they are bigger
    there, with a wider tap area.
  - **"+ phase" made a list of every state twice.** With several phases, only
    the one being edited is unfolded; the others name their states.
  - **The Props page sent monsters to "the Mobs tool"**, and Home counted a
    monster's body as a prop.
  - On Android, **Back** goes back a page (or closes a dialog) and, on Home,
    leaves the studio in the background instead of quitting; the field being
    typed in is brought into view above the keyboard (with the engine's shell).

- **Sprites made with ThreeSprite's defaults replaced each other.** Every new
  ThreeSprite sprite is called SPRT until its id is changed, and an import
  named the sheet after that id, so a second SPRT project imported silently
  took the first one's sheet, source and art. An import now:
  - names an unnamed (SPRT) project after its file;
  - asks before taking a name the module already has, offering a free one
    (NAME_2), and replaces a sheet only when that is confirmed.

  A project the studio hands out (to ThreeSprite, or exported as .tsprite)
  carries its sheet's name as its id, so it comes back as itself.
- **The state editor was cramped** on a desktop: a 400 px column under the
  preview, with about 350 px of height. With a state open:
  - the panel is wider;
  - the preview is drawn smaller, with its buttons in two rows and its numbers
    on one line (a tap shows them all);
  - each field's label sits beside it.
- **"No more than N monsters within" never stopped a summoner in the
  preview**, which had no monsters at all. What a monster summons is now the
  preview's crowd: the summons stand where they landed, they count for "a
  monster is within", "at least" and "no more than", and a summon's `limit`
  is kept, as the engine keeps them (held to the engine's own run in the
  test).
- **The graph's labels lay over each other** where two edges share a stretch
  (two rules between the same states, a long jump over a lane). A label that
  would cover another moves along its own edge, so it stays by its arrow,
  and the labels are their own height again, not a button's.
- **The graph's phases ran into each other.** Each phase is on a band of its
  own, further apart, with its title at the top.
- **The arsenal and Advanced spoke the file's language**: "label?",
  "initial?", "order?", "pain_chance?", "hover_z?", and `order` and
  `not_yet` in backticks. They are in plain words now ("Starts with", "Place
  on the panel", "Flinch chance (of 256)").
- **Missiles and Particles had the same icon** in the rail. Missiles has its
  own.
- **The "New state, named" label did not focus its field.** It does, and the
  field has the focus when the form opens.
- **Choosing a condition or a step on a phone took four or five swipes**: every
  group was listed at once. One group shows at a time, picked from a row of
  chips; the chooser opens on the group last used; and on a desktop a find box
  searches all the groups.

- **Fixes to the new editors:**
  - **Play in a browser said nothing** on Home and the rail: its message went
    to the status strip, which a page hides. It asks in a dialog now, and
    offers to export a pack.
  - **The editors' messages were never seen** ("Type a name first" when a
    recipe was picked with no name) for the same reason. They show on the page.
  - **A monster made from Blank could not use a cooldown**: the number had to
    be declared, and nothing could declare it. Every number a brain names is
    declared now, and Advanced sets where each one starts.
  - **"A % chance" never held in the preview.** It is a roll.
  - **The preview stopped** when its panel was hidden and shown again,
    showing "running".
  - **The Missiles page jumped to the top after every edit**, so the next tap
    landed elsewhere.
  - **Fire on the Missiles page threw** when a frame came a moment before the
    click.
  - **An edit made straight into the next field was lost**: the page was
    redrawn under it. The focus goes where it was going.
  - **"Edit in ThreeSprite" on a sheet with no project** opened a blank
    sprite under that sheet's name, and saving would have replaced its art.
    It offers to draw a new sprite of the monster's own.
  - **A weapon's ammo was said twice.** Overview's figure is what "it has ammo"
    asks for; what a shot spends is its "use N ammo" steps, and the summary
    reads those.
- **The preview says more of what it does**:
  - an end branch it will take ("on to frenzy, a branch as it ends");
  - cooldowns as cooldowns ("cooldown ready: 2.5 s left"), not also as
    numbers;
  - a teleport, shown on the other side of the target;
  - a health slider that follows the hits;
  - buttons that stay put, in rows (run, the target, its health).
- **The Missiles page**:
  - a blast bursts as wide as it is;
  - the picture is wide enough to show it;
  - a blast that reaches back to its shooter is said;
  - "Drawn as" lists the module's props before the engine's;
  - an unwhole homing rate says what it is kept as.
- **Smaller fixes**:
  - a new phase says when it starts, and its threshold no longer depends on
    the preview's health;
  - a new state's phase is chosen;
  - a new weapon state goes back to resting, not to the draw;
  - a summon starts on one of the module's monsters;
  - death "stays dead";
  - yes/no parts are checkboxes;
  - a rule on a card opens it;
  - a rule leaning on other monsters says the preview has none.

- **0.3.4.1 and 0.3.4.2 on Windows, Linux and macOS were studio 0.3.4**: the
  desktop builds took the studio's pages from the engine kit they were built
  on (the packager's build_studio.mjs). They now come from the studio, and a
  release refuses a build whose studio/VERSION is not the one released.
- **A state that goes back to what it was doing** (`next = "@previous"`, the
  engine's since 0.2.0) was named a problem.
- **A weapon condition may be negated**: the studio refused `negate` on a
  weapon's condition, which the engine takes since 0.2.0.

### Added

- **Markers** (docs/MARKERS.md): small UIs hung on things in the world -- a
  bar over a monster, a sign over a door, a pointer over a goal.
  - **Screens → markers** makes their looks: a template is a box of the HUD's
    own elements, drawn over a monster in a close-up by the game's own marker
    code, at the size the chosen device gives it. The four built-in markers
    are shown and can be changed for the module or copied; a template can be
    renamed (everything that hangs it follows), sized and its elements dragged
    inside its box, with sample values, and it lists who uses it.
  - **A monster** wears one as "a bar over it" (Overview), drawn over it in
    its preview as its health falls.
  - **A graph's** mark node offers the markers as its template, and the names
    the graphs' marks gave.
  - **A sign** placed on a map (Place → "sign: label", …) is a marker with a
    text, hung on its place as the level loads.
  - **Problems** names a monster, graph or sign that hangs a marker nobody
    made.
- **A wall's texture can be turned and drawn larger**, as a floor's can: "turn
  (°)" and "size" beside its offsets (map version 15; docs/WALL_STYLES.md).
  Written only when they change something, so an older map keeps its hash.
- **New monster and weapon editors** (src/editors/): Monsters and Weapons open
  an editor with tabs (Overview, Behaviour, Attacks, Looks, Advanced or
  Arsenal). Behaviour lists the states as sentences, or as a graph in lanes,
  one per phase. Beside it are an editor of the state picked and a preview
  that runs the rules. A "Whatever it is doing" panel holds the built-in pain
  and death and the rules for any state.
  - Rules read as sentences, with a grouped chooser of every condition, and
    the timeline of steps has a chooser of every action.
  - "+ phase" copies the last phase, makes it faster, and starts it once its
    health drops.
  - Recipes: blank, melee grunt, shooter, flyer, charger, a 3-phase boss;
    blank, pistol, launcher and charge-shot weapons.
  - Names are lower-cased as they are typed; Rename keeps a display name with
    capitals.
  - A phone on its side keeps the rail. Its preview stays closed until asked,
    and a step opens in a sheet over the side panel.
  - The player keeps the old window.
- **A Missiles page**: the module's missiles, shared by its monsters and
  weapons, each with a side view of its flight as the engine flies it. It
  throws on the arc that lands, falls, bounces and runs out, and the engine's
  particle kinds burst where it lands.
  - It edits what the missile does when it hits, runs out, bounces and on its
    way (splits, bomblets), how it homes, and its looks and size.
  - It says who fires it.
- **A state's steps are listed in the order the engine runs them**, each
  with the time it really runs: a step listed after a later one waits for it.
  A new or moved step goes in by its time, and the others keep their order.
- **Everything the engine can do is on offer**: a condition or action the
  editor has no words for is under "More", edited in the vocabulary's own
  form. A prop is picked from the catalogue.
- **The workshop's other forms are on Advanced**: a monster's brain fields
  (blood, pain lengths, drops), its own swing and slash look, its body
  states; a weapon's prediction, swing and slash look. A weapon state keeps
  its own swing in its editor.
- **A weapon's preview shows it held**: its first-person picture plays each
  state's animation, with its shots and sparks drawn over it.
- **Particle kinds say what they look like** ("11 · fireball", "13 · smoke")
  wherever one is picked, not "11 · particles".
- **The editors' own words, compiled to the engine's** (brainc.js): rules that
  apply in any state, "only once", branches taken as a state's time runs out,
  and a boss's phases with their speed are written as plain vocabulary when the
  module is emitted and checked. "Further than" also needs a target. A rule
  with no condition yet is left out. Proven by running a compiled boss in the
  engine's own mobs.lua.
- **A preview that runs the brain** (brainsim.js): the monster and weapon
  editors' preview runs the compiled brain by the engine's own rules (a
  decision every 8 ticks, pain resuming what it interrupted, a press as an
  edge). Scripted hits give the same path through the states as mobs.lua.

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
