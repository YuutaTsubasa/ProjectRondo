# ProjectRondo — Developer Handoff

Last updated: 2026-10-11. Purpose: everything the next machine / developer / Claude session needs to
pick this up cold. The repo is the source of truth; this file is the map.

## Production UI and Windows playtest (2026-10-11)

Reproduced missing region HUD/marquees and apparently missing PAUSE on the Netlify
production build. Both existed in the DOM, but the region/marquee/pause CSS was absent;
the elements fell into normal flow below the canvas. Vite 8 folded the conditional
session imports into one preload wrapper with only the final GameSession branch's CSS.
Separate loaders in loadGameSession.ts preserve each branch's dependency preload.
`node tools/verify-build.mjs` fails on the old bundle and checks all session/shared HUD
styles in the generated entry. Verified the rebuilt app via vite preview: NEW GAME,
opening AVG, visible edge marquees, and visible PAUSE. A controller Start integration
test exercises region pause/resume after AVG using the real input runtime.

`.github/workflows/windows-playtest.yml` runs on PRs, main pushes, and manual dispatch.
It checks out LFS content, verifies assets, installs the frozen pnpm lock, typechecks,
tests, and builds the Tauri Windows NSIS installer. Artifacts (14-day retention):
`ProjectRondo-Windows-portable-<sha>` contains app.exe; `...-setup-<sha>` contains the
installer. Download from GitHub Actions > Windows playtest > completed run > Artifacts.
The executable bundles game assets and requires WebView2 (installer handles runtime
setup). Test builds are unsigned. Default window is 1280x720 and resizable. Desktop
continues using the same game renderer; packaging is not a substitute for UI testing.

## Deployment asset retry and BGM readiness (2026-10-11)

Reported Netlify /town/gate.glb HTTP 500 could not be reproduced later: preview returned
200 with all 5,292,164 bytes and the exact recorded SHA-256. Babylon's default retries
status 0 only. App startup now installs bounded transport retries for 0/500/502/503/504
(500/1000/2000 ms); permanent errors retain failure handling. Server-side origin of the
original 500 is unconfirmed.

Region/town builders now await their audio graph, loading only town/meadow or town BGM.
Required music failures reject into the existing retry UI instead of silently entering.
2D/3D stage music has prepare() to fetch/decode while inactive, before returning the scene.
Preparation is independent of autoplay unlock; waits are bounded to 45 seconds. Menu
playback retains gesture-based unlock and stage preparation aborts fetch on disposal.

## Integration snapshot (2026-10-10)

Ready for review: 1,026 tests across 164 files pass; TypeScript/Svelte checks report
zero errors or warnings; production build passes with the existing chunk-size advisory.
NEW GAME now initially focuses Continue and keeps the primary action focused through
forward/backward steps, ending on Start Game. Settings return focus stays at its opener.

## Owner-provided sword swing samples (2026-10-10)

`Swipe_the_sword_#2-1791646738806.mp3` contains eight isolated takes. `tools/audio/build-sword-samples.py <source>` produces `public/audio/sfx/sword/swipe-01.wav` through `08.wav`, 48 kHz stereo PCM16, with silence trimmed, 2 ms entry / 10 ms tail fades and approximately -3 dBTP peak headroom. No pitch/time processing. Source hash, trim times and per-take gains are in `docs/audio/sword-samples.json`; local audition in `.superpowers/sword-samples-preview.wav`.

`sword.swing` is an eight-variant SFX cue at .55 gain. `swordSoundCrossed` triggers once when actual slash time crosses .08 s, ahead of the .14 s active blade window. Shared `hubAudio` covers region/town/hub/tower/course; palace simulation uses the same timing rule through `stageAudio`. Samples cycle rather than repeat immediately. No swing on windup cancellation, Homing or a held pause frame. Existing impact sounds remain separate. `stageAudio` now preloads variant arrays and applies mute, pause, reset and disposal to every take.

## Character-facing Homing and expedition default action (2026-10-10)

3D `playerController` now supplies `player.motion.facing` to `stepHomingLock`, shared by the reticle and committed attack. Camera rotation no longer selects a different target. Selection uses horizontal heading with full 3D range; forward elevated targets remain reachable, and directly vertical links are a fallback when no forward target qualifies. This keeps the course chain advancing instead of reselecting the crystal directly beneath a bounce. Dash commitment is unchanged. The palace side-scroller already selects by player facing.

`ExpeditionIntro` marks START EXPEDITION as `data-game-entry`. `regionModal` prefers that control for initial focus, aligning with controller confirm fallback, while other dialogs retain their original first-control default. Both stage introductions have focus/confirm regression coverage; settings return focus remains unchanged.

Checked ProjectAlmost main audio registry and recursive asset tree: it contains hit.wav but no standalone sword swing/whoosh asset. Existing imported hit.wav is not a swing sound; no substitute audio was invented.

Verification: 1,021 tests / 162 files pass; production build passes with its existing chunk-size advisory. Focused tests cover camera-independent preview/attack, turning the character, vertical/forward targets, the existing crystal chains and both expedition defaults.

## Ambient title / result motion and controller interaction (2026-10-10)

FrontDoorArtwork now animates pale blue light directly on the white title sheet and retains it through the menu morph. Scenic drift is 14 s, mist 18/14 s, sunlight 7 s. Logo and controls remain stable. StageResults adds a masked blue-white sweep on the STAGE CLEAR SVG every 6.4 s and a gradient sweep on the actual rank letter every 5.8 s. Both have rest intervals, hidden-tab pause and reduced-motion overrides.

Controller X/Square now first attempts a world interaction; RegionSession consumes E only with a nearby target. If unconsumed, X remains sword/Homing attack. In AVG, X advances the dialogue regardless of toolbar focus, or confirms the active choice; it cannot trigger a generic menu action. A/Cross remains menu confirm, B/Circle remains back. Map X still toggles markers. Hints and Controls settings updated. Automated controller samples cover held-button/context release, consumed interaction vs attack, dialogue focus and choice behavior; physical controller feel is not hardware-verified.

Validation for ambient motion/controller follow-ups and horizontal slash integration: 1,009 tests / 162 suites pass, typecheck has zero errors/warnings, production build passes (existing large-chunk advisory). Browser verified title light transforms, main-menu scenic drift, and repeated result glint positions.

Shared sword equipment now sweeps horizontally in Idle/Run/Jump. `swordSlashWave.ts` leaves a blue-white crescent for .55 s with .28 world-unit thickness so the 2D side camera sees it. Its position/direction stay fixed at attack time; new attacks, Homing or teleports clear it. Original .14–.30 s damage and .5 s attack cycle remain; lingering light does not add repeated damage. ProjectAlmost uses an independent short forward hitbox plus attack animation, not a projectile wave. Real palace/course screenshots verify the shared renderer. Final targeted combat coverage: 50 tests / 5 files, including jump posture, four facing directions, cleanup and no damage during visual afterglow.

## Expedition introduction, navigation markers and edge planting (2026-10-10)

`ExpeditionIntro.svelte` replaces the entrance confirmation with a centered navy rail / diagonal white sheet, actual course screenshots (`public/stages`), real guards/checkpoints/coins, map/settings routes, and 280 ms exit motion. Opening the map from an entrance returns to that introduction, including the same selected stage. `stageRecords.ts` persists fastest completed times under `rondo.stage-records.v1`; legacy clears have no invented history. Target times are the existing S-rank thresholds (course45s, palace30s). Completion writes belong to both stage sessions, including EXTRA.

`InformationDialog.svelte` is the reusable 1–3 button white popup (focus trap, keyboard/controller navigation, optional X/Escape, exit lock and animation). Region load failures now use it; no unsolicited leave confirmation was added.

`REGION_INTERACTION_PLACES` supplies the actual beacon anchors, shifted slightly off road centers. Scenery, interaction radius and HUD/compass distances use the same anchors. `regionObjectiveMarker.ts` shows only the tracked/current target: pulsing blue column plus yellow/black exclamation that faces the camera and gently floats. SVG source + raster output are in public/ui; a single icon plane prevents coplanar fighting through post-processing. RegionWorld sets the target before material readiness and updates it when navigation changes.

At supported platform edges, `plantFeet` now re-evaluates the model offset against the last nearby world support height (limited to one capsule radius). Previously a null center ray froze an old landing offset while visualY continued settling, burying the feet about0.21m below a platform despite supported physics. Browser reproduction now leaves soles within0.003m of the platform; correction fades during takeoff and clears fully airborne. Regression coverage in knightFootPlant.test.ts.

Two owner-supplied stage BGM loops are installed: Arcade Beat → palace_arcade.ogg (61.053s), Cathartic Release → course_cathartic.ogg (116.1171667s). Receipts in docs/audio and reproducible build-stage-loops.py. Decoded-buffer looping avoids stream padding; seam auditions are retained in the task artifact directory for user listening. No subjective listening approval is claimed.

3D checkpoints now accept airborne arrivals inside the next gate footprint and a bounded vertical band (-0.65 to +4.5 m), preserving ordered progression and rejecting passes far above/below. StageResults Continue uses a layered arrow outline instead of clipping a rectangular focus frame; its text remains uncut.

ProjectAlmost SFX imports provide footsteps/jump/landing, impacts, coins, death, checkpoints, clear and UI feedback. Shared stageAudio owns result music independently of the frozen result scene, disposes it on retry/exit and respects audio preferences. The originally imported result track is superseded by the owner-supplied Victoire Éclatante: music.result points to result_victoire.ogg for both stages (29.454333 s, 48 kHz stereo, 1,413,808 decoded frames). Recipe/receipt: tools/audio/build-stage-loops.py --only victoire and docs/audio/result-victoire-loop.json. Seam audition is in the task artifact result-music directory; signal analysis passed, subjective listening remains for the user.

Final automated verification: 1,000 tests across 162 files pass; production build passes with the existing large-chunk advisory.

## Captured minimap and compact HUD (2026-10-09)

User refinement: remove the lower-right keyboard hints and repeated location captions; compact the task block to a bold actionable heading, secondary instruction and distance. `regionHudCopy.ts` supplies short objective instructions and selected landmarks get their own tracking copy. `HudIdentity` places the existing Rondo logo and real local HH:mm time at lower left, updating at minute boundaries and cleaning its timer/listener. No simulated in-game time is claimed.

`tools/maps/bake-region.html` loads the actual region, freezes simulation, hides the avatar/sky/clouds/fog, and captures a 1024px orthographic atlas. North/east orientation is tested, including the right-handed camera's horizontal export mirror. Download PNG + JSON and run `tools/maps/install-region-map.py`; it validates size/bounds, installs public/maps/white-tide-atlas.png plus src/content/regionAtlas.json and computes a cache-busting SHA-256. See tools/maps/README.md. A real capture is installed. RegionMinimap uses it at neighborhood scale with live markers and a vector fallback on load failure; no second render camera runs during gameplay.

Waves now have translucent midnight-blue bodies, blue-white filaments, and softer side masks beneath the white edge glyphs. The lower-right HUD remains hidden for now. Validation: projection/receipt, clock midnight/disposal, region HUD and session tests pass; typecheck and production build pass. No commit/push requested.

## Gameplay navigation HUD (2026-10-09)

RegionHud now follows the supplied transparent white/blue gameplay reference: north-up circular minimap, real camera compass, tracked destination/distance, left mission and right keyboard action hints. RegionWorld reports planar camera bearing at the existing 10 Hz position-report interval through an optional onHeading callback. RegionMinimap uses existing trails/building positions, pins remote targets to its rim and labels the atlas north consistently (+Z). No party, fake HP, cooldowns or mobile virtual controls were introduced.

Shared LocationMarquee renders outward-rotated outlined Chinese location text flush to both edges (+90 left/-90 right, corrected from the initial direction). Identical gapless copies scroll seamlessly, are aria-hidden and pointer-transparent, pause while hidden/inert, and become static under reduced motion. Town districts use 白色王城; other regional areas use their actual label. Frame text now outlines the merged glyph alpha using SVG dilation/subtraction instead of directly stroking overlapping CJK font contours; inherited text shadows are cleared. Shared HudWaves now adds blue line ribbons below and behind both edge captions. Per user follow-up, blue waves breathe in 3/4.2 seconds and carry a 2.6-second flowing highlight; white glyph outlines remain unchanged. Region HUD typography uses clearer Noto Sans TC numbers, larger mission/action labels, lighter shadows, and 1.2/1.4/1.65 desktop scaling at 1600/1900/2500 px; no fictional gameplay data is added. Standalone town, 3D trial and 2D palace share the edge treatment; their existing pause/results stay intact. The full navigation redesign is on the first-region HUD.

Validation: 52 tests in seven related suites pass; typecheck clean and production build passes with existing chunk-size advisory. Browser verified real scene rendering, map target changes, 390x844 no-overflow layout and both tracks paused with modal. Ignored /.superpowers/gameplay-hud-qa.html is an isolated playable preview without save writes. No commit/push.

## Painterly menu/Loading character (2026-10-09)

User requested ProjectVtuber's painterly treatment over the whole live portrait. `portraitPainting.ts` and `portraitPaintShader.ts` port the native Blender study's UV-anchored grain, cool-shadow/warm-light palette, and masked painterly smoothing into Babylon. Source path and SHA-256 are in public/title/painterly-source.json. This is a realtime approximation, not a portable VRM effect or a pixel-identical Blender compositor.

The existing PlayerToon material adapter remains; a portrait-only plugin compresses neutral armor's baked glare and adds the directional treatment. A separate material-weight render target follows skinning/morphs, with body/hair/skin strengths 1/.9/.08 and protected eye/oral details. An edge-directed 36-sample sector filter retains source alpha and excludes HTML/background. Scene-scoped disposal releases postprocess, mask and override materials without deleting source textures. All body surfaces use the treatment; original player geometry, UV, source textures and gameplay materials remain unchanged.

Validation: 856 tests / 135 files pass; typecheck clean; build passes with existing bundle-size advisory. WebGL browser inspection confirmed compiled shaders, whole-body styling, close-up face protection and transparent compositing without console errors. Performance is bounded by fixed taps and existing DPR cap but not benchmarked across hardware. No commit/push.

## Live 3D title portrait and Loading (2026-10-09)

Main menu now displays the actual PLAYER_MODEL through a separate transparent Babylon scene. It reuses player materials, the Idle clip and blink target, without the gameplay rig, physics, weapons or input bindings. FrontDoorArtwork retains one MenuPortrait instance across menu/Loading; Loading switches to a left-side three-quarter face/shoulder camera and the reference-inspired diagonal white/city composition. LoadingScreen provides an indeterminate light rail and accessible status, without fabricated percentages or forced delay.

MenuPortrait lazy-imports its engine behind the white title, suspends rendering when hidden/title, freezes motion when reduced-motion is selected, observes canvas resize, and releases scene/engine on unmount. Async completion after disposal never adds a late model. Illustration remains a fallback if WebGL or model loading fails. Player model updates continue to use the shared import receipt URL.

Validation: 854 tests / 134 files pass, typecheck 0 errors / 0 warnings, production build passes with existing chunk-size advisory. Browser verified actual 3D compositing, Loading portrait, mobile Loading layout, and EXTRA -> trial -> menu without console errors. The ignored .superpowers/title-portrait-qa.html holds Loading for inspection; ?menu previews the menu. No gameplay save changes or commits.

## Five-entry menu and provisional logo (2026-10-09)

Main menu now follows NEW GAME, LOAD GAME, EXTRA, SETTINGS, EXIT. EXTRA contains the 3D trial, 2D palace and town preview. LOAD GAME resumes a validated regional autosave. NEW GAME confirms when a valid save exists, backs up the old slot before loading, and starts a fresh RegionSession; import failure leaves the original slot intact. EXIT offers window.close with manual-close guidance for browsers.

The shared white-panel/logo morph is now 0.65 s with menu entrance at 0.2 s. RondoWordmark uses public/title/project-rondo-logo-v2.png, generated with built-in image_gen: navy high-contrast serif RONDO with blue N and small PROJECT above. User rejected the detached slash; v2 removes it. Transparent PNG and prompt history are in public/title/logo-receipt.json.

Validation: 847 tests across 132 files pass. Stage-route tests now enter through EXTRA; CSS validation recognizes component-local declarations as well as global tokens. Changes remain uncommitted.

## White title reveal / stronger idle (2026-10-09)

Initial title now has an opaque white foreground, centered shared logo and plain PRESS ANY KEY below. After user correction, the SAME white left-paper surface morphs over 1.15 s from an opaque full-screen rectangle into the responsive left menu polygon. Its left edge stays fixed and only its clipping boundary contracts; there is no separate sliding veil or sliding art wrapper. The persistent logo moves from center to the existing menu position. Decorative lettering fades in over the white surface. Menu appears with a 0.5 s entrance delay. Escape reverses to the centered white title. No additional phase or routing changes were introduced.

Artwork receives active=false on title. City plate has slow automatic push/pan, sea mist is faster and more visible, and the character has a restrained 2D breathing/sway transform (not skeletal/Live2D animation). Hidden/title artwork pauses; reduced motion removes transitions/idle animation. Pointer parallax remains independent.

Validation: 9 menu/state tests passed; typecheck 0 errors / 0 warnings; build passed with existing chunk advisory. Browser verified 1280x720 and 390x844 layouts, title paused/menu running idle states and return-to-title focus. For the corrected morph, inspection confirmed one white panel, intermediate polygon coordinates changing from full screen, and transform:none throughout. Viewport override restored. All changes remain uncommitted.

## Illustrated title artwork (2026-10-09)

FrontDoorArtwork now uses three new built-in image_gen assets under public/title: white-palace-city-v1.png (1672x941 scenic plate), yuuta-overlook-v1.png (1024x1536 alpha character, existing protagonist identity reference), and sea-mist-v1.png (1672x941 alpha effect). Source prompts and references are in source-receipt.json. These are aspirational title illustrations, not gameplay captures or new playable town geometry. Existing UI composition and functional menu entries are preserved.

Background and character use separate subtle cursor parallax; two low-opacity mist instances drift slowly. Pointer events are passive and updates are frame-coalesced; all listeners/frame requests are disposed when unmounted. Reduced motion removes movement, coarse pointers do not drive parallax, and hidden documents pause animation. Original generated PNGs are retained (~5.9 MB total); optimizing delivery can be a later pass after artwork approval.

Validation: 9 menu/state tests passed, typecheck 0 errors / 0 warnings, production build passed with existing chunk advisory. Browser verified transparent compositing, loaded image instances, nonzero bounded parallax variables after pointer input, animated mist, and narrow 390x844 layout. No commit/push requested.

## Reference-led title / main menu (2026-10-09)

User supplied a blue/white diagonal title-screen reference and explicitly prioritized matching its UI. FrontDoor now shares a large serif RONDO wordmark between title and menu, with white diagonal masks, unframed portrait, compact left-aligned vertical options and a single animated blue selection ribbon extending from the screen edge. Existing Start/3D trial/2D palace/town/settings routes and phase transitions remain. Selected item details appear below the menu. FrontDoorArtwork and RondoWordmark isolate decoration; existing sky/portrait assets are provisional, not a new key illustration. The previous boxed portrait, MAIN MENU headline, menu row separators and solid ticker strip are removed. Reduced motion disables animation.

Validation: 9 menu/state tests passed; typecheck 0 errors / 0 warnings; production build passed with the existing chunk advisory. Changes remain local and uncommitted.

## First-region Light UI refinement (2026-10-09)

Exploration now uses a compact stepped chapter stamp, narrow mission rail, brief animated area title and custom line icons instead of large rectangular information cards. The AVG chapter tag shares that geometry. The region map fills the screen with cartographic terrain, roads, seven keyboard-selectable landmark markers and one contextual detail plate. Selecting a marker previews it; the separate tracking action closes the map and updates the HUD target. White selection, blue structural accents, focus containment, Escape/M close and reduced-motion support are retained. Chapter progression/save semantics are unchanged. Pause and expedition dialogs remain for a later visual pass.

Validation: **840 tests / 132 files** passed, typecheck **0 errors / 0 warnings**, production build passed (existing chunk-size advisory). Browser inspection verified the actual HUD/AVG/map, Space opening the map, keyboard landmark selection and explicit tracking return. This pass remains uncommitted with the preceding region/town work.

## Playable first region / White-Tide Fields (2026-10-09)

Main menu **START / 開始／繼續第一章・白潮原野** now enters a continuous town/outdoor scene. The standalone town, 3D course and 2D palace previews remain separate menu entries. The town south opening connects to grassland paths, a western ridge, eastern cove, southwest ruins entrance and southern watch shelter. Region bounds are x=-130..85, z=-290..57; the town is the narrow northern section. This is a compact layout/progression prototype, not a finished large open world.

Chapter **潮聲未到的午後** has five authored AVG scenes centered on 悠太翼. An obsolete closure signal has stopped the port waterway; the player investigates the field relay, completes the 3D ruins expedition, clears the ProjectAlmost-derived 2D aqueduct, then returns to the tower plaza. 港務記錄員「澄音」speaks remotely through echo pipes and is a provisional character. Only 悠太翼 uses the existing protagonist portrait. The ending choice converges; it does not change persistent alignment or biography. The two existing stages are reused, with no additional ProjectAlmost import or newly generated external model in this pass.

**Controls and persistence:** WASD move, Shift walk, Space jump/double jump, J sword/air shield attack, click canvas for mouse look, E interact, M region map/journal, Esc pause. Map destinations set a tracked distance; three viewpoints record discoveries automatically on approach. Expeditions explicitly load and retain their results; “返回白潮原野” returns to the entry point and plays the appropriate report. Leaving early never completes a mission. Cleared expeditions remain replayable. LocalStorage `rondo.first-region.v1` contains validated versioned chapter/discoveries/completions and a recent safe ground position, separate from both disposable scenes and AVG playback. Storage denial shows a warning. The pause menu can reset to the town south gate.

**Code:** `domain/region` owns terrain, trails, destinations and progression; `content/dialogue/region` and `content/regionStory.ts` own the authored DSL; `RegionSession` orchestrates persistent chapter/AVG/expeditions; `RegionWorld` owns readiness, engine lifetime, frozen overlays and visibility; `presentation/region` composes shared town assets, procedural terrain/scenery, shadows/audio/character rig and Light UI. Material readiness has a bounded wait and unmount cancellation. Resizing while paused defers backing-buffer resize to preserve the AVG background. HUD Space remains native button activation. Region vegetation reuses the existing curved grass ribbons; rounded boulders use seam-consistent deformation/smoothed normals and existing stone texture generation.

**Validation:** full suite **839 tests / 131 files**, TypeScript/Svelte **0 errors / 0 warnings**, production build passed (existing large-chunk advisory). After final grass balancing, the 6 terrain/scenery/layout checks passed again. Spec and independent quality reviews addressed backdrop readiness/focus, timeout/unmount, paused resize, HUD keyboard activation and safe-save height. Browser QA used isolated `rondo.first-region.qa.v1`: real W input traversed south gate and terrain seam from (0,-35) to (0,-117.88); input-only 3D course clear was 00:28 with no retry; input-only 2D clear was 00:28, 18/25 coins, 8/8 guards, no death; results returned to matching AVG reports; homecoming choice reached `complete`; chapter and discoveries survived reload. QA teleports inspected the distant optional landmarks/entry points rather than claiming every route was walked. All three discoveries recorded; map opened with Space. Browser diagnostics reported no runtime errors during the completed flow. Observed near 60 fps here is not a cross-device performance claim.

**Still provisional:** terrain shaping/material art and scenic boundaries, landmark props, port water restoration visuals, NPC staging, story lore and the small cast. There are no overworld enemies, interiors, inventory, functioning shops or additional new stage layouts. The available Tripo buildings remain as supplied; this prototype does not repair every source model seam. Develop density/landmarks and traversal encounters against this connected layout before expanding its area. Existing sword/town asset changes are preserved, and all current work remains uncommitted. Local server remains at http://127.0.0.1:5173/.

## Coastal White Palace town preview (2026-10-08)

Main menu **白色王城 / WHITE PALACE TOWN** opens a standalone walkable exterior preview.
Six houses flank an entrance street; two shops and the tower frame a fountain plaza; the east
promenade overlooks the sea. No interiors, NPCs, quests, shops or hub transition are implemented.
`domain/town/townLayout.ts` owns placements, spawn and recovery limits. `presentation/town`
loads shared GLB geometry/materials, builds authored collision/camera bounds, scenery and sea,
and composes the shared player, atmosphere, shadows and audio. Town-only sun/fill settings keep
white paving shadows readable. Shift is **walk**, with default running and double jump unchanged.

`TownSession.svelte` owns asynchronous loading/teardown, pause, hidden-tab suspension and focus;
`TownHud.svelte` follows the project's Light UI. ESC pauses; return-to-entrance and main-menu
buttons are in that dialog. Falling outside the sample resets to the entrance.

Three Tripo FBX/PBR ZIPs supplied by the user were converted with `tools/town/import.py` to
`public/town/{house,shop,tower}.glb`, each with embedded maps capped at 2048 pixels. Source and
output hashes are in `source-receipt.json`. Original ZIPs are untouched. Existing model seams are
not topology-repaired; oversized visible backing was removed on 2026-10-09, and independent solid collision
keeps those gaps from affecting walking. Fine props and the sea are provisional scenery.

Validation: full suite **761 tests / 118 files**, typecheck **0 errors / 0 warnings**, production
build passed (existing large-chunk advisory remains). After the ridge refinement, the scenery
suite and typecheck/build were rerun. Independent review found only the Shift hint, now fixed.
Browser QA at 1280x720: normal title/menu entry, 46.7-unit street run into the plaza, planter and
seafront obstruction, diagnostic plaza/seafront views, forced sea-fall recovery, pause/reset/menu
return; no browser warnings/errors in that pass. Observed about 60 fps on this machine, not a
cross-device benchmark. Test controls live only in ignored `.superpowers/town-qa.*`.

## South gateway integration (2026-10-09)

Imported `~/Downloads/arch+gateway+3d+model.zip` as `public/town/gate.glb` with embedded 2K PBR maps,
7,624 triangles, original/source hashes in the town receipt. `tools/town/import.py` accepts an optional
asset kind to update one export while keeping others. Existing house/shop/tower hashes were verified
unchanged. Blender front/back inspection and mesh ray scans confirm the central opening passes through;
minor rear panel/column seams remain in the source geometry.

The gate faces south at z=-43, height 11 m, width about 12.09 m. Spawn moved to z=-54 on an extended
entrance apron. `TOWN_BOUNDS` is shared by recovery, support ground and camera ground-height checks.
`townGate.ts` defines two pier solids plus stepped overhead blocks matching the arch; camera and
player use the same bounds. Short stone walls attach to the gate sides, leaving the central street open.
The meadow is not seamlessly connected yet; this remains the standalone town preview.

Validation: 765 tests / 119 files passed, typecheck clean, production build passed with the existing
large-chunk advisory. Browser walk crossed z=-54 to -38.57 through the gate and returned to -53.99,
with the follow camera passing through the opening and no console warnings/errors.

## Plaza-to-seafront arcade (2026-10-09)

Imported the user-supplied `classical+arch+3d+model.zip` selectively as `public/town/arcade.glb`, with 8,938 triangles and embedded 2K PBR maps. Existing asset receipts and hashes remain valid. Front/back inspection and mesh-ray scans establish openings along both axes. Decorative irregularities remain in the generated source; no topology repair was performed.

Three shared copies at x=18/24/30, z=24, height=6 m (about 5.597 m wide, 4.844 m deep) extend the plaza cross street toward the sea. `townArcade.ts` defines four pier boxes, a roof and stepped arch shoulders. Player and camera use the same split bounds; no full-building or visible backing box is introduced. The cross-street lamp moved to z=19.5 to clear the route. Axis-aligned placements are required by this measured collision profile.

Validation: 767 tests / 120 files passed; typecheck/Svelte diagnostics 0 errors/warnings; production build passed with the existing chunk-size advisory. Tests first demonstrated the missing arcade registration/module and incorrect full-building collision. An independent read-only review found no blockers. Browser input walked x=12 to 37.87 and back to 7.02 along z=24, crossing all three arcades; perpendicular crossing reached z=32.43 from 17 at x=24. A pier approach at x=26 stopped at z=24.62. Follow camera passes the openings and shortens at pillars. Overview verified material/shadows, separated roofs and clear footings; no browser warnings/errors captured. Preview remains http://127.0.0.1:5173/ -> White Palace Town. Changes remain uncommitted.

## Follow-up priorities (2026-10-09)

- Sword slash VFX now use `swordSlashTrail.ts`: a short world-space ribbon sampled from the posed blade heel/tip, replacing the unrelated horizontal waist arc. History clears between attacks/Homing, time reversal and large jumps; duplicate elapsed time replaces its sample. Real Idle/Run skeleton tests cover transformed/scaled parents and repeated timestamps. Browser attack freeze confirmed the leading edge meets the blade. Validation: 763 tests passed; typecheck clean (2026-10-09).
- Sword/shield meshes are placeholders; replace with detailed matching equipment later, checking hand grips, sword swing reach and shield-homing orientation against the chosen player version.
- The authoring source remains ProjectVtuber. Its output is now organized under `projects/vrm-model/output/current`; observed knight outputs include `new-vtuber-v33`, alongside a separate streetwear series. These folders are discovery evidence, not approval that v33 is the desired game release. On a future model update, select the intended VRM explicitly and run the existing importer/verifier and motion/blink/equipment checks. No player asset was replaced during the town facade fix.
- Building facades: removed the generic solid boxes/cylinder used as visible backing. Whole-model bounds include eaves and colonnades, so those boxes obscured recessed doors/windows. Keep collision separate; repair actual source seams locally instead of filling the whole silhouette.
- City gate and repeatable arcade are now integrated. Next town expansion assets are a second townhouse silhouette, a low shop building and a designed fountain. Then add palace wings, public buildings and harbor landmarks. Use code-authored paving, stairs, simple wall/railing segments and planting to join them; do not require a separately generated mesh for every repeated piece. Keep ivory stone/pale-blue roofs/restrained gold and exterior-only scope consistent.

## V20 player update

The active 3D player is Knight-New-V33 (2026-10-10), served through the stable `public/models/player-v20.glb` filename across all gameplay and 3D portraits.
Use `tools/player-model/README.md` to import a future VRM and verify geometry and animation provenance.
`playerModel.ts` holds the shared asset URL (receipt hash), height, facing and trail size;
`playerMaterials.ts` / `playerToon.ts` adapt imported material metadata. Old knight PBR/face fixes and
`knight_mr.webp` are no longer used by the player. Historical sections below describe the earlier rig.
Automatic blinking uses the imported `playerBlink` morph, driven by `blinkTiming.ts` /
`playerBlink.ts` independently of skeletal movement. The importer retains only the original blink
expression; teardown releases its scene observer. Initial foot seating now evaluates a known Idle
pose and synchronizes linked bones/world transforms through `skinnedSole.ts` before measuring;
a first-render callback can read stale bind-pose matrices and leave the player floating.
The old fixture is archived at `tools/knight-feet/reference.glb`; AVG portraits were subsequently updated from the new UPnNKPTwny idle clip (see README regeneration instructions).

## Meadow visual refresh (2026-09-20)

The user revised the direction from bright anime to a more natural JRPG meadow. `meadowLayout.ts`
owns decorative trail distance, clearings and planting patches shared by terrain and scatter.
Playable terrain heights, boundaries and gameplay collision remain unchanged. `terrain.ts` layers
muted vertex colours with a packed luminance detail map and three sloping distant mountain ranges.
Regenerate `public/textures/meadow-detail.png` with `node tools/terrain/prepare-detail.mjs`; its A/G
channels must encode neutral detail normals, not a photograph's opaque alpha (see regression test).

`scatter.ts` uses 10,000 fine five-blade grass tufts, 1,300 flower cards, 160 rocks and 90 leafy bushes.
Placement is seeded and bounded, keeping trails, spawn, plaza and flooded pond areas open.
`trees.ts` builds shared branching trunk geometry and irregular leaf sprays using `naturalFoliage.ts`.
All original tree locations and trunk colliders remain. Leaves have varied orientation and folded
surfaces; they cast ground shadows without canopy self-shadow stripes. Clones share geometry.

`environment.ts`, `clouds.ts` and `postProcessing.ts` own the subdued hub sky/light grade and periodic
noise cloud banks; the tower has its own environment. `water.ts` uses a stationary muted colour and
reflection-stroke texture while normal ripples move. Keep its colour texture stationary: the gradient
is not periodic. Earlier atmosphere measurements and GLB-tree notes below are historical.
See `docs/superpowers/plans/2026-09-20-meadow-refresh.md` for verification.

## Homing visual polish (2026-09-20)

The hub and tower share the refined target presentation. `crystalGeometry.ts` builds bevelled sapphire
shells/inner cores and bounded hit-ring/glint geometry; `crystals.ts` preserves static positions and
flash(index). Geometry is shared; hits animate per-mesh visibility while their material stays shared.
`homingReticle.ts` draws four fine warm-red arcs, pale ticks and dark keylines around an open centre.
`reticleTiming.ts` contracts once on acquisition; repeated previews do not restart it. Existing lock
eligibility remains the only source of target availability.

`dashTrail.ts` replaces frame-count TrailMesh with two additive soft-edged ribbons. `trailHistory.ts`
samples at fixed time intervals and clips history to 0.2 seconds; stopping emission leaves a fading
tail, while starting/resetting discards previous history. The trail generator follows the imported Chest joint identified by the model receipt, so kick lift and lean stay aligned. Missing-joint imports use a seated torso fallback. release() disposes the custom trail.
No homing movement, target selection, crystal placements or input rules changed.
## 1. What this is

A **3D action game for the web**, migrated from Godot 4 (C#) to a web-native stack. A hub world hosts
NPCs that lead into (future) Sonic-style 3D levels, Sonic-style 2D levels, and puzzle games (2048,
Sudoku). The original Godot project is preserved under `__prototype__/` as a behaviour reference.

**Stack:** Svelte 5 (runes) · TypeScript · `@babylonjs/core` + `@babylonjs/havok` (physics) +
`@babylonjs/loaders` · Vite · Vitest · Tauri v2 (desktop/mobile). **Package manager: pnpm.**

**Architecture discipline (non-negotiable):** a pure, engine-agnostic **domain** (`src/domain/`, no
babylon/Svelte/IO imports) drives a thin **presentation** layer. Presentation reads input → converts to
domain values → runs the pure step → applies the result to babylon/physics. Principles: **TDD, DDD,
functional core, reactive UI**, plus the project's **18 code-quality principles** in
`docs/engineering-principles.md`.

## 2. Repo layout

| Path | What |
| --- | --- |
| `src/domain/` | Pure TS: `hub/character/*` (movement), `dialogue/*` (dialogue graph + DSL), `audio/` (footstep cadence + contact phases, gait selection, music director, per-bus mix, cue variant rotation), `math/`, `kernel/`. No engine imports. Vitest-covered. |
| `src/presentation/babylon/` | The 3D scene: `hubScene`, `terrainHeight` (pure) + `terrain`, `scatter`, `trees`, `knight`, `playerController`, `followCamera`, `input`, `environment`, `capsule`. |
| `src/presentation/audio/` | AudioV2 wiring: `audioEngine` (engine + buses), `manifest` (cue → file/bus/volume), `soundBank` (loading + missing-asset policy), `musicCrossfade` (which track plays, and the handover), `clipSample` (the rig's animation state read as phases and weights), `deferredAudio` (the handle handed back while the graph is still building), `hubAudio` (per-frame scene wiring). |
| `src/presentation/dialogue/` + `src/app/` | Svelte AVG UI + app entry (`App.svelte`, `gameMode`). |
| `tests/` | Vitest specs — mirror the domain, plus pure presentation fns (`terrainHeight`, `cameraRelativeDirection`). |
| `docs/superpowers/specs/` + `plans/` | **Every feature has a design spec and an implementation plan here.** Read these for the "why". |
| `docs/engineering-principles.md` | The 18 principles (canonical). |
| `docs/superpowers/specs/2026-08-18-refined-hub-world-roadmap.md` | **The roadmap** — current milestone + what's next. |
| `__prototype__/` | Original Godot 4.7.1 (mono/C#) project — parity reference; also holds the GLB export tools (`tools/export_web_glb.gd`). |
| `public/` | Assets: `models/knight_web.glb`, `models/knight_mr.webp`, `models/tree.glb`, `textures/grass.jpg`, `portraits/`, `fonts/`, `audio/{music,sfx,ambience}` (+ `audio/CREDITS.md`). |
| `src-tauri/` | Tauri v2 desktop shell (Rust). |

## 3. Setup on a new machine

**Prerequisites**
- **Node** (v24 used here) + **pnpm** (v11). `corepack enable` or install pnpm directly.
- **Git LFS** — REQUIRED. `.glb`/`.fbx`/`.blend`/`.vrm`/`.webp` are LFS-tracked (see `.gitattributes`).
  After cloning: `git lfs install && git lfs pull`, or every LFS-tracked file is left as a pointer file,
  and the two matter differently. If `knight_web.glb` itself is still a pointer, `ImportMeshAsync` fails,
  `loadKnight` rejects, and — since `App.svelte` calls it with `.then()` and no `.catch` — that is an
  unhandled rejection and a blank canvas: the scene loads empty. Only if the GLB pulled correctly but
  `knight_mr.webp` (the armour's metallic/roughness map) is still a pointer does the failure stay local:
  that one texture fetch fails, and the scene loads with the knight's armour stuck matte and a console
  warning instead of empty. (`.png`/`.jpg`/fonts are normal binaries and clone fine.) `.mp3`/`.ogg` are
  LFS-tracked too: every file under `public/audio/` left as a pointer fails to decode individually, and
  `soundBank.ts`'s missing-asset policy treats that exactly like a missing file — one `[audio] cue "…"
  unavailable` warning per affected cue, the game stays silent for those cues, and nothing else breaks.
  A contributor who skipped `git lfs pull` gets **a silent game with console warnings, not a broken
  one** — that's the missing-asset policy working as designed, not a second bug to chase.
- **Rust toolchain** — only needed for `pnpm tauri` desktop builds. Not needed to run in the browser.
- **Godot 4.7.1 (mono)** — only needed to *regenerate* the knight/tree GLBs from the prototype (rare).
  On the old machine it was at `/Applications/Godot_mono.app`; install wherever on the new one.

**Commands**
```bash
git lfs pull            # pull the LFS models after clone
pnpm install
pnpm dev                # Vite dev server → http://localhost:5173
pnpm test               # Vitest (domain + pure presentation)
pnpm exec tsc --noEmit  # typecheck
pnpm build              # static bundle → dist/
pnpm tauri dev          # native desktop app (needs Rust)
```

## 4. Current state (M1–M3 and M4/P1–P4 merged to `main`; P4's in-browser verification is the only thing left before M4 closes)

- **M1 — hub web parity:** third-person mouse-look knight (WASD/Space), pure-domain movement, Havok
  capsule, Idle/Walk animation blend.
- **M2 — AVG dialogue system:** pure dialogue-graph domain + a small DSL (`src/domain/dialogue/`),
  reactive Svelte AVG UI (portraits, backlog/LOG, AUTO/SKIP, branching choices), played on hub entry.
- **M3 — hub environment:** grassland ground, trees (glTF), procedural skydome, sun + shadows,
  procedural ground scatter (grass/flowers/rocks/bushes, thin-instanced).
- **M4 — refined hub world (in progress):**
  - **P1 terrain & collision** (PR #19): rolling terrain from a seeded `terrainHeight` + static MESH
    collider; tree-trunk + selected-rock colliders; the player rides the terrain.
  - **Map scale-up** (PR #21): field 50×50 → **100×100**; hard invisible walls replaced by a **natural
    terrain barrier** (edge ramps past the controller's walkable slope); grassy barrier slope; camera
    clamped above the terrain (no see-through on down-pitch/slopes).
  - **Run + jump** (PR #23): Mixamo Run/Jump retargeted onto the knight through the existing Godot
    pipeline; a **run/walk modifier** on Shift (`runSpeed` 8, derived from the clips' measured
    stride) — shipped as "hold Shift to sprint" and **inverted since**: the character runs by default
    and holding Shift walks, which is the way round the climbing tower's jumps wanted it; jump wired
    end to end; feet planted to **2.5 mm** on flat ground (was ~10 cm of float). Movement gained a
    single pure owner for ground contact (`groundContact.ts` — coyote time, jump buffering, takeoff
    guard) and slope-following (`slopeMotion.ts`), plus heading-based steering. Four gameplay bugs
    fell out of it: **jumping while walking was impossible**, gentle slopes cut running from 8 u/s to
    2.9, running turns had the model and the body pointing different ways, and landing sometimes
    played the jump clip's tail. See the design spec §11-16 for the measurements behind each.
  - **P2 lighting & atmosphere:** ACES tone mapping + exposure/contrast, restrained bloom, EXP2 distance
    fog, MSAA restored on the pipeline. Trees rebuilt off PBR (the only PBR surface fog actually reaches —
    the knight is PBR too but stays inside the ~1 % band, see §7 — and they fogged
    in linear space, which bleached them). Skydome gradient orientation fixed — it was inverted, rendering
    pale overhead. Design + all findings:
    `docs/superpowers/specs/2026-08-21-lighting-atmosphere-design.md` (§11–§12 are the measured record).
    **Deferred:** the mountain ridge still keeps a visible edge against the sky; the only remaining lever
    is `terrain.ts`'s `haze` colour, which is a human art-direction call (§11a).
  - **Knight face lighting:** the head — `Mesh_1` (face and hair together, 8047 verts, the topmost
    mesh in the model) and `Mesh_23` (the inner head, 1533 verts, reaching below `Mesh_1`'s bottom and
    overlapping the body's top — see `HEAD_MESHES` in `shadowPolicy.ts` for the vertex counts and
    Y-extents); the eyes are painted into the face texture, so there is no separate eyeball mesh —
    gets its own material cloned off the single
    shared glTF material, with the albedo added back as emissive so the face stays bright and flat
    instead of tracking the sun. Head region mean luma 35.6 → 68.8 at the shipped 0.45 (0.25 gives
    57.1), with the rest of the frame flat at 114.3 as a control — which is what says the body meshes
    are untouched. **That table is from the previous character's three-mesh head (`Mesh_0` +
    `Mesh_32`/`Mesh_33`), not the current two-mesh head above, and has not been retaken** — a
    different head mesh with a different face texture in a different frame composition cannot
    reproduce it. `FACE_EMISSIVE` was tuned against those numbers, so the constant is inherited and
    unverified for this model; re-measure both the table and the constant on the current head before
    relying on either. Measure it with the idle animation paused and the head region located by which
    pixels the change touches, not by a hand-placed box; see `FACE_EMISSIVE` for the method.

    **Body PBR (medieval-knight swap):** the armour, previously baseColor+normal only, now also gets a
    packed metallic/roughness map (`public/models/knight_mr.webp`, glTF-style: roughness → G, metallic
    → B), applied by `applyBodyPbr` in `knight.ts` after the face clone so the two never fight over the
    shared material. `BODY_METALLIC` was held at 0.6 rather than the physically-correct 1, and
    `BODY_DIRECT_INTENSITY` pushed to 1.6, because the scene had no environment texture and a fully
    metallic surface with nothing to reflect renders near-black. **Both are back at 1.0 as of the
    stylized-knight swap:** `createEnvironment` now sets `scene.environmentTexture` to a neutral studio
    IBL (`public/env/studio.hdr` — not reproducible, see `public/env/CREDITS.md`), so the armour has
    something to reflect and `IBL_INTENSITY` is the brightness lever instead of those two constants.
    `backFaceCulling` is off on the body only, closing see-through
    seams where the armour's single-sided shells don't quite meet. All of these are measured constants;
    see their doc comments in `knight.ts` and `environment.ts`, and re-measure before changing any.

    Three things not to re-derive. The complaint was "the face is too dark, too affected by scene
    lighting, and the shadow on it looks bad" — **not** cel banding or outlines, neither of which was
    asked for. **That "shadow" is not a shadow:** `receiveShadows` is `false` on both `HEAD_MESHES`
    (`Mesh_1`, `Mesh_23`) — the shadow-quality PR makes the other 40 body
    meshes receive, but the face stays excluded — so nothing is cast onto the face; the dark band
    is the **N·L terminator**, the diffuse falloff on the side turned away from the sun, which is
    why the fix is an emissive floor rather than anything to do with the shadow generator. And **do
    not convert the knight to StandardMaterial** — that was tried on the theory that the trees'
    PBR-vs-gamma problem applied here too, and it does not (the knight sits ~5 units from the camera
    where fog is 0.14 %). The conversion made it markedly worse: near-black hair, grey face, dull armour.
  - **P3 water & landmarks:** a wadeable **pond** — a `StandardMaterial` disc at (−15, −0.95, −5),
    radius 12, procedural scrolling ripple normals, opacity Fresnel, **no collider** so the player
    wades the terrain underneath — and a **stone colonnade** as the hub's destination: eight pillars
    on a radius-8 ring at (−6, 32) plus a central pedestal, each a static `PhysicsAggregate`, pillars
    seated individually on the terrain but sharing one crown height (base spread 1.237, crown spread
    **0**). Both sit on the existing height field; `terrainHeight.ts` is untouched.
    Design + the measured record: `docs/superpowers/specs/2026-08-24-water-landmarks-design.md`
    (§9 is the measurements). Costs **0.09–0.26 ms/frame** of a 16.7 ms budget, effectively all of it
    the landmark; the water is at the noise floor.

    P3 also exposed a **pre-existing `knight.ts` bug** that was latent since foot-planting was
    written (§7): the visual knight was planted against `terrainHeight`, the height *field*, so it
    rendered *through* anything with its own collider. On the pedestal the capsule was correctly at
    1.843 on a 1.717 top while the model's lowest vertex sat at 1.167 — exactly the terrain height,
    0.55 low. Now planted against a downward physics raycast; on a miss it asks the world's own
    ground query, which since the climbing tower is `GroundHeight = (x, z) => number | null` — the
    hub answers everywhere from `terrainHeight`, the tower answers nowhere (`unknownGround`), and a
    plant handed no answer holds the correction it last measured rather than inventing one. This is
    not a P3 bug; P3 was just the first thing built that the player stands *on*.
  - **P4 life & motion:** a shared wind field (`wind.ts`, a `MaterialPluginBase`) bends grass, flowers
    and trees (`scatter.ts` / `trees.ts`, one `applyWind` call each) along the single direction in
    `windDirection.ts`; a second inward-facing dome (`clouds.ts`) carries a procedurally drawn,
    seamlessly u-tiling alpha texture that drifts in sync with the same clock; both wired into
    `hubScene.ts` via `createWind`/`createClouds`. The ambient-creature layer in the original DoD
    (butterflies) was built and then cut by the owner on 2026-09-04 — see roadmap §4 P4 and
    `docs/superpowers/specs/2026-09-04-life-and-motion-design.md` §5 — and struck from the DoD rather
    than silently dropped. **Verification is incomplete:** per that spec's §7, nobody has yet watched
    the field's motion in a running scene, looked at a tree canopy against its own shadow for the
    mismatch §3e records as a known limitation, or measured P4's frame cost against the budget in
    §2/§5 below. Only the cloud band's placement was checked (the probe measurement in `clouds.ts`);
    the drift itself and the full-loop seam are unwatched. M4 does not close until those are done and
    the roadmap's §6 "world done" checklist is walked (spec §8).

## 5. What's next (the plan)

Read the roadmap: `docs/superpowers/specs/2026-08-18-refined-hub-world-roadmap.md` (M4 phases + §7b
scheduled additions). Sequence from here:

1. **Toon shading on the knight — the face is lit, the cel banding is not.** `knight.ts` gives the head
   its own material (§4); what is *not* built is hard light/shade banding or an outline.

   If those are wanted, check `@babylonjs/materials` first: it ships `CellMaterial`, a cel shader with
   `computeHighLevel` banding that inherits the standard bone/fog/instance define handling, so it
   needs neither a manual fog block nor explicit 100-bone skinning, and being gamma-space it lands on
   the *same* side of the §7 fog-space split as the trees rather than making the knight the next
   odd-one-out. It is **not installed** (only `core`, `havok`, `loaders` are), so it is a dependency
   decision rather than a free win. Failing that, banding means a NodeMaterial that wires the fog
   block and the 100-bone skinning explicitly. Either way `mesh.renderOutline` is built into `core`
   and is the cheap way to get the outline.

   Note: the previous character's `Mesh_0` was 242k of its ~320k verts — that measurement is from the
   character this repo no longer ships (`Mesh_0` is a body mesh on the current knight, not the head)
   and has not been retaken. The current GLB was texture-optimised but never decimated either, which
   is still a separate job; re-measure per-mesh vertex counts on the current model before picking a
   decimation target.
2. **P4 — life & motion: finish the verification.** The code shipped (§4 above): wind sway, drifting
   clouds, the ambient-creature layer built and then **cut on 2026-09-04** by the owner — roadmap §4
   P4 and `docs/superpowers/specs/2026-09-04-life-and-motion-design.md` §5. What's left is what that
   spec's §7 records as **not performed**: watch the field actually move in a running scene, look at a
   tree canopy against its own shadow for the §3e mismatch, and measure P4's frame cost against the
   budget below. Budget against the already-loaded scene (roadmap §7): the fps headroom the earlier
   phases left is what P4 spends. P2 measured its own cost at **0.3 ms** and P3 at **0.09–0.26 ms**.
   Note P3's numbers were taken on a different machine from P2's, so compare *within-session deltas*,
   never the absolutes (P3 spec §9d).

   **The budget was re-measured on 2026-09-04, on a visible pane, and the old "roughly 8x headroom"
   figure is superseded.** Full record:
   `docs/superpowers/specs/2026-08-25-shadow-quality-design.md` §7, "Task 6 (re-measured 2026-09-04)".
   Headline, at 1280x720 on the ARM64 dev machine (Adreno X2-90):

   - **Shipped scene: ~5.1 ms** of the 16.7 ms / 60 fps budget → **~11.6 ms left, ~3.3x** (not 8x).
     That is a **720p** number. Cost scales 1.68x to 1080p and 2.66x to 1440p, so **1080p is ~8.6 ms →
     ~1.9x** and 1440p leaves almost nothing. Real vsync-locked frames run at the display's 144 Hz cap
     (6.90 ms median, p95 7.9 ms).
   - **Shadows are ~91% of that frame** — 4.65 ms, split 3.25 ms shadow-map regeneration + 0.78 ms
     receiver-side PCF. **Everything else in the hub — terrain, 16 000 grass instances, trees, knight,
     water, landmark, the whole post-processing chain — is 0.57 ms.**
   - The **~360 newly-casting rock/bush thin instances**, flagged here as an unmeasured risk, cost
     **~0.25 ms — at the noise floor.** The risk was real but landed on the wrong object: the knight's
     **47 caster meshes cost 1.73 ms** (188 draw calls across four cascades), a third of the whole
     frame. That is the cheapest ~1.7 ms on the table if P4 ever needs it back.
   - **Error bar:** three measurements of the identical config seconds apart spread by a median factor
     of **1.40** on this fanless ARM laptop. Only paired deltas are trustworthy; absolutes carry ~±20%;
     **any delta below ~0.4 ms is unresolvable here.**

   Threshold 4 of the shadow spec (shadow-map re-render < 1.5 ms) **fails at 3.25–4.04 ms**. That is a
   known, accepted overrun, not a regression to chase before P4 — the frame still fits 60 fps three
   times over — but it is where the budget lives if P4 runs out.

   P3 left `WaterBody` (`src/domain/hub/waterBody.ts`) as the shape shallow-water feedback — splashes,
   slowdown, wet shading — should read when someone builds it. **It is not part of P4**, which shipped
   as wind and clouds only: shallow water is movement feel and would reach into the pure movement
   domain, so it was ruled out when P4 was designed (`2026-09-04-life-and-motion-design.md` §1). It has
   no scheduled owner. The plaza's eight pillars are where the mode-entrances attach.
3. **Then: game modes** — Sonic-style 3D/2D levels, 2048, Sudoku (a new milestone, SP2+).

## 6. How work is done here (the workflow)

Every non-trivial feature runs the **superpowers** chain, and it shows in `docs/`:

`brainstorming` (clarify + design) → design spec in `docs/superpowers/specs/` → `writing-plans` →
`subagent-driven-development` (per task: implementer → spec-compliance review → code-quality review) →
**in-browser verification** → `superpowers:code-reviewer` and/or the user's `/code-review` → PR → merge.

- **Pure domain / pure functions get Vitest TDD** (red → green). **Presentation is verified in-browser**
  (screenshots + scripted checks) — babylon scene code isn't unit-tested.
- Reviews follow the 18 principles + TDD/DDD/functional/reactive lenses (see `reviewing-code` skill and
  `docs/engineering-principles.md`).

## 7. Gotchas that will save you hours (babylon / web)

These are hard-won; several cost a debugging session each.

- **Deep babylon subpath imports need side-effect imports.** A mesh with no explicit material throws
  "StandardMaterial needs to be imported before…" and renders nothing. Import the side-effect module
  (`import '@babylonjs/core/Materials/standardMaterial'`; likewise the physics component + glTF loader).
- **Displacing a `CreateGround`: use `setVerticesData`, not `updateVerticesData`.** On a non-updatable
  ground, `updateVerticesData` updates the CPU copy (so the MESH collider and `getVerticesData` see the
  relief) but **never reaches the GPU** — the mesh renders as a flat plane while the player rides the
  displaced collider. And `ComputeNormals` orients this ground's winding downward (renders black), so
  flip normals skyward. See `terrain.ts` — it documents both.
- **Verify the render, don't trust `getVerticesData`.** It reads the CPU copy, so it looks displaced
  even when the GPU is flat. Trust a screenshot / `gl.readPixels`.
- **A backgrounded/hidden preview pane pauses rAF** → `engine.getDeltaTime()` returns 0 → the player
  loop early-returns → holding WASD shows no movement even though the code is correct. To drive it
  headlessly: `engine.beginFrame(); busyWait(~16ms); scene.render(); engine.endFrame()` in a loop.
- **`window.hub` (the dev handle) goes stale across reloads** — re-read it after any reload.
- **Character/camera smoothing is spread across three files and they interact:** `playerController`
  (smooths the *visual* root Y — the capsule micro-oscillates on slopes), `followCamera` (terrain-
  anchored vertical follow + a clamp keeping the camera above the ground), and `knight` (per-frame
  foot-planting). Read their comments before touching any one of them. (The visual-Y smoothing is
  load-bearing, not redundant — a stale-by-one-frame `getAbsolutePosition` means the knight only
  imperfectly cancels the root Y.)
- **Knight animation pipeline:** export from Godot headless (`__prototype__/tools/export_web_glb.gd`),
  then **texture-only** gltf-transform (resize + webp). **Do NOT `simplify`/`quantize`/`resample`
  skinned meshes** — it corrupts the animation (feet slide). Bump `?v=N` on the GLB URL in `knight.ts`
  after rebuilding so browsers refetch.
- **Known, deferred:** landing from a run drops planar speed from 8 u/s to ~3.2 for ~0.4s (the capsule
  bounces on the rolling terrain at speed; the locomotion blend faithfully follows it down into walk and
  back). Physics, not animation — see the run/jump spec §15.
- **Rebuilding the GLB has three sharp edges** (full recipe in the README): Godot serves a **stale
  asset import** after you edit a `.import` file unless you delete `.godot/imported/<Name>.fbx-*`
  first — the bone renaming just silently does not apply; the mono build **needs the .NET 8 SDK**
  installed or it crashes before importing anything; and `pnpm dlx @gltf-transform/cli` **does not
  work on Windows** — install it with npm into a scratch dir and pin `sharp` to `0.34.5`. Godot
  **4.7.2 reproduces 4.7.1's output bit-for-bit**, verified by diffing the re-exported Idle/Walk
  against the shipped ones, so the version bump is safe.
- **Ground contact is deliberately not "what the probe said".** `groundContact.ts` is a small pure
  reducer that turns the Havok support probe plus a jump keypress into the `isGrounded` /
  `jumpRequested` the domain consumes, and it is unit-tested rather than debugged in the browser.
  Three measured reasons it exists: the probe **chatters** (walking sideways loses support on 84 of
  150 frames, in 1-8 frame bursts, as the capsule crosses collider triangles) so it carries coyote
  time and a jump buffer; a jump **has not cleared the floor** for its first few frames, so the probe
  still says SUPPORTED and re-grounding there would cancel the jump; and an earlier "any upward
  post-solve velocity means airborne" rule made **jumping while walking impossible** (uphill walking
  pushes the capsule up the whole time). Don't reintroduce that rule.
- Visuals read `player.isSupported` (the raw probe) and `player.justJumped` (the takeoff frame), not
  `motion.isGrounded`, which carries the jump-clearing guard.
- **The domain thinks in flat ground; `slopeMotion.ts` bridges that to sloped terrain**, by adding
  *only* the vertical climb that puts the velocity in the surface plane. Do not "fix" this by
  projecting the velocity onto that plane instead — projection shrinks the horizontal component, which
  the domain then reads back as its current speed, so running settles at
  `acceleration * delta / (1 - cos(slope))` (measured: **8 u/s down to 2.9 on a 4° rise**), and it
  swings the heading toward the contour, so running at a hill slides you sideways along it (measured:
  **62° of drift on a 27° slope**). The collider is also locally steeper than the height field — a 7°
  hillside gives ~19° contact normals — so both bite far sooner than the visible gradient suggests.
- **The character moves where it faces, and only the heading steers.** `turnRate` (rad/s) caps how fast
  the heading swings; speed is a separate scalar. Easing the *velocity vector* toward its new target
  instead makes turn radius scale with speed — a sprint took 0.6s to come round while the model turned
  in 0.2s, so the knight faced one way and slid the other. For the same reason `playerController` sets
  the model yaw straight from `motion.facing` with no second lerp: two smoothers means two headings.

- **Mixing PBR and StandardMaterial in one scene breaks fog.** PBR shades and blends fog in *linear*
  space; StandardMaterial blends in gamma space. Toward a near-white fog colour, a linear-space blend
  multiplies a dark pixel several-fold while the gamma-space one barely moves it — so with identical fog
  settings, PBR surfaces bleach to grey while everything around them looks untouched. Measured: a tree
  27 units out took a **0.32** fog blend where EXP2 asks for 0.04 and the grass beside it took 0.07. The
  hub is all StandardMaterial for this reason; glTF imports arrive as PBR and are converted in
  `trees.ts`. **The knight is still PBR** — it survives only because it stays close to the camera where
  fog is under 1 %. Give it a custom material and this bites.
- **Attaching a `DefaultRenderingPipeline` silently turns off MSAA.** `antialias: true` on the engine
  only anti-aliases the *default framebuffer*; a pipeline redirects the scene into an offscreen target
  where it does not apply, and Babylon defaults `pipeline.samples` to 1. Nothing errors — the image just
  gets more aliased. Set `pipeline.samples` explicitly (we use 4; 8 measured no better for double the
  cost).
- **`readPixels` after `endFrame()` may read a post-process render target, not the canvas.** It comes
  back a flat uniform colour and looks exactly like a broken scene. Call
  `engine.restoreDefaultFramebuffer()` first. Two related measurement traps: changing a material flag
  triggers **async shader recompilation**, so a reading taken immediately after can reflect the *old*
  shader (this produced a non-monotonic sweep and a confident wrong conclusion); and with the preview
  pane hidden `requestAnimationFrame` never fires, so frames must be driven manually with
  `beginFrame`/`render`/`endFrame` and awaiting a render observable will simply hang.
- **Swapping the material on a skinned mesh makes it vanish, silently.** A 100-bone skinned mesh needs
  a new shader variant compiled, and it renders as *nothing at all* until that finishes — long enough
  to look like the model is broken, and long enough to poison any measurement taken meanwhile.
  `await material.forceCompilationAsync(mesh)` before rendering or reading pixels. Waiting N frames
  does not work and neither does `mesh.isReady()`; both reported ready while the knight was invisible.
- **`material.dispose(false, true)` destroys textures the material only borrowed.** The second argument
  is `disposeTextures`. A throwaway probe built by *assigning* another material's `Texture` objects
  shares those very objects, so disposing them takes out the real material too — the knight lost its
  albedo and no amount of restoring the material brought it back. Use `dispose(false, false)` whenever
  the textures came from somewhere else.

  The distinction that matters: Babylon **does** reference-count the GPU upload, on
  `InternalTexture._references` (there is no public `references`, so reading that proves nothing).
  `Texture.clone()` resolves through `BaseTexture._getFromCache` and calls `incrementReferences()`, so
  a *cloned* wrapper holds its own reference and disposing it is safe — measured: 2 → 3 on clone,
  back to 2 on dispose, upload intact. An *assigned* wrapper never increments anything, which is why
  the probe above took the count straight to zero. Clone-then-dispose is safe; assign-then-dispose is
  the one that bites.
- **Measure image quality on whole frames, not sampled points.** An emissive floor exists for the
  *shaded* side of a surface; sampling lit pixels showed a 4x sweep moving them by 3/255, which read as
  "this lever does nothing". It was removed on that basis and sent 10.5 % of the frame to pure black.
  Whole-frame statistics (fraction at pure black, blown pixels, mean luma) would have caught it
  immediately — and did, once used.
- **The character controller has NO step-up: `maxStepHeight` is 0.** That is Babylon's default and
  `playerController` never raises it, so the capsule rides a 60° slope but cannot climb a vertical
  face of *any* height — a 0.55 m kerb is as impassable as a wall. Measured: walking at the plaza
  pedestal jams the player at 2.21 from its axis (its 1.6 radius plus the 0.5 capsule). **Anything
  the player must get on top of has to be reachable by slope, or by jumping.** Raising
  `maxStepHeight` is a world-wide movement change — it alters how the player meets every rock, trunk
  and pillar — so it is a movement-system decision, not something to fix per-prop.
- **Foot-planting must use the surface the player is standing on, not `terrainHeight`.** `knight.ts`
  drops the visual knight by the gap between the capsule bottom and the ground, because the capsule
  rests ~0.13 above whatever it stands on. That lookup used the height *field*, so on any raised
  collider the model rendered straight *through* it: on the plaza pedestal the capsule was correctly
  at 1.843 on a 1.717 top while the knight's lowest rendered vertex sat at 1.167 — exactly
  `terrainHeight(-6, 32)`, 0.55 low, i.e. standing on the ground inside the plinth. It now casts a
  downward physics ray (`PhysicsEngine.raycastToRef`, ~7 µs). Two traps this hid behind: **no physics
  assertion can see it** — the capsule was always
  right, only the render was wrong, so the check must compare the knight's lowest rendered vertex
  against the collider; and **"stand on X" passes on the broken build if you teleport the capsule**,
  which is what an automated check naturally does. Make the character get there under its own power.
  (`CharacterSurfaceInfo` cannot help — it carries normals and velocities, no surface *position*.)
- **And a world's ground query is not the surface under a foot either** — the same lesson one level
  up, which the climbing tower found. The raycast above falls back to that query when it misses, and
  that read as a safe floor only for as long as the hub was the only world: a height field *is* the
  surface everywhere over it. A level of stacked platforms has no such function. Its floor is the
  surface for a character at the base and for nobody standing 40 u up, and the ray misses precisely
  at every platform's **edge** — horizontally, where the sole has passed the slab while the capsule
  is still supported by it — so the fallback fired on an ordinary stride and drew the knight down on
  the floor 52 u below its own capsule. Lengthening the ray does not close a horizontal miss. The fix
  was in the type: `GroundHeight` returns `number | null`, `unknownGround` is the honest answer for a
  world built of colliders, and each consumer decides what it does without a number (the plant holds
  its last correction, ~0.13 u; the camera loses a 0.1 u floor and a 0.12 u aim anchor at the base).
- **A clip retimed onto a *jump's* airtime under-covers every landing below its takeoff.** The knight's
  jump segment is stretched to fill `airtime` = `2 · jumpSpeed / gravity` = 0.75 s, which is the
  flat-ground number: rise `jumpSpeed / gravity` = 0.375 s, fall the same 1.6875 u back. Landing `h`
  below takeoff makes it `0.375 + √((1.6875 + h) / 12)`, which exceeds 0.75 s for **every** `h > 0`.
  So the "the clip ends as the capsule lands" that the retime is for is true on flat ground and
  nowhere else, and the hold that covers the difference (`knight.ts`, the jump segment re-pinned on
  its last frame while `offGround`) is not a tower-only path: it fires on roughly every downhill jump
  in the hub. Its size there is bounded — over the walkable belt (`r ≤ EDGE_RADIUS` 42) the relief
  is 7.15 u, and the largest gap between two walkable points one jump's 6 u reach apart is 3.15 u
  (0.25 u grid scan), giving 1.010 s off the ground and **0.260 s** of held final frame. Pure falls are the
  rare case, not the common one: a fall needs a 10.83 u drop before `FALL_GRACE_SECONDS` plus 0.75 s
  are used up, and the hub's whole relief only buys 0.572 s of off-ground.
- **Benchmark configs interleaved, never one block each — and shuffle the order *within* each round.**
  Interleaving alone was not enough in P3: with a fixed order inside each round, "landmark off"
  (2.805 ms) came out *faster* than "both off" (2.984 ms), which is impossible since both-off draws
  strictly less. Shuffling the config order within each round fixed it. Better still, take **paired
  within-round differences** rather than comparing absolute medians: absolutes drifted nearly 2x
  between runs with machine load (0.92 → 2.70 ms for the same scene), which swamps any small effect,
  and pairing cancels that drift. Also **never compare absolute ms across machines** — P2's 2.137 ms
  and P3's 0.92–2.70 ms are different hardware and the comparison is meaningless.

  The original P2 finding this bullet grew from: a block-per-config run had the *same* config at
  2.96 ms and 2.06 ms, and reported "bloom off" (1.778 ms) as *faster* than "whole pipeline off"
  (2.001 ms) — impossible, since bloom-off still pays for tone mapping that pipeline-off does not.
  Round-robin across configs with medians fixed that one. Run-to-run spread is ~30 % at best, so
  trust the *ordering* across several configs rather than any single number.
- **`ShadowGenerator.bias` is normalized light-space depth, not world units — the safe value does
  not carry over between generators.** Its world-space size scales with the light frustum's depth
  range. 0.002 over an `autoUpdateExtends` frustum covering the whole hub (83.7 x 65.3 units) worked
  out to roughly 0.2 world units and silently suppressed *every* shadow in the scene: the receiver
  shaders still compiled with `SHADOW1`/`SHADOWPCF1` and the shadow map still re-rendered every
  frame, so nothing looked wrong anywhere except the picture, and only objects thicker than the
  offset cast at all. Under cascaded shadow maps the same knob is a different problem in the
  opposite direction — each cascade's depth range is small enough that `bias` is entirely
  irrelevant across the whole swept range `[0, 1e-3]`. The "safe" number is a property of the
  generator, not the scene: re-tune it after changing cascade count, `shadowMaxZ`, or swapping the
  generator.
- **Verifying shadows: freeze the whole frame, not just the animation.** Pausing `AnimationGroup`s
  is NOT enough — `driveKnightAnimation` re-plays and re-weights them every frame regardless, so the
  knight kept moving between captures and a 0-vs-0 control that should have read 0 read 169. Set
  `scene.animationsEnabled = false` to actually stop it (side effect: the knight reverts to bind
  pose in captures — harmless, don't mistake it for a bug). Also set `scene.physicsEnabled = false`
  — physics stepping alone accounted for 59 of 64 stray control pixels — and pin the water ripple,
  which scrolls `uOffset`/`vOffset` on an `onBeforeRenderObservable` in `water.ts` entirely outside
  `animationGroups` and will pollute any control with the pond in frame.
- **Always run a 0-vs-0 control, and for caster-list swaps a restore control too — both must read
  exactly 0.** This is what caught the very first false positive on this branch: an idle animation
  advancing between two captures read as "shadows are working" until the 0-vs-0 control came back
  non-zero.
- **Shader recompiles land asynchronously and can defeat the usual controls.** One measurement
  returned 0 px with a zero reproducibility control AND a zero restore control — looking entirely
  trustworthy while being completely wrong — because receiver shader variants compile lazily on
  first draw and the warm-up frames used were not enough for meshes newly set to receive. A global
  darkness A/B, which forces a full redraw, exposed the contamination. Any reading taken right after
  a `receiveShadows` flip on a mesh not yet drawn in that state is invalid, and neither control
  catches it.
- **Perf: never A/B by toggling `scene.shadowsEnabled`.** It changes material defines, so the
  comparison ends up timing shader recompilation, not shadow rendering — it produced a 4.729 ms
  "cost" with a tight IQR against a frame that only took 3.4 ms in total, an arithmetically
  impossible result that the tight IQR made look authoritative. Hold every define fixed and pair
  `shadowMap.refreshRate` 1 (re-render the map each frame) against 0 (render once, never again)
  instead. Absolute cross-config comparisons on a busy machine are also unusable on their own: the
  identical shipped config measured 2.855 ms and then 5.141 ms minutes apart with nothing changed —
  an 80% spread that only a reproduce-the-first-config control caught.
- **`ShadowGenerator`s are keyed by camera in Babylon 9.** Ours is constructed with the follow
  camera, so the no-arg `sun.getShadowGenerator()` misses and returns `null`. Call
  `sun.getShadowGenerator(scene.activeCamera)`.
- **That keying is a live invariant on the cascaded branch, not a one-time setup detail — watch it if
  a second camera is ever added.** `createShadows(sun, camera)` (`shadows.ts`) registers the cascaded
  generator under `camera`, and Babylon looks it up every frame as
  `light.getShadowGenerator(scene.activeCamera) ?? light.getShadowGenerator()`
  (`materialHelper.functions.js`, `light.js`). On that branch the no-arg fallback reads the `null`
  key, which nothing on that branch registers under, so the lookup only succeeds because
  `scene.activeCamera === camera`. (The WebGL1 fallback is different: `ShadowGenerator`'s constructor
  stores `camera ?? null`, so `new ShadowGenerator(FALLBACK_MAP_SIZE, sun)` — passed no camera —
  registers itself under that same `null` key, and the no-arg fallback resolves it regardless of
  `scene.activeCamera`; see `shadowGenerator.js:633,645`.) `hubScene.ts` keeps the cascaded-branch
  invariant true today only because it sets `scene.activeCamera = follow.camera` immediately before
  calling `createShadows` with that same camera, and never repoints `scene.activeCamera` afterwards.
  This project already has an AVG overlay path; the day a cutscene or AVG camera becomes
  `scene.activeCamera` without also becoming the shadow generator's camera, every shadow on the
  cascaded branch stops rendering with no error and no console warning. Either re-create the generator
  for the new camera or keep `scene.activeCamera` pointed at the camera the generator was built with.
- **Performance cannot be measured through a hidden Browser pane.** A pane that is open but not
  visible still renders, but the page is GPU-throttled: eight back-to-back samples of one identical
  config came back 47.7–128.0 ms, a 2.7x spread with a monotonic upward drift as the throttle ramps.
  This invalidates every timing number taken that way — frame time, fps, paired A/B costs — while
  leaving pixel/image comparisons untouched, since throttling changes *when* a frame is produced, not
  *what* it contains. Check `document.hidden` before trusting any timing number; if it's `true`, the
  numbers are worthless no matter how tight the IQR looks.

- **The dev server dies on `EBUSY` from `.claude/worktrees/`.** Vite watches the whole project root,
  including other sessions' worktrees, and a locked file in one takes the server down mid-session.
  It is a loud crash rather than a silent one, but it looks like your change broke the preview.

### Checks that were green over real defects

The §7 entries above are about the engine. These are about the *verification*, and they cost most of
PR #33's 18 review rounds — each one is a case where a check reported success over something broken.

- **`element.click()` dispatches no pointer events.** It does not reproduce pointer-focus behaviour,
  so it cannot verify anything about focus after a click. A defect that only appeared on the click
  path was "verified fixed" with it in round 9 of PR #33, and stayed broken until round 11 drove a
  real pointer click. Use the
  Browser pane's own click action when focus is what you are testing.
- **`svelte-check` and `vite build` have both been green over broken markup.** `svelte-check`
  reported zero errors over a file Vite's compiler rejected outright; and both were green over a CSS
  rule spliced into the *markup* by a bad edit, because Svelte took it as text content and rendered
  it. When an edit is structural, re-read the file — no tool here will tell you.
- **Vite's watcher silently misses file replacements on this machine.** `perl -0pi` and similar
  rewrite the file rather than editing in place, and the dev server kept serving the old module —
  same Svelte scope hash, old computed values. If a measurement contradicts the source, check the
  scope hash and restart the server before believing the measurement.
- **A hidden Browser pane changes what runs.** `requestAnimationFrame` never fires (the page never
  paints), `elementFromPoint` returns `null`, `innerWidth`/`innerHeight` read `0`, and long async
  probes time out. This is the same class as the `document.hidden` timing trap in §7's performance
  notes. It also caught a real bug: an rAF-deferred focus call would never have run for a user with
  the tab in the background.
- **A test can pass while the code it pins is broken.** Two cases written specifically to pin the
  modal focus machinery passed with that machinery deliberately reverted — one because all fake
  timers were advanced before Svelte ever re-ran its effects, one because an unkeyed `{#each}` reused
  the button so focus appeared to survive. **Break the code and watch the test fail** before
  believing a new test. It is one command and it has been wrong more often than not here.

## 8. Claude's local memory (optional, but valuable for continuity)

The richest operational notes live in **Claude's machine-local memory**, not in git:
`~/.claude/projects/-Users-maplewing-Repos-ProjectRondo/memory/` — `babylon-web-verification.md`,
`godot-headless-verification.md`, `game-backlog.md`, `engineering-principles.md`,
`dotnet-test-roll-forward.md`, plus `MEMORY.md` (the index). The essentials are summarised above and in
`docs/`, so it's **not required** — but copying that `memory/` folder to the same path on the new
machine gives the next Claude session full continuity.

## 9. Quick "am I set up right?" checklist

- `git lfs pull` done, and `public/models/knight_web.glb` and `public/models/knight_mr.webp` both start
  with their real binary headers (`glTF` and `RIFF` respectively), not `version https://…`.
- `pnpm test` → all green.
- `pnpm exec tsc --noEmit` → clean.
- `pnpm dev`, open the URL → hub loads: the knight stands on rolling grass, an AVG intro plays, WASD
  moves, walking to the edge is blocked by a steep grassy slope (not an invisible wall).

### 2026-09-21 meadow rock seam repair

The rock icosphere duplicates vertices across face/UV seams. Random deformation per buffer entry pulled shared corners apart: the new geometric-edge regression reproduced 60 open edges. Cache one displaced position per original corner, use gentler radial variation and subdivisions 2 for a solid rounded silhouette. Existing placement/collider logic is unchanged. Regression passes with every edge adjoining two triangles and all normals outward; browser close-up shows a closed surface. Typecheck and production build pass; existing build chunk-size warning remains.

### 2026-09-21 Title and Main Menu (Light)

Entry is now Title → Main Menu → Start → existing intro/hub. Opening-game direction is deliberately undecided; no new narrative or world-map decision. App.svelte hosts the guarded front door and lazily imports GameSession.svelte (the previous App's scene lifetime). Main menu has Start, real audio Settings, and return to Title. No save/load/gallery facade. Temporary display name is Project Rondo. Character art reuses the portrait still, title/menu are silent; reduced-motion and 390px layouts are supported.

Audio preferences validate and persist master/music/SFX/ambience/mute in localStorage with session fallback on storage errors. Every audio graph subscribes through existing busGain and unsubscribes on dispose. Loading blocks duplicate starts, delays dialogue until ready and hands keyboard focus to dialogue. Errors offer retry/menu recovery. Rejected Havok initialization is evicted so retry can recover, while successful/concurrent compilation remains shared.

Validation: 88 files / 632 tests pass, including guarded flow, lazy mount, focus, error/retry, settings/storage/live-bus cleanup and Havok failure recovery. Typecheck and build pass (existing large game-chunk warning). Browser verified desktop Title/menu, settings persistence/reset, 390×844 settings/menu, keyboard Escape focus restoration, then Start → intro choices → playable hub without console errors. Temporary viewport reset; test audio values restored. Existing gameplay requires keyboard/mouse; responsive menu does not add mobile gameplay controls.

### 2026-09-21: First playable traversal course

- Main Menu now has Trial Run / 試玩第一關; original Start retains the AVG -> hub -> tower flow. Separate lazy CourseSession owns the new scene, HUD, pause/result UI and return-menu teardown.
- `domain/course/courseLayout.ts` authors a 207m +Z grassland/ruin route, six gap jumps and two four-crystal chains. Ordered grounded gate volumes; falling below -12 returns to last checkpoint. `courseProgress.ts` owns timer/falls/finish latch. No enemies or open-world decision added.
- Reuses player v20, homing, atmosphere, shadows, audio. Course-only camera framing and initial heading make landings visible. `courseScenery.ts` supplies physical support separately from decorated cliffs/vegetation; packed meadow texture uses linear detailMap.
- Escape or HUD Pause freezes physics/timer; Babylon's public animation-clock reset excludes paused/hidden/loading time on resume. Pause button handles Space before window game input. Replay reuses loaded assets and resets progress; exit disposes level/engine with late-build guards.
- Validation: 651 tests/94 files pass; typecheck zero errors/warnings; build passes (existing large-chunk warning). Actual browser input driver cleared all jumps +8 homing hits in22s,0falls,0errors. Separate QA verified checkpoint fall recovery, pause/resume, replay, main-menu return and original AVG Start. Human first-attempt difficulty remains to be evaluated; this is a short first playable course, not the earlier proposed2–3minute pacing.
- This course builds on visual/menu snapshot 8f371eb. `.superpowers/course-qa.*` is ignored local diagnostics, not the user entry URL.

### 2026-09-21: Trial speed tuning after playtest

- User found the trial run slow. Added a per-level movement profile: running8->10 (+25%), acceleration13->22 (full speed~0.45s), deceleration17->28 (stopping distance~1.8m). Walking4, jump/gravity and Homing tuning are inherited. Hub/tower keep their existing movement defaults.
- The current run clip is calibrated at8units/s, so its playback ratio follows configured run speed (1.25 in the trial) and survives airborne-to-running transitions. Course layout checks now consume the actual trial profile.
- Validation:654 tests/95files, typecheck and production build pass. Browser input traversal completed withrunSpeed10,runRate1.25,8Hominghits,0falls,0errors (~17seconds ideal scripted run). This timing is diagnostic, not a first-time player estimate.

### 2026-09-22: Sword, shield and independent double jump

- Approved controls: Space jumps and allows one extra air jump; J performs a short sword slash on the ground or without an airborne lock, otherwise starts shield Homing. Homing retains crystal bounce/chaining and does not restore the air-jump budget. Landing and checkpoint respawn restore it. Held attack does not repeat. Simultaneous Space/J during coyote time cannot steal the valid shield dash.
- Shared meadow/tower/trial rig carries a receipt-mapped right-hand sword and left-hand shield. Procedural upper-body poses restore the animation baseline each frame, leaving locomotion legs intact; equipped Homing suppresses Flying Kick. The existing airborne clip restarts and takeoff audio plays for the second jump.
- A 0.5s slash flashes nearby frontal crystals once during its active window; this is the current hit receiver, not an enemy/health/combo system. Slash effects and poses follow scene time and are cleaned up on level teardown. Trial control hints use the new keys.
- Browser QA used real keyboard edges: ground and no-target air slash, three jump presses producing exactly one air jump, and complete course with all eight J Homing arrivals, zero falls/errors and visible Stage Clear. Isolated pose inspection uses the ignored local QA page; its diagnostic camera and freeze controls are not shipped.
- Independent spec review caught and verified the coyote simultaneous-input fix; quality review found no correctness blockers. Full tests/typecheck/build passed before the final sword orientation polish; final verification recorded below.
- Final verification after carry/charge polish: 673 tests across 101 files pass; both TypeScript checks and Svelte diagnostics pass (0 errors/warnings); production build passes with the existing large-chunk warning. Actual GLB pose tests check shield chest-relative position and sword clearance. Browser close-up confirms the shield forward and the sword carried down/back; pause/resume freezes then resumes movement, restart resets the timer/checkpoint. Final independent visual-code review found no blockers. Prepared for PR #43 with the playable local preview retained.

### 2026-09-22: White Palace 1-1 in the 3D renderer

- Approved scope: a fixed-side 2.5D adaptation of ProjectAlmost's first stage; current v20 player with sword/shield and independent double jump, 3DModel knights as enemy guards. Main Menu adds White Palace / 試玩 2D 關卡. The original 3D trial and Start flow remain available.
- Pinned source revision `76b9ca1c680e98e27ac9f51871bf4feffb3f0bbc`; imports the current runtime stage, not the older 6400px prototype document. Preserves all 16 platforms, 8 guards, 25 coins, 3 checkpoints, spawn and goal positions, scaled at 50px/world unit. `public/palace/README.md` and `source-receipt.json` record provenance; `tools/palace/import.mjs` reproduces the import without changing either source project.
- Pure side-plane simulation handles solid sides/ceilings/landings, patrol bounds, sword hits, airborne shield Homing, contact damage and knockback, 3 HP and checkpoint respawn. Defeated guards and collected coins persist through death; replay resets everything. Checkpoints activate on the ground; reaching the goal does not require every guard or coin.
- Babylon presentation uses the original palace parallax images and music, solid ivory platforms, animated independent knight clones, shared player/equipment animation, coins and 3D beacons/gate. Movement is constrained to the side plane; this level's collision is the tested domain controller, not Havok. A/D moves, Space jumps/double-jumps, J slashes or performs an airborne locked shield dash, Escape pauses.
- Session owns input, hidden-tab/pause freeze, late-load cleanup, audio preferences, HUD, result stats, replay and menu return. Goal audio survives the completion freeze and is still stopped on teardown. Independent reviews caught additive emissive saturation and completion audio cutoff; both fixes have red/green regression tests. Background vertical orientation and sky coverage were verified visually.
- Final verification: 697 tests across 109 files pass; typecheck has 0 errors/warnings; production build passes with the existing large-chunk warning. Spec review compared the complete stage against the pinned GitHub source and verified all 13 receipt hashes; quality re-review found no actionable issues.
- Browser verification: actual keyboard-driven full traversal reached Stage Clear with 8/8 guards, 18/25 coins, 0 deaths and no captured runtime errors. This scripted route skipped the last grounded checkpoint; the deterministic domain traversal separately covers all three. Isolated QA also confirmed contact damage, checkpoint respawn at x=52 with restored 3 HP and preserved coins, frozen pause state, resume, replay reset and main-menu return. Diagnostic checkpoint placement/fall controls were used only for isolated recovery checks, not the full-route claim. Player skinned sole measured approximately -0.004 world units at a zero-height platform; knight animation and background layering were inspected in-browser.
- Feature prepared on `codex/vrm-player-v20` after commit `44d6b58` for inclusion in PR #43. This is a playable first adaptation, with human difficulty tuning still open. It does not close Issue #7's older HubNPC/Godot integration requirements. `.superpowers/palace-qa.*` remains ignored diagnostics; normal entry is http://127.0.0.1:5183/.

### 2026-09-22: Player mouth seam correction

- Close-up inspection reproduced a color boundary around the rebuilt lip patch; disabling the face outline alone left the color discontinuity. Source geometry has 148 coincident boundary vertex entries with matching normals (minimum dot approximately 0.99999986), while separate skin/lip textures have visible albedo differences. Residual fine lines also came from the lower-face inverted-hull outline.
- Import now adds a local 6mm surface-color blend on both sides of the V20 mouth seam, using nearby skin samples. It retains original images, UVs, material factors, geometry, animation and blink deltas. Runtime keeps these surfaces opaque, carries blend weight through a separate shader varying, and suppresses their internal outline. Hair/armor outlines are preserved. The exact material pair gates this correction for future imports.
- Verification: 699 tests / 110 files pass; final focused material/asset checks pass; typecheck has 0 errors/warnings and production build succeeds with the existing chunk-size warning. Independent source verifier confirms neutral geometry, topology, weights, bind matrices, rest transforms, base factors and all 14 blink primitives unchanged. Browser comparison covered original/corrected front and three-quarter views, side profile and closed eyes. Local changes are not yet committed or pushed; ignored `.superpowers/face-qa.html` provides an A/B close-up preview.


### 2026-09-23: Modeled White Palace and presentation alignment

- Replaced architectural image planes/tile facings with closed beveled decks, filled arch spandrels, grounded piers, balustrades, loggias, windowed towers and domes. Architecture stays in world space, with spatial/material batches; supports extend to a lower district foundation below the fall zone. Slate roofs, brass trim, banners, planters, paving joints and subtle world-space stone grain add scale and detail. Original 16 platform bounds, route, 8 guards, 25 coins, 3 checkpoints and all domain gameplay are unchanged.
- Palace now shares createEnvironment/createAtmosphere with the hub: ACES exposure/contrast, restrained bloom and 4x MSAA; distance haze uses the trial density .0045. Reduced stone IBL response keeps ivory surfaces from losing all shadow contrast while preserving the shared player/steel lighting.
- Palace HUD, pause and results consume the project Light color/font/focus tokens, outlined display headings and white active/focused buttons. Solid minted coins replace torus pickups. Checkpoint activation emits a ground pulse and rising motes, changes the beacon permanently and shows a brief HUD notice; effects use run.elapsed, freeze with pause and reset on replay. Existing activation audio remains.
- Guards previously used Run at .48 regardless of patrol travel. Their imported Idle arm/hand stance now accompanies a measured-rig two-bone leg solve, 1.4m distance-driven stride, planted stance feet and low swing clearance. Asset, patrol speed, player animation and game simulation remain unchanged. Real-GLB tests cover boot support, knees, arm opposition, both directions, independent instances, reset and defeat revival.
- Verification: 716 tests in 112 files passed; typecheck/Svelte diagnostics zero errors/warnings; production build passed with the existing chunk-size warning. Independent spec and quality reviews found no remaining blockers. Browser input traversal reached Stage Clear with 8/8 guards, 18/25 coins, 0 deaths and no captured errors; the fast route jumps over checkpoint triggers, which are covered separately by domain tests and isolated browser activation/respawn checks. Replay, checkpoint reactivation and pause/result styling were checked. Entrance/high-tower/gate views show closed 3D surfaces; a final small planter-support widening was verified separately.
- A visible 1627x1216 entrance sample rendered 241 frames in 4.01s (~60 FPS), with mean scene.render CPU time 5.34ms/max15ms. This is a short local sample, not a whole-stage or minimum-hardware performance guarantee; scene total is about297 meshes/982k vertices including actors and hidden effects. Early background preview FPS readings were throttled and are not representative.
- Changes remain local and uncommitted, alongside the prior mouth-seam correction. Normal entry is http://127.0.0.1:5183/ via White Palace. Ignored .superpowers/palace-qa.* contains diagnostic placement/performance buttons and the keyboard route driver; diagnostic teleports were not used in the full traversal.

### 2026-09-23: Palace stone surface, cloud sky and shadow contrast

- Reused the pinned White Palace sky asset as a background Layer, with centered texture cropping to preserve proportions and the existing gradient as a loading/failure fallback. Buildings remain modeled geometry. Source provenance is recorded in public/palace/README.md.
- Replaced color-only stone grain with shared periodic albedo, tangent-normal and packed roughness maps. Metre-scaled world projection uses one axis per triangle, splitting UV seams while preserving smooth normals; only stone batches pay that vertex cost. A curved-column test at x=154 guards against UV stretching across projection changes.
- Browser shadow on/off and direct-sun comparisons identified excessive environment fill and surface shadow acne. Palace-specific sun4/ambient.08, stone IBL .025, environment .5 retain metal reflections while giving stone clear sunlight/shade separation. Backface shadow rendering removes visible self-shadow striping; bias remains .0001. Shared hub lighting is unchanged.
- Automated verification: 719 tests across113 files pass. Latest type/build and final browser checks are recorded after completion below. Local preview is now http://127.0.0.1:5173/; use White Palace from Main Menu. Changes remain uncommitted alongside the prior model/scene work.
- Final verification: typecheck/Svelte diagnostics report0 errors/warnings; production build passes with the pre-existing chunk-size warning. Browser final settings completed the keyboard-driven route with8/8 guards,18/25 coins and0 deaths, then replay and high-tower views were checked. Shadow on/off comparisons show player and architecture cast shadows; the prior surface striping is absent in the reviewed views. Sky coverage/proportions checked at1280x720 and1000x800, viewport reset, console warnings/errors empty. Diagnostic tab closed; normal5173 preview server remains available.

### 2026-09-26: Palace Homing passage and lower mist

- Homing now selects live forward targets within12 units through solids and bypasses solid movement only during its dash. Sword occlusion and normal movement collisions remain. Hits place the player at the guard surface before bouncing, so an approach through a platform underside cannot leave the player embedded. Timeout/lost-target cancellation inside a solid restores the last clear body position. Air-jump budget is preserved until landing.
- Added world-height material fog (-1.5 to -8.5) and a cloud sea at y=-9. This hides nearby supports and distant foundations even from elevated cameras. The cloud shader drifts on run.elapsed, freezes on pause and resets on replay. A distant opacity fade softens the sky/sea horizon; neither layer changes gameplay collision or shared hub visuals.
- Six new domain cases were observed failing before the collision change and passing after it. Full725 tests/113 files passed, with final focused palace domain/scene25 tests passing after the world-height fog revision. Typecheck/build pass (existing chunk warning). Independent review found a foreground-only mist perspective defect; world-height fog plus depth-occluding sea resolved it. Browser verified an isolated dash from below a platform through its solid to defeat a guard and safely land, with no runtime errors. Mist readiness and pause clock were checked.
- These changes are local follow-up work after90259b6. Preview: http://127.0.0.1:5173/ -> White Palace. Ignored diagnostic controls are not shipped.
- Final browser route after widening the ignored input driver's key pulse to80ms completed with8/8 guards,17/25 coins and0 deaths. The earlier35ms driver missed jumps in this browser and repeatedly respawned; no gameplay tuning was made to obtain the final result. The pure fixed-step input route also passes with0 deaths and all3 checkpoints. Final entrance/high-tower views show hidden distant bases and a softened sea/sky horizon; pause, replay and shader console were checked. No captured warnings/errors. Final typecheck/Svelte diagnostics and build passed; diagnostic tab closed,5173 server remains running.

### 2026-09-26: Airborne checkpoint activation

- White Palace checkpoints activate when the player passes within1.4 units horizontally and feet are between-.15 and4 units above the beacon platform; grounding is no longer required. Ordinary jumps and Homing passes activate the existing pulse/audio/HUD notice. Higher flyovers and approaches below the floor stay outside the trigger. Respawn still uses the authored safe platform coordinates, and earlier checkpoints cannot replace later progress.
- Added8 focused cases covering ground/air height, horizontal/vertical exclusion, fast Homing, latest-checkpoint persistence, safe respawn and replay reset. Four cases failed under the previous grounded-only condition, then all8 passed with the new volume. Existing palace combat/route tests also passed.
- Final verification:733 tests across114 files passed; typecheck/Svelte0 errors/warnings and production build passed (existing chunk warning). Browser diagnostic placement confirmed activation at y≈2.22 with grounded=false and the checkpoint notice visible, then falling returned the player to x52/y0 with3 HP and the checkpoint retained. No captured browser warnings/errors. Local preview remains5173; this change is not pushed yet.

### 2026-10-01: PR #43 merge preparation

- Include the Homing-through-solids, height mist/cloud sea and airborne checkpoint follow-ups in PR #43.
- Address earlier review feedback: both trial sessions discard the first engine frame after resume/restart and rebase the animation clock on that frame, so hidden-tab time cannot advance simulation or animation. WebP alpha checks now run independently of ffmpeg; WebM checks retain the dependency guard.
- Final validation: 740 tests across 114 files passed; TypeScript and Svelte diagnostics report zero errors/warnings; production build passed with the existing chunk-size warning. Independent review found no correctness blockers in the gameplay/visual changes or the pause/portrait follow-ups. Prior browser traversal and visual checks are recorded above.


## 2026-10-10 — Light stage results and restored ProjectAlmost ranks

Both CourseHud and PalaceHud now mount the shared `StageResults.svelte`: diagonal light surfaces, serif STAGE CLEAR, actual rank/stat/checklist display, animated MenuPortrait, score breakdown, Retry and Continue. Existing gameplay stays frozen under the overlay. Results preserve the preferred region-return focus, Tab/arrow cycling and one-shot 320 ms exit callbacks; reduced motion skips the delay. Preview uses `.superpowers/stage-result-qa.html` (Palace) or `?mode=course`, with illustrative city background and fixture scores; production retains the frozen gameplay scene.

User correctly identified the original rank system in ProjectAlmost. Rules verified from `src/domain/gameplay/stageResult.ts` and first-stage times in `gameplayStageSources.ts` at revision `76b9ca1c680e98e27ac9f51871bf4feffb3f0bbc`. Shared `stageScore.ts` retains base 300, time 300/240/170/100 then decay 3/sec, coins 200, enemies 150, checkpoints 50, damage -80, falls -180; ranks S/A/B/C at 850/700/550/400, otherwise D. Original zero-target categories grant full optional points (the Course breakdown explicitly labels that base credit). Palace times are 30/42/58/78 seconds; Course provisional times 45/65/90/120 remain a playtest tuning item.

PalaceRun now records damageTaken, falls and actually reached beacon indices independently from deaths and latest respawn checkpoint. Counts survive respawn and reset for retry. Inventory rewards and best-record persistence are not implemented; no fabricated NEW RECORD or reward items. ProjectAlmost runtime result UI has ranks/statistics, with older prototype best-record progression but no item grant surface found in the inspected result modules.

Validation: 67 tests across 11 affected domain/UI/session suites passed, production build passed (existing large-chunk warning); desktop and 390 px responsive result previews inspected, retry/return callbacks checked, browser console had no errors. Source typecheck/Svelte diagnostics passed.


## 2026-10-10 — Loading design after results

RegionSession now uses `LoadingPage` (existing FrontDoorArtwork loading pose + LoadingScreen composition) when returning from expedition results, entering expeditions, or retrying a failed load. LoadingScreen accepts destination-specific status copy. Initial App startup retains its existing loading page; the region wrapper only appears after the first ready event to avoid duplicate portrait renderers. Readiness/failure callbacks still control removal, and immediate in-memory stage retry remains unchanged.

Validation: 23 region/front-door/portrait tests passed, including deferred world readiness after result return and blocked world interaction while loading. Typecheck/Svelte diagnostics and build passed (existing bundle-size warning). Browser preview `.superpowers/loading-return-qa.html` verified the 3D closeup, city backdrop, white angled panels and loading bar, with no console errors.


## 2026-10-10 — Knight-New-V33 player update

Imported ProjectVtuber `projects/vrm-model/output/current/new-vtuber-v33/knight_new_vrm1.vrm`, the latest knight outfit release (streetwear-v06 is a separate costume series). Original source SHA-256 `22b71efb9e8d5955bf492cd5be8f451e48a003f783e9fbcc38c681dc641967bf`; source unmodified. Stable player-v20 filenames remain for compatibility; receipt hash automatically invalidates caches for gameplay, title/loading and results portraits. Full provenance/settings live in the receipt and tools/player-model/README.md.

V33 authored soft-cheek/lip textures supersede the exact-name V20 vertex-color seam correction. Import metadata now marks repaired face, lip, eyelid-skin and jaw-skin patches with suppressOutline, preventing the renderer from drawing dark internal material borders without changing source MToon parameters or recoloring textures. Hair/armor outlines remain. Legacy seam regression now uses a small synthetic boundary fixture; a separate active-asset test protects the V33 authored texture path.

Independent verifier passed neutral geometry, bind transforms, skinning, weighted blink deltas for all 15 participating primitives and checksum. Five donor clips, relaxed stance/fingers and equipment mappings retained. 67 focused tests passed. Browser checked Loading closeup, authored face open/closed eyes and menu; all use the existing portrait painterly treatment. AVG video and HUD static portrait remain separate media.


## Stage clear typography refinement (2026-10-10)

User clarified that the STAGE CLEAR lettering felt plain and requested slightly heavier result-screen text. Kept the current layout, portrait, rank and transitions. StageResults uses a local SVG wordmark with optically spaced, slanted serif outlines derived from the existing OFL Rondo Chapter Serif 600, finished in navy with a localized ice-blue highlight. Accessible heading text remains available. Increased body/stat/checklist and number weights to 700; existing serif headings remain 600. No new font dependency.

Validation: 7 result/HUD tests pass; typecheck reports zero errors/warnings; desktop and 390px-wide preview visually checked.


## Keyboard/mouse, controller and touch input (2026-10-10)

Owner approved the complete existing game flow on all three input methods, with remapping/custom touch positions deferred. `presentation/input/deviceInput.ts` holds device identity, standard-gamepad sampling, radial dead zones, edge-triggered jump/attack, neutral rearm across gameplay suspension and captured touch state. Existing `createInput` adapters register enabled gameplay owners; shared camera consumes right-stick/touch look, and mouse-left attacks only the owning canvas (3D requires pointer lock first). InputLayer mounts one runtime in App, switches hints and shows touch controls while touch gameplay is active. Controller disconnect pauses active controller play; blur/hidden clears actions and requires neutral. UI navigation works on visible top scopes and real controls, with A/× confirm, B/○ back, shoulders for traversal, directional range/select changes, right-stick map pan/log or settings scrolling, triggers map zoom. Touch retains native clickable menus, map drag and zoom controls. Settings → Controls documents defaults. Standard-mapped controllers only; no remapping or rumble in this change.

Input tests: 94 pass across 19 suites, including real settings modal routing, disconnect, blur, multi-pointer jump while moving, mouse-lock attack and camera look. Typecheck/build passed. Browser checked virtual-stick movement in the real palace, pause/resume and 844x390 landscape UI using ignored `.superpowers/input-qa.html` and `input-landscape.html` fixtures. These previews intentionally force touch presentation, not hardware emulation. Physical controller compatibility and actual mobile multitouch feel are not hardware-verified. Browser autoplay/fullscreen policies remain browser-controlled.

`docs/audio/bgm-prompts.txt` contains 13 standalone House-family prompts: four regional exploration moods, 3D/2D expeditions, three AVG moods, results loop, clear/retry stingers and a future combat variant. Includes priorities, reuse guidance for overlays/loading, and honest loop/reference limitations. No new audio files were generated or wired. Work remains uncommitted.


### 2026-10-10 — 潮光街道 BGM

- User-approved Harmonie Douce loop shipped as `public/audio/music/town_tideglow.ogg`.
- Dedicated `music.town` decoded-buffer cue (76.8205 s), using the existing music volume/settings bus.
- Town preview starts this cue; the connected region changes between town and existing meadow music
  at the south gate, with a 4 m hysteresis band and the existing 1.5 s crossfade.
- Other level tracks and title music are unchanged. Loop provenance: `docs/audio/town-tideglow-loop.json`.


### 2026-10-10 — 白潮原野・順風而行 BGM

- `Open Groove.mp3` looped and imported as `public/audio/music/meadow_tailwind.ogg`.
- 120.009 s / 5,760,432 stereo samples at 48 kHz; 7.5 s phrase overlap baked in.
- Dedicated `music.meadow` decoded-buffer cue uses the existing music volume bus at 0.5.
- `regionMusicScene` now returns `meadow` outside town; existing gate hysteresis and 1.5 s
  crossfades remain. Town, title and expedition cues stay separate.
- Until additional coastal/ridge BGM arrives, the connected region's non-town areas share this track.
- Provenance and edit settings: `docs/audio/meadow-tailwind-loop.json`.


### 2026-10-10 — 原野循環接點修訂 v2

- Owner reported the Open Groove seam sounded odd. The v1 overlap mixed an intro section
  with a full-drum later section for 7.5 s, with mismatched local beat timing.
- Replaced `meadow_tailwind.ogg` with v2: 119.5786667 s / 5,739,776 frames at 48 kHz.
- Matching kick positions near 36.18 / 155.76 s, with only 160 ms of overlap before the kick.
  Decoded-loop kick intervals around the seam remain around one beat (0.46–0.48 s).
- Original v1 remains in the local audio deliverables folder for comparison. Routing and volume unchanged.
- Updated recipe JSON and credits; final musical preference awaits owner listening.


### 2026-10-10 — 原野循環接點修訂 v3

- Owner found v2 close but could still hear the edit. Measured a sustained-instrument
  level/timbre change around its short splice.
- Keep beat alignment; separate sustained and transient components locally with a shared
  stereo HPSS mask. Harmonics overlap 1.88 s; percussion remains 160 ms. Incoming harmonic
  level compensation is +1.8772 dB, released over 6 s. Rest of the source is untouched.
- Shipped loop remains 119.5786667 s / 5,739,776 frames, same cue/routing/volume.
- v3 recipe replaces `docs/audio/meadow-tailwind-loop.json`; v1/v2 kept in local deliverables.
- Sample count, clipping and file serving verified. Musical acceptance still needs owner listening.


## White-palace course and knight guards (2026-10-10)

The existing 3D course is now 白宮天廊: authored collision rectangles, jump gaps and crystal chains stay unchanged, with palace PBR terraces, cornices, side arcades, blue banners, checkpoint monuments, distant towers and a low rolling cloud sea. `courseScenery` exposes an update callback for the cloud shader; merged material batches limit draw calls. `courseCombat.ts` owns ten platform-bounded patrol guards with a 0.65s telegraph, committed strike, recovery, one-hit sword/Homing defeat, shared 2.6m warning radius, player 3-health and invulnerability. `courseGuards.ts` instantiates the existing palace knight GLB and reuses its grounded gait; attack arm rotation is applied in the measured world frame. Stable extra target indices extend the existing crystal target adapter, immediately excluding defeated guards. CourseSession recovers at the last checkpoint on death, preserves defeated/damage totals across recovery, fully resets on retry and freezes simulation while paused. Results show real guard kills and damage and include combat in scoring; bypassing guards remains valid.

The course portal and beacon moved from the outdoor ruin to white tower square west (-20,43), with safe return (-20,1.3,40). Physical white-stone portal, objective/story/menu names, map markers, return action, and narrowly scoped old-entrance save migration agree. The grass signal still unlocks this expedition. Old `course` / dialogue IDs stay stable. Existing atlas raster remains from the earlier bake; dynamic markers are current.

Validation: 100 tests across 13 suites, clean typecheck, production build (only existing chunk-size warning). Browser verified sword/Homing defeat, three-hit checkpoint recovery, patrol/attack poses, full traversal (7 jumps / 8 crystal bounces / zero retries or damage), results/retry, and actual city entrance clearance. Local isolated playable preview: /.superpowers/stage-play-qa.html?mode=course. No save writes in that preview. No commit or PR requested. Existing course BGM retained pending the user's town-theme Hardcore remix.
