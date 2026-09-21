# Meadow visual refresh

User-approved direction: fresh Japanese animation styling. Reduce noisy grass and ground detail; use coherent sage/lime grass, clustered flowers, open paths, rounded foliage, blue layered hills and soft clouds. Keep the current player, AVG, gameplay, field height/collision, pond, portal and crystal placements working.

Architecture: a shared pure meadowLayout module supplies decorative path distance and vegetation patch values. Terrain gets vertex colour fields and three smooth backdrop ranges without changing its playable vertices. Scatter uses the shared field and solid curved grass ribbons with upward-biased normals; flowers use two-sided alpha cards. Trees gain soft clustered canopies while preserving trunk placement/collision. Crowns cast ground shadows without receiving their own overlapping-lobe shadows. The pond gains a quiet stationary colour texture beneath animated normal ripples. Sky/lighting/cloud changes are hub-only (tower owns its environment).

No new network asset dependency. Keep thin instancing and bounded deterministic placement; avoid bloom-heavy haze or expensive post effects. Check the actual running game at spawn, pond, plaza and slopes, plus movement and tower transition. Run full tests, typecheck and build. Changes remain in the existing uncommitted model-preview branch.

## User-directed revision: natural JRPG (2026-09-20)

User found the first pass too cartoon-like and explicitly chose a semi-realistic Japanese RPG meadow. Supersedes the rounded balloon crowns / broad painted blocks / puffy cartoon cloud emphasis above. Preserve trail layout, player and gameplay. Replace crowns with irregular leafy branch canopies, add restrained terrain microdetail, vary grass and ground colours naturally, soften/break cloud shapes, and reduce poster-like hillside bands. Reuse local assets/procedural detail; no new external dependency. Review actual play view and pond/plaza again. Keep change reversible in the same worktree.