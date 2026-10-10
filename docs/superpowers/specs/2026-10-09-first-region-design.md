# First Region: White-Tide Fields

Authorized by the user on 2026-10-09 for autonomous implementation while they sleep. Build a playable first-region prototype using available assets; no new user-generated models required. Reference open-world action RPGs for connected exploration and destinations, not their characters or lore.

## Playable scope
A continuous White Palace town-to-meadow scene, coastal overlook, western ridge and southern watch landmark. Town assets retain coordinates and original quality. South gate opens onto outdoor paths. Two contextual entrances load existing 3D Ruins Road and the ProjectAlmost-derived 2.5D palace corridor; results return to the first region instead of the main menu.

Chapter one, 潮聲未到的午後, centres on 悠太翼 noticing a repeated obsolete waterway closure signal. Five AVG scenes connect arrival, meadow investigation, restored high relay, cleared palace aqueduct and town homecoming. 港務記錄員・澄音 is a provisional offscreen voice through an echo pipe; only 悠太翼 uses the existing protagonist portrait. No permanent protagonist biography is invented.

## Flow
Menu Start enters/continues first region. Arrival dialogue -> field signal -> 3D relay expedition -> relay report -> town seafront aqueduct expedition -> water report -> tower plaza homecoming -> continued free exploration. Explicit E interactions avoid accidental transitions. Abandoning/restarting a stage never completes it. Actual stage finish saves progress, keeps results, and return triggers the corresponding dialogue. Completed stages can be replayed.

A Light-style objective HUD, tracked destination distance, region map/journal, three optional discoverable views, pause and return-to-gate recovery make the region navigable. Versioned local progress survives menu/reload; malformed/unavailable storage falls back safely. Progress is independent of disposable rendering scenes. Save warning is shown if browser storage fails. Travel within town and outdoors is continuous; expeditions have visible loading transitions. No NPC shops, inventory, combat encounters in the open field, or additional stages are promised by this slice.

## Verification
Pure progression/saving/interaction tests, valid and terminating story graphs, meaningful component tests for load/failure/unmount/pause/input/completion. Test exploration, town seam, map, dialogue, expedition entry/exit, actual completion delivery, reload and recovery. Full existing suite, typecheck, build and independent spec/quality reviews. Save screenshots of region and AVG. Keep local test server running, preserve previous uncommitted work; no publication requested.
