# 第一章：潮聲未到的午後

This is provisional first-region story content for the user-authorized autonomous prototype. The protagonist's established name is 悠太翼. Existing project content establishes the bright coastal 白色王城 and 白色宮殿・蒼穹迴廊, but no substantive biography or world history. This chapter does not assign the protagonist ancestry, lost memories, allegiances, or supernatural destiny.

澄音 is a provisional port records clerk. She remains offscreen at the port throughout; the speaker label is 澄音（回聲管）. Existing city echo pipes connect the town posts, grassland station and palace maintenance route. The existing protagonist portrait belongs only to 悠太翼; the presentation layer hides it for remote speech rather than presenting an unavailable NPC asset.

## Playable arc

The town waterway has stopped. Ships cannot enter the port, unloading stalls, and the market's ice is melting. 悠太翼 notices that the grassland signal repeats independently of the wind. A stale closure order is still circulating because the ruined relay cannot receive a replacement. Reconnecting the relay restores communication, but the final aqueduct gate must be opened from inside. Completing both traversal routes restores port access and earns a personal welcome from the city.

| Encounter | Physical context and trigger | Result after dialogue ends |
| --- | --- | --- |
| town_arrival | First arrival; remote voice from the town echo post | Investigate the grassland station |
| meadow_signal | Reach the grassland station and hear the closure pattern | The 3D relay expedition becomes available |
| ruin_relay | Complete the actual 3D course goal, then return to the outdoor relay marker | Travel back to the town seafront palace entrance at (33, -20) |
| aqueduct_open | Complete the actual 2D palace goal at the aqueduct's final gate | Return to the tower plaza echo post |
| town_return | Reach the tower plaza echo post at (-6, 33) with the aqueduct restored | Chapter completes; 澄音 speaks from the port |

The 3D ruins and 2D side-view aqueduct are routes through one region's water infrastructure. The 3D course is an enemy-free broken bridge and stone-platform route, marked by its existing crystals. The aqueduct entrance is in town, not directly below the outdoor relay marker. The later 2D stage's end goal represents operating the final gate; the chapter does not require killing every guard or collecting every pickup. Only the 2D aqueduct's existing guards follow the closure command and obstruct entry, without requiring new enemy models.

The homecoming choice lets the player describe 悠太翼 as a passing traveler or someone who will return to see the sea. Both responses converge on the same welcome and chapter state. Neither adds a permanent biography or a hidden reward. The immediate problem resolves; the source of the newly repeating old command remains an optional future story thread.

## Content and state contract

Five sources live in src/content/dialogue/region. Each contains 10–18 spoken nodes, uses the existing dialogue DSL, and has a reachable terminating graph. src/content/regionStory.ts exports RegionStoryId and regionStories, with a title and compiled graph per encounter. Any parser diagnostic throws an error naming the source, rather than silently running a broken script.

The pure domain lives in src/domain/region/regionProgress.ts. Its version-1 state contains chapter, discoveries, and completedExpeditions. Chapters follow this sequence:

arrival → signal → relay → relay-report → aqueduct → aqueduct-report → homecoming → complete

finishRegionDialogue advances only the matching current encounter. completeRegionExpedition advances relay/course to relay-report and aqueduct/palace to aqueduct-report. Both return the original state for irrelevant or repeated events. Only actual stage goal completion may call completeRegionExpedition; leaving, death, reset, or merely loading a stage cannot qualify.

canEnterRegionExpedition permits the currently required expedition and previously completed expeditions for replay. Replays cannot regress or advance the chapter. discoverRegionSite accepts only ridge, cove, and watch, deduplicates them, and never advances the main story.

parseRegionProgress validates untrusted JSON before accepting it. Version, chapter, array element types, whitelists, uniqueness, and stage/chapter consistency must all hold. Arrival through relay requires no completed expeditions; relay-report and aqueduct require course; aqueduct-report through complete require course and palace. Invalid or unsupported saves safely return a new arrival state. The app serializes this plain data with JSON.stringify.

## Presentation integration

Use a fresh keyed DialogueOverlay/createDialogueSession for each encounter. Suspend gameplay input while speaking and make conflicting HUD actions inert. Commit the transition from onFinished, including when SKIP legitimately reaches the end. SKIP stops at choices. Keep chapter state outside disposable scenes and guard asynchronous load/exit callbacks. Resume with reset animation timing and restore focus to gameplay. Optional exploration sites remain supplementary and cannot replace expedition goals.

## Verification

The progression tests exercise the complete path, locked and replayed expeditions, early/repeated dialogue events, discovery deduplication, every valid chapter round-trip, malformed saves, unsupported versions, unknown identifiers and inconsistent completion flags. Content tests compile all five actual raw-imported scripts, check graph validity and character labels, traverse every branch to termination, and verify choice convergence.

Focused verification: 40 tests passed across tests/domain/regionProgress.test.ts and tests/content/regionStory.test.ts. Integration and visual verification belong to the region session implementation.
