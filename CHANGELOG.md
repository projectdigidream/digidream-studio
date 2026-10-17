# Changelog

What changed in each release of the studio, fixes first. Kept as fixes land:
anything not released yet is under **Unreleased**.

## Unreleased

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
