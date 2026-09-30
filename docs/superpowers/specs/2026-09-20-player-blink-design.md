# Automatic player blinking design

Approved by the user on 2026-09-20 after proposing random 3-6 second intervals with faster closing
and slower opening. Applies to the V20 3D player shared by grassland and tower; AVG unchanged.

Retain only the original VRM preset `blink` morph-target binds, including face, lashes, irises,
sclera and any other participating pieces. Bake weighted binds into a single `playerBlink` morph
per affected primitive so runtime can synchronously close the full eye without full VRM support.
Neutral geometry, skeleton and five existing skeletal animations remain unchanged. Fail import
clearly for absent or unsupported blink data. Record the policy in the generated receipt.

Use a pure time-based blink envelope: open for random 3-6 seconds, close over80ms, hold30ms,
open over140ms. Smooth interpolation. Drive only blink morph influences on the scene animation
loop, independently of skeletal clips. Suspend time while document hidden and cap unusually long
deltas so tab return does not skip through many blinks. Detach the observer and reopen eyes on
character release; scene teardown must also clean it up.

Validate import targets and neutral geometry, timing transitions with deterministic random input,
shared target application and teardown. Inspect both fully open and fully closed eyes plus live
blinks in the browser, and recheck running/scene transitions. Check asset size and build/typecheck.
