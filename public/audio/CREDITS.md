# Audio credits

The original shipped set is derived from a source supplied from outside this repo, by
`tools/audio/preprocess.mjs`. Its terms are not derivable from the file, so **the Source and Licence
columns have to be filled in by whoever supplied it.** Do that before any public release; see
`docs/superpowers/specs/2026-09-05-audio-system-design.md` §10.

The source files themselves are deliberately not committed: they are raw takes, several of them
containing material that is cut away (the typing source alone holds 18 ticks, of which four ship),
and the recipe in `tools/audio/preprocess.mjs` is what makes the shipped set reproducible from them.
Keep them wherever the originals live, and pass that directory to the tool.

| Shipped | Source file | Source / author | Licence |
| --- | --- | --- | --- |
| `music/hub_theme.mp3` | `白い通り角.mp3` | *(to fill in)* | *(to fill in)* |
| `music/avg_theme.mp3` | `AVGBG.mp3` | *(to fill in)* | *(to fill in)* |
| `sfx/armor_step.ogg` | `armor-step.wav` | *(to fill in)* | *(to fill in)* |
| `sfx/footstep_grass_01.ogg`, `_02.ogg` | `Third-person_game_gr_#1-1788552338814.wav` | *(to fill in)* | *(to fill in)* |
| `sfx/ui_type_01.ogg` … `_04.ogg` | `AVG_visual_novel_typ_#4-1788552426866.wav` | *(to fill in)* | *(to fill in)* |
| `sfx/ui_move.ogg` | `AVG_visual_novel_opt_#2-1788552556980.wav` | *(to fill in)* | *(to fill in)* |
| `sfx/ui_confirm.ogg` | `AVG_visual_novel_opt_#4-1788552473204.wav` | *(to fill in)* | *(to fill in)* |
| `ambience/wind_field.ogg` *(shipped, not wired — see the design spec §5.3a)* | `Open_grassland_wind__#2-1788553077631.wav` | *(to fill in)* | *(to fill in)* |
| `ambience/water_pond.ogg` *(shipped, not wired)* | `Natural_stream_water_#3-1788553102614.wav` | *(to fill in)* | *(to fill in)* |

## Title / main-menu theme

| Shipped | Source file | Source / author | Licence |
| --- | --- | --- | --- |
| `music/title_theme.ogg` | `Bittersweet Groove.mp3` | Supplied by the project owner; author to be recorded | *(to fill in)* |

Uses the owner-approved **Smooth Phrase Loop v4** edit (2026-10-09), separate from
`preprocess.mjs`: stereo 48 kHz, 7,678,464 samples / 159.968 seconds, with level
balancing and a 1.845-second phrase crossfade baked in. Playback loops the entire
decoded buffer; do not add another crossfade at runtime.
Original source SHA-256: `bc02fb42afa83c8b982dd9901521861ed833430d63fc3dcd964cbd85104c6ebc`.

## White Palace / Tideglow Street

| Shipped | Source file | Source / author | Licence |
| --- | --- | --- | --- |
| `music/town_tideglow.ogg` | `Harmonie Douce.mp3` | Supplied and approved by the project owner; author to be recorded | *(to fill in)* |

Owner-approved loop (2026-10-10): stereo 48 kHz, 3,687,384 samples / 76.8205 seconds.
A 3.84-second correlation-compensated phrase overlap is baked in; there is no extra
runtime fade at the loop boundary. The sound bank decodes this cue rather than
streaming it, and loops the complete buffer. Zone changes use the existing 1.5-second
crossfade. The town preview and the region's town area use this cue; the meadow and
expeditions retain their existing music. Processing measurements and source SHA-256
are recorded in `docs/audio/town-tideglow-loop.json`. `preprocess.mjs` does not overwrite it.

## White Tide Meadow / With the Tailwind

| Shipped | Source file | Source / author | Licence |
| --- | --- | --- | --- |
| `music/meadow_tailwind.ogg` | `Open Groove.mp3` | Supplied by the project owner; author to be recorded | *(to fill in)* |

Loop edit v3 (2026-10-10): stereo 48 kHz, 5,739,776 samples / 119.5786667 seconds.
Retains v2's beat alignment (source 36.14 / 155.7186667 s), following feedback that
its splice was close but still noticeable. A shared stereo harmonic/percussive mask
extends sustained-instrument tails across 1.88 s while keeping transient overlap at
0.16 s. Incoming harmonics are matched by +1.8772 dB at the join, releasing to the
original level over 6 s; the rest of the source remains unchanged. No extra runtime
loop fade. The connected region outside town uses `music.meadow`; town music remains
Harmonie Douce and expeditions keep their cues. Zone changes retain the 1.5 s crossfade.
Measurements and source SHA-256: `docs/audio/meadow-tailwind-loop.json`.
This asset is independent of `preprocess.mjs`.

## 2D palace and 3D course stages

| Shipped | Source file | Source / author | Licence |
| --- | --- | --- | --- |
| `music/palace_arcade.ogg` | `Arcade Beat.mp3` | Supplied by the project owner; author to be recorded | *(to fill in)* |
| `music/course_cathartic.ogg` | `Cathartic Release.mp3` | Supplied by the project owner; author to be recorded | *(to fill in)* |

Loop edits v1 (2026-10-10), stereo 48 kHz Vorbis quality 7. Palace uses a
61.053-second phrase (source 46.99–108.043 s); course uses 116.1171667 seconds
(source 52.5–168.6171667 s). Approximate repeated phrase lengths are 32 and 64 bars;
these are inferred from the audio rather than an authored tempo map. No time
stretch or global attenuation is applied. Stereo-linked harmonic/percussive
separation preserves attacks, with harmonic bridges of 0.72 / 0.90 s and
percussive overlaps of 0.060 / 0.055 s. Small incoming harmonic level corrections
return to the original mix over four seconds. All other samples retain the source.

Both loop complete decoded buffers; the palace retains its original sound effects.
Measurements, source hashes and the explicit listening limitation are in
`docs/audio/palace-arcade-loop.json` and `docs/audio/course-cathartic-loop.json`.
Rebuild with `python tools/audio/build-stage-loops.py --source-dir <originals>
--output-dir <output>` (FFmpeg, NumPy, SciPy and SoundFile required). The output
includes full WAV/OGG loops and 38-second WAV/MP3 auditions: edits at 6 and 19 s,
actual decoded buffer wrap at 32 s; one-second silences separate the excerpts.
These assets are independent of `preprocess.mjs`.

## ProjectAlmost effects and result theme (2026-10-10)

Imported verbatim from `YuutaTsubasa/ProjectAlmost` revision
`76b9ca1c680e98e27ac9f51871bf4feffb3f0bbc`, following its runtime registry
`src/domain/audio/audioAssets.ts`. Original files and SHA-256 receipts are in
`public/audio/sfx/` (effects) and `public/audio/music/` (music). Provenance:
`docs/audio/project-almost-import.json`; rebuild with `node tools/audio/import-project-almost.mjs`.
The earlier palace imports remain preserved. This import does not replace any approved
ProjectRondo title, town, meadow or stage BGM.

| Original file | Active use |
| --- | --- |
| `music/result_original.mp3` | Preserved original import; superseded by the requested Victoire result loop below |
| `armor-step.wav` | Armour footfalls and existing takeoff/landing cues; palace jump/landing added |
| `coin.wav` | Palace coin collection |
| `hit.wav` | Player damage and actual sword/Homing guard impacts in both stages; course crystal impacts |
| `death.wav` | Palace death; course fall/death respawn |
| `checkpoint.wav` | Newly activated checkpoints in either stage |
| `goal.wav` | Stage clear once; allowed to finish after gameplay freezes |
| `ui-move.wav` | Focus changes in stage pause/results; existing dialogue choices |
| `ui-confirm.wav` | Stage pause/result button activation; existing dialogue selection |
| `ui-back.wav` | Stage Escape action |

There are no dedicated jump, sword-swing or Homing-launch files in this source registry.
The jump sounds retain ProjectRondo's armour movement convention (+12% takeoff,
-12% landing playback rate); impact feedback follows actual hits, not every attack input.
No course coin event is added. Effects respect master/SFX/mute; result music respects
master/music/mute. Replay disposes result music, and scene disposal releases both players,
media elements, preference subscription and input listeners. The original result MP3 remains preserved for the import receipt, but is no longer an active cue.

## Shared stage result theme — Victoire Éclatante (2026-10-10)

| Shipped | Source file | Source / author | Licence |
| --- | --- | --- | --- |
| `music/result_victoire.ogg` | `Victoire Éclatante.mp3` | Supplied by the project owner; author to be recorded | *(to fill in)* |

Replaces ProjectAlmost's result music for both stages, retaining all imported effects.
Stereo 48 kHz, 1,413,808 decoded frames / 29.4543333 seconds; phrase alignment at
source 27.550–57.0043333 s (approximately 16 bars at 130.37 BPM). Harmonic tails
bridge 0.92 s, with a separate 0.055 s percussive handoff finishing before the
incoming attack. Incoming harmonics receive +0.4273 dB at the join, returning to
unity over four seconds. No time stretch or global attenuation. Vorbis quality 7,
complete decoded-buffer loop, with no added runtime fade at each wrap.

The measured decoded true peak is -5.1924 dBFS; decoded frame count matches the
master. Source hash and further measurements: `docs/audio/result-victoire-loop.json`.
Rebuild with `python tools/audio/build-stage-loops.py --source-dir <originals>
--output-dir <output> --only victoire`. Full WAV/OGG and a continuous two-cycle audition are produced. The preview
contains no silent separators; edited joins occur at 6 / 35.4543 s.
Signal analysis was verified; no subjective listening approval is claimed.

## Sword swing variants (2026-10-10)

`sfx/sword/swipe-01.wav` through `swipe-08.wav` are extracted from the owner-supplied
`Swipe_the_sword_#2-1791646738806.mp3`. Author/licence details remain to be recorded.
Eight isolated takes, 48 kHz stereo PCM16, silence-trimmed with 2 ms entry and 10 ms
tail fades and approximately -3 dBTP peak headroom. No pitch or time stretching.
Reproduce with `python tools/audio/build-sword-samples.py <source.mp3>`.
Source SHA-256, exact cuts and gains: `docs/audio/sword-samples.json`.
