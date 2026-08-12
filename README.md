# ProjectRondo

A 3D action game built in **Godot 4.7.1 (mono / C#)**. A hub world hosts NPCs that lead into
Sonic-style 3D levels, Sonic-style 2D levels, and puzzle games (Sudoku, 2048).

Engineering approach: **TDD + DDD + Functional + Reactive**.

## Solution layout

| Path | Purpose |
| --- | --- |
| `ProjectRondo.csproj` / `project.godot` | Godot game (presentation layer) at the repo root |
| `src/ProjectRondo.Domain/` | Pure C# domain — no Godot dependency, uses `System.Numerics` |
| `tests/ProjectRondo.Domain.Tests/` | xUnit tests for the domain |
| `Scenes/`, `Scripts/` | Godot scenes and presentation scripts |

The domain holds engine-agnostic rules (e.g. `CharacterMovement.Step`, a pure function) so they can be
test-driven fast without the engine. The Godot layer converts input into domain values, runs the pure
step, and applies the result to the physics body.

Stack: `R3` (reactive), `OneOf` + `Optional` (functional), `ZLinq` (LINQ over loops).

## Milestone 1 (current)

Scaffold + a 3D hub world with a third-person, mouse-look character (`WASD` move, `Space` jump, `Esc`
to release the mouse). Movement is driven by the pure domain.

## Develop

```bash
# Run the domain tests
dotnet test

# Build the game
dotnet build ProjectRondo.csproj
```

Open `project.godot` in Godot 4.7.1 (mono) and run the main scene `Scenes/Hub/HubWorld.tscn`.

## Roadmap

- **M2** — AVG dialogue system (NPC interaction, dialogue-graph domain, reactive UI binding).
- **M3** — Level entry & transitions: Sonic-style 3D / 2D stubs, and puzzles (2048 + Sudoku).
