# White Palace adventures — approved scope

User approved the five proposed city tasks and added a sixth: four remaining ProjectAlmost non-boss palace levels, four harder original 3D courses, and coins in 3D. User then authorized continued work until complete, followed by evidence-driven polish until they report waking up. No deadline and no automatic PR merge.

## Deliverables
1. Connected market, residential quarter, palace forecourt and coastal belvedere with shortcuts and shared render/collision surfaces.
2. One polished market street using existing models and batched stone/wood/cloth props; no generated models required.
3. Optional four-stop city exploration story led by 悠太翼, preserving the existing main chapter and its saves. A separate small save records city stops; no compulsory replay or fabricated branching impact.
4. Collision/camera/route and rendering budget checks, with physical Android performance explicitly unverified unless tested on device.
5. Independent PR, muted preview captures and prioritized modular Tripo model requests.
6. Import pinned ProjectAlmost 1-2..1-5 (exclude boss1-6), faithfully preserve platforms/coins/checkpoints and airborne azure-core traversal. Add four different, moderately harder 3D palace courses with coins, guards, checkpoints, scoring, retry and per-stage best times. Original stages remain compatible.

## Architecture and decisions
Use explicit stage definitions passed through existing sessions, domain simulation, scene builders and HUD/results. Keep original ids course/palace and main quest progression unchanged; new stage ids never advance the original story. Add a shared stage catalog for portals, EXTRA selection and records. Old stage-record v1 saves retain original keys and gain independently validated new keys.

City side story is optional and available at authored city stops, with context guidance after the main chapter completes; exploration completion only advances when the matching AVG finishes. Intro/map/pause navigation retains existing transitions and controller focus behavior. Reuse current HUD, loading, sounds and BGM by stage family.

## Quality boundaries
Do not add new combat abilities, BOSS, inventory economy, external models, new visual direction or unrelated systems. Coins persist through checkpoint respawn and reset on full retry. Map/story/intro pause gameplay. Scene disposal removes observers and input ownership. All new paths have finite geometry, grounded spawn/checkpoints, conservative jump budgets and facing-aware Homing links. Gold coins are minted discs, not rings.
