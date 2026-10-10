# Coastal town street and plaza preview

Approved in conversation: use the supplied White Palace tower, townhouse and shop to build a small walkable street and plaza, then judge scale and atmosphere before commissioning more buildings. Original 2D White Palace style remains the reference: ivory stone, pale blue roofs, restrained gold, airy coastal setting.

Main-menu entry: White Palace Town / 白色王城. A straight residential street opens onto a plaza with a tower landmark and a seafront promenade. Reuse the existing player, camera, movement, shadows and atmosphere. Include visible paving, planters, street lamps, benches, sea and distant hills; keep traversal readable. This preview contains no NPC quests, shops UI, interiors or seamless links to existing levels.

Imported assets are derived from the user's three ZIP exports. Retain source hashes and reproducible conversion; use embedded PBR textures capped at 2048px. Keep authored copies separate from the original Downloads. Known generation seams are documented. Use authored simple solid collision volumes instead of raw imported triangle collision. Buildings are closed exterior scenery; an unobtrusive inner backing can prevent seams from showing sky, but do not claim topology repaired. Place models using measured world bounds and normalize base/height.

Town session provides a Light-style location HUD, movement hints, pause/resume, return to entrance, and return to main menu. Hidden page pauses; resume discards the stale frame and resets animation time. Loading failure is recoverable; exiting during loading safely disposes the pending scene. Sea falls or leaving the sample bounds return to the entrance. Repeated buildings share geometry and materials.

Verification: menu and session regression tests; model bounds/UV/PBR/source integrity; layout clearance and safe spawn/recovery; browser entry, character-relative scale, collision, street-to-plaza walk, sea boundary, pause/restart/menu return, and multiple lighting views. Full tests, typecheck and production build before handoff. No push/PR is requested in this turn.
