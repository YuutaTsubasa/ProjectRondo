# Audio credits

Every shipped file here is derived from a source supplied from outside this repo, by
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
