# 對話圖 Domain 模型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以純 C# 建立不依賴 Godot 的對話圖模型與純函式推進 `(state, input) -> nextState`，全程 xUnit TDD。

**Architecture:** 資料型別為不可變值型別（`readonly record struct` / `sealed record`）。節點出口 `NodeExit`、觀察狀態 `DialogueState`、輸入 `DialogueInput` 皆以 `OneOf`（`OneOfBase` 具名聯集）表達。`DialoguePlayback.Step` 以 exhaustive pattern matching 推進；非法輸入回傳原 state（no-op）。

**Tech Stack:** C# / net8.0、xUnit、OneOf（`OneOfBase`）、`System.Collections.Immutable`。

**設計來源：** [docs/superpowers/specs/2026-08-13-dialogue-graph-domain-design.md](../specs/2026-08-13-dialogue-graph-domain-design.md)（卡片 [#1](https://github.com/YuutaTsubasa/ProjectRondo/issues/1)）

---

## 環境注意事項

- 本機僅有 .NET 10 runtime，專案目標為 net8.0。**所有 `dotnet test` / `dotnet build` 指令前需加 `DOTNET_ROLL_FORWARD=Major`**，否則會出現 `Microsoft.NETCore.App 8.0.0` 找不到而中止。
- 只建置/測試 domain 測試專案，**不要**建置整個 sln（`ProjectRondo.csproj` 依賴 Godot SDK）。
- 縮排一律使用 **tab**（見 `.editorconfig`）；file-scoped namespace；`sealed`；值語意。

## 檔案結構

新增檔案，皆置於 `src/ProjectRondo.Domain/Dialogue/`（每檔一個型別，單一職責）：

| 檔案 | 職責 |
| --- | --- |
| `NodeId.cs` | 節點識別值型別 |
| `Speaker.cs` | 說話者值型別 |
| `PortraitKey.cs` | 情緒/立繪 key 值型別 |
| `DialogueChoice.cs` | 分支選項值型別 |
| `NodeExit.cs` | 節點出口聯集（`LinearExit`/`BranchExit`/`EndExit` + 工廠 + 空選項防呆） |
| `DialogueNode.cs` | 對話節點 record |
| `DialogueGraph.cs` | 對話圖 record + `FromNodes` 工廠 |
| `DialogueInput.cs` | 輸入聯集（`AdvanceInput`/`SelectInput`） |
| `DialogueState.cs` | 觀察狀態聯集（`Speaking`/`AwaitingChoice`/`Ended` + 具名存取子） |
| `DialoguePlayback.cs` | 純函式 `Start` / `Step` |

測試檔案，置於 `tests/ProjectRondo.Domain.Tests/Dialogue/`：

| 檔案 | 職責 |
| --- | --- |
| `DialogueValueTypesTests.cs` | 值語意測試 |
| `NodeExitTests.cs` | 出口工廠與空選項防呆 |
| `DialogueGraphTests.cs` | 圖建構 |
| `DialogueStateTests.cs` | 狀態/輸入建構與存取子 |
| `DialogueGraphFixture.cs` | 共用測試對話圖（非測試類別，static helper） |
| `DialoguePlaybackTests.cs` | `Start` / `Step` 推進行為 |

---

## Task 1: 對話值型別（NodeId / Speaker / PortraitKey / DialogueChoice）

**Files:**
- Create: `src/ProjectRondo.Domain/Dialogue/NodeId.cs`
- Create: `src/ProjectRondo.Domain/Dialogue/Speaker.cs`
- Create: `src/ProjectRondo.Domain/Dialogue/PortraitKey.cs`
- Create: `src/ProjectRondo.Domain/Dialogue/DialogueChoice.cs`
- Test: `tests/ProjectRondo.Domain.Tests/Dialogue/DialogueValueTypesTests.cs`

- [ ] **Step 1: Write the failing test**

`tests/ProjectRondo.Domain.Tests/Dialogue/DialogueValueTypesTests.cs`:

```csharp
using ProjectRondo.Domain.Dialogue;

namespace ProjectRondo.Domain.Tests.Dialogue;

public sealed class DialogueValueTypesTests
{
	[Fact]
	public void NodeId_WithSameValue_AreEqual()
	{
		Assert.Equal(new NodeId("intro"), new NodeId("intro"));
		Assert.NotEqual(new NodeId("intro"), new NodeId("outro"));
	}

	[Fact]
	public void DialogueChoice_WithSameContent_AreEqual()
	{
		var left = new DialogueChoice("左邊", new NodeId("left"));
		var right = new DialogueChoice("左邊", new NodeId("left"));

		Assert.Equal(left, right);
	}

	[Fact]
	public void SpeakerAndPortrait_ExposeTheirValues()
	{
		Assert.Equal("Nina", new Speaker("Nina").Name);
		Assert.Equal("smile", new PortraitKey("smile").Value);
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DOTNET_ROLL_FORWARD=Major dotnet test tests/ProjectRondo.Domain.Tests/ProjectRondo.Domain.Tests.csproj --filter "FullyQualifiedName~DialogueValueTypesTests"`
Expected: FAIL — 編譯錯誤（`NodeId` / `Speaker` / `PortraitKey` / `DialogueChoice` 不存在）。

- [ ] **Step 3: Write minimal implementation**

`src/ProjectRondo.Domain/Dialogue/NodeId.cs`:

```csharp
namespace ProjectRondo.Domain.Dialogue;

/// <summary>Identifies a <see cref="DialogueNode"/> within a <see cref="DialogueGraph"/>.</summary>
public readonly record struct NodeId(string Value);
```

`src/ProjectRondo.Domain/Dialogue/Speaker.cs`:

```csharp
namespace ProjectRondo.Domain.Dialogue;

/// <summary>The character speaking a <see cref="DialogueNode"/>.</summary>
public readonly record struct Speaker(string Name);
```

`src/ProjectRondo.Domain/Dialogue/PortraitKey.cs`:

```csharp
namespace ProjectRondo.Domain.Dialogue;

/// <summary>Names the emotion / portrait to show for a line; the presentation layer resolves the asset.</summary>
public readonly record struct PortraitKey(string Value);
```

`src/ProjectRondo.Domain/Dialogue/DialogueChoice.cs`:

```csharp
namespace ProjectRondo.Domain.Dialogue;

/// <summary>A branch option: a label the player picks, and the node it leads to.</summary>
public readonly record struct DialogueChoice(string Label, NodeId Target);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `DOTNET_ROLL_FORWARD=Major dotnet test tests/ProjectRondo.Domain.Tests/ProjectRondo.Domain.Tests.csproj --filter "FullyQualifiedName~DialogueValueTypesTests"`
Expected: PASS（3 passed）。

- [ ] **Step 5: Commit**

```bash
git add src/ProjectRondo.Domain/Dialogue tests/ProjectRondo.Domain.Tests/Dialogue
git commit -m "$(printf 'Add dialogue value types (#1)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: 節點出口 `NodeExit`（Linear / Branch / End + 空選項防呆）

**Files:**
- Create: `src/ProjectRondo.Domain/Dialogue/NodeExit.cs`
- Test: `tests/ProjectRondo.Domain.Tests/Dialogue/NodeExitTests.cs`

- [ ] **Step 1: Write the failing test**

`tests/ProjectRondo.Domain.Tests/Dialogue/NodeExitTests.cs`:

```csharp
using System.Collections.Immutable;
using ProjectRondo.Domain.Dialogue;

namespace ProjectRondo.Domain.Tests.Dialogue;

public sealed class NodeExitTests
{
	[Fact]
	public void Line_CarriesTheNextNode()
	{
		var exit = NodeExit.Line(new NodeId("next"));

		var next = exit.Match(linear => linear.Next, _ => default, _ => default);
		Assert.Equal(new NodeId("next"), next);
	}

	[Fact]
	public void Branch_CarriesTheChoices()
	{
		var choice = new DialogueChoice("左邊", new NodeId("left"));

		var exit = NodeExit.Branch(choice);

		var count = exit.Match(_ => 0, branch => branch.Choices.Length, _ => 0);
		Assert.Equal(1, count);
	}

	[Fact]
	public void Branch_WithNoChoices_Throws()
	{
		Assert.Throws<ArgumentException>(() => NodeExit.Branch(ImmutableArray<DialogueChoice>.Empty));
	}

	[Fact]
	public void End_IsAShared_EndExit()
	{
		var isEnd = NodeExit.End.Match(_ => false, _ => false, _ => true);
		Assert.True(isEnd);
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DOTNET_ROLL_FORWARD=Major dotnet test tests/ProjectRondo.Domain.Tests/ProjectRondo.Domain.Tests.csproj --filter "FullyQualifiedName~NodeExitTests"`
Expected: FAIL — 編譯錯誤（`NodeExit` 不存在）。

- [ ] **Step 3: Write minimal implementation**

`src/ProjectRondo.Domain/Dialogue/NodeExit.cs`:

```csharp
using System.Collections.Immutable;
using OneOf;

namespace ProjectRondo.Domain.Dialogue;

/// <summary>Where a <see cref="DialogueNode"/> leads: on to one line, to a branch, or to the end.</summary>
public sealed class NodeExit : OneOfBase<LinearExit, BranchExit, EndExit>
{
	private NodeExit(OneOf<LinearExit, BranchExit, EndExit> input) : base(input) { }

	/// <summary>A single continuation to <paramref name="next"/>.</summary>
	public static NodeExit Line(NodeId next) => new(new LinearExit(next));

	/// <summary>A choice between one or more <paramref name="choices"/>.</summary>
	public static NodeExit Branch(ImmutableArray<DialogueChoice> choices) =>
		choices.IsDefaultOrEmpty
			? throw new ArgumentException("A branch exit needs at least one choice.", nameof(choices))
			: new(new BranchExit(choices));

	/// <summary>A choice between one or more <paramref name="choices"/>.</summary>
	public static NodeExit Branch(params DialogueChoice[] choices) => Branch(choices.ToImmutableArray());

	/// <summary>The terminal exit: advancing past this node ends the dialogue.</summary>
	public static NodeExit End { get; } = new(new EndExit());
}

/// <summary>Continues to a single next node.</summary>
public readonly record struct LinearExit(NodeId Next);

/// <summary>Presents a branch; the player selects one <see cref="DialogueChoice"/>.</summary>
public readonly record struct BranchExit(ImmutableArray<DialogueChoice> Choices);

/// <summary>Marks the end of the dialogue.</summary>
public readonly record struct EndExit;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `DOTNET_ROLL_FORWARD=Major dotnet test tests/ProjectRondo.Domain.Tests/ProjectRondo.Domain.Tests.csproj --filter "FullyQualifiedName~NodeExitTests"`
Expected: PASS（4 passed）。

- [ ] **Step 5: Commit**

```bash
git add src/ProjectRondo.Domain/Dialogue/NodeExit.cs tests/ProjectRondo.Domain.Tests/Dialogue/NodeExitTests.cs
git commit -m "$(printf 'Add NodeExit union with branch guard (#1)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: `DialogueNode` 與 `DialogueGraph`

**Files:**
- Create: `src/ProjectRondo.Domain/Dialogue/DialogueNode.cs`
- Create: `src/ProjectRondo.Domain/Dialogue/DialogueGraph.cs`
- Test: `tests/ProjectRondo.Domain.Tests/Dialogue/DialogueGraphTests.cs`

- [ ] **Step 1: Write the failing test**

`tests/ProjectRondo.Domain.Tests/Dialogue/DialogueGraphTests.cs`:

```csharp
using ProjectRondo.Domain.Dialogue;

namespace ProjectRondo.Domain.Tests.Dialogue;

public sealed class DialogueGraphTests
{
	[Fact]
	public void FromNodes_IndexesNodesById_AndKeepsTheStartId()
	{
		var greet = new DialogueNode(new NodeId("greet"), new Speaker("Nina"), "哈囉！", new PortraitKey("smile"), NodeExit.End);
		var ask = new DialogueNode(new NodeId("ask"), new Speaker("Nina"), "在嗎？", new PortraitKey("think"), NodeExit.End);

		var graph = DialogueGraph.FromNodes(greet.Id, greet, ask);

		Assert.Equal(greet.Id, graph.StartId);
		Assert.Equal(2, graph.Nodes.Count);
		Assert.Same(ask, graph.Nodes[new NodeId("ask")]);
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DOTNET_ROLL_FORWARD=Major dotnet test tests/ProjectRondo.Domain.Tests/ProjectRondo.Domain.Tests.csproj --filter "FullyQualifiedName~DialogueGraphTests"`
Expected: FAIL — 編譯錯誤（`DialogueNode` / `DialogueGraph` 不存在）。

- [ ] **Step 3: Write minimal implementation**

`src/ProjectRondo.Domain/Dialogue/DialogueNode.cs`:

```csharp
namespace ProjectRondo.Domain.Dialogue;

/// <summary>One line of dialogue: who says it, the text, the portrait to show, and where it leads.</summary>
public sealed record DialogueNode(NodeId Id, Speaker Speaker, string Line, PortraitKey Portrait, NodeExit Exit);
```

`src/ProjectRondo.Domain/Dialogue/DialogueGraph.cs`:

```csharp
using System.Collections.Immutable;

namespace ProjectRondo.Domain.Dialogue;

/// <summary>An immutable dialogue as a graph of <see cref="DialogueNode"/> keyed by <see cref="NodeId"/>.</summary>
public sealed record DialogueGraph(ImmutableDictionary<NodeId, DialogueNode> Nodes, NodeId StartId)
{
	/// <summary>Builds a graph from <paramref name="nodes"/>, indexing each by its <see cref="DialogueNode.Id"/>.</summary>
	public static DialogueGraph FromNodes(NodeId startId, params DialogueNode[] nodes) =>
		new(nodes.ToImmutableDictionary(node => node.Id), startId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `DOTNET_ROLL_FORWARD=Major dotnet test tests/ProjectRondo.Domain.Tests/ProjectRondo.Domain.Tests.csproj --filter "FullyQualifiedName~DialogueGraphTests"`
Expected: PASS（1 passed）。

- [ ] **Step 5: Commit**

```bash
git add src/ProjectRondo.Domain/Dialogue/DialogueNode.cs src/ProjectRondo.Domain/Dialogue/DialogueGraph.cs tests/ProjectRondo.Domain.Tests/Dialogue/DialogueGraphTests.cs
git commit -m "$(printf 'Add DialogueNode and DialogueGraph (#1)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 4: `DialogueInput` 與 `DialogueState` 聯集

**Files:**
- Create: `src/ProjectRondo.Domain/Dialogue/DialogueInput.cs`
- Create: `src/ProjectRondo.Domain/Dialogue/DialogueState.cs`
- Test: `tests/ProjectRondo.Domain.Tests/Dialogue/DialogueStateTests.cs`

- [ ] **Step 1: Write the failing test**

`tests/ProjectRondo.Domain.Tests/Dialogue/DialogueStateTests.cs`:

```csharp
using ProjectRondo.Domain.Dialogue;

namespace ProjectRondo.Domain.Tests.Dialogue;

public sealed class DialogueStateTests
{
	private static readonly DialogueNode Node =
		new(new NodeId("n"), new Speaker("Nina"), "嗨", new PortraitKey("smile"), NodeExit.End);

	[Fact]
	public void Speaking_IsExposedThroughAccessors()
	{
		DialogueState state = new Speaking(Node);

		Assert.True(state.IsSpeaking);
		Assert.False(state.IsAwaitingChoice);
		Assert.False(state.IsEnded);
		Assert.Equal(Node, state.AsSpeaking.Current);
	}

	[Fact]
	public void Ended_IsExposedThroughAccessors()
	{
		DialogueState state = new Ended(Node);

		Assert.True(state.IsEnded);
		Assert.Equal(Node, state.AsEnded.Last);
	}

	[Fact]
	public void Select_CarriesTheChosenIndex()
	{
		var index = DialogueInput.Select(2).Match(_ => -1, select => select.Index);
		Assert.Equal(2, index);
	}

	[Fact]
	public void Advance_IsTheAdvanceCase()
	{
		var isAdvance = DialogueInput.Advance.Match(_ => true, _ => false);
		Assert.True(isAdvance);
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DOTNET_ROLL_FORWARD=Major dotnet test tests/ProjectRondo.Domain.Tests/ProjectRondo.Domain.Tests.csproj --filter "FullyQualifiedName~DialogueStateTests"`
Expected: FAIL — 編譯錯誤（`DialogueState` / `DialogueInput` / `Speaking` / `Ended` 不存在）。

- [ ] **Step 3: Write minimal implementation**

`src/ProjectRondo.Domain/Dialogue/DialogueInput.cs`:

```csharp
using OneOf;

namespace ProjectRondo.Domain.Dialogue;

/// <summary>Player intent while a dialogue is running: advance the current line, or select a branch option.</summary>
public sealed class DialogueInput : OneOfBase<AdvanceInput, SelectInput>
{
	private DialogueInput(OneOf<AdvanceInput, SelectInput> input) : base(input) { }

	/// <summary>Request to move past the current line.</summary>
	public static DialogueInput Advance { get; } = new(new AdvanceInput());

	/// <summary>Select the branch option at <paramref name="index"/>.</summary>
	public static DialogueInput Select(int index) => new(new SelectInput(index));
}

/// <summary>Advance past the current line.</summary>
public readonly record struct AdvanceInput;

/// <summary>Select the branch option at <see cref="Index"/>.</summary>
public readonly record struct SelectInput(int Index);
```

`src/ProjectRondo.Domain/Dialogue/DialogueState.cs`:

```csharp
using System.Collections.Immutable;
using OneOf;

namespace ProjectRondo.Domain.Dialogue;

/// <summary>
/// The observable state of a running dialogue: showing a line, awaiting a choice, or ended.
/// The presentation layer binds to this (e.g. R3 <c>ReactiveProperty&lt;DialogueState&gt;</c>).
/// </summary>
public sealed class DialogueState : OneOfBase<Speaking, AwaitingChoice, Ended>
{
	private DialogueState(OneOf<Speaking, AwaitingChoice, Ended> input) : base(input) { }

	public static implicit operator DialogueState(Speaking value) => new(value);
	public static implicit operator DialogueState(AwaitingChoice value) => new(value);
	public static implicit operator DialogueState(Ended value) => new(value);

	public bool IsSpeaking => IsT0;
	public bool IsAwaitingChoice => IsT1;
	public bool IsEnded => IsT2;

	public Speaking AsSpeaking => AsT0;
	public AwaitingChoice AsAwaitingChoice => AsT1;
	public Ended AsEnded => AsT2;
}

/// <summary>Showing <see cref="Current"/>'s line, awaiting an <see cref="AdvanceInput"/>.</summary>
public readonly record struct Speaking(DialogueNode Current);

/// <summary>Showing <see cref="Current"/>'s line and awaiting a selection among <see cref="Choices"/>.</summary>
public readonly record struct AwaitingChoice(DialogueNode Current, ImmutableArray<DialogueChoice> Choices);

/// <summary>The dialogue has ended; <see cref="Last"/> is the final line shown.</summary>
public readonly record struct Ended(DialogueNode Last);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `DOTNET_ROLL_FORWARD=Major dotnet test tests/ProjectRondo.Domain.Tests/ProjectRondo.Domain.Tests.csproj --filter "FullyQualifiedName~DialogueStateTests"`
Expected: PASS（4 passed）。

- [ ] **Step 5: Commit**

```bash
git add src/ProjectRondo.Domain/Dialogue/DialogueInput.cs src/ProjectRondo.Domain/Dialogue/DialogueState.cs tests/ProjectRondo.Domain.Tests/Dialogue/DialogueStateTests.cs
git commit -m "$(printf 'Add DialogueInput and DialogueState unions (#1)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 5: 共用測試對話圖 + `DialoguePlayback.Start`

**共用 fixture 對話圖**（後續各 Step 任務重用）：

```
greet (Linear→ask)  ──Advance──▶  ask (Branch)  ──Select(0)──▶  left  (End)
                                        │
                                        └────Select(1)──▶  right (End)
```

**Files:**
- Create: `tests/ProjectRondo.Domain.Tests/Dialogue/DialogueGraphFixture.cs`
- Create: `src/ProjectRondo.Domain/Dialogue/DialoguePlayback.cs`
- Test: `tests/ProjectRondo.Domain.Tests/Dialogue/DialoguePlaybackTests.cs`

- [ ] **Step 1: Write the fixture + failing test**

`tests/ProjectRondo.Domain.Tests/Dialogue/DialogueGraphFixture.cs`:

```csharp
using ProjectRondo.Domain.Dialogue;

namespace ProjectRondo.Domain.Tests.Dialogue;

/// <summary>A small dialogue used across playback tests: one line, a two-way branch, two endings.</summary>
internal static class DialogueGraphFixture
{
	public static readonly NodeId Greet = new("greet");
	public static readonly NodeId Ask = new("ask");
	public static readonly NodeId Left = new("left");
	public static readonly NodeId Right = new("right");

	public static readonly DialogueChoice GoLeft = new("左邊", Left);
	public static readonly DialogueChoice GoRight = new("右邊", Right);

	public static DialogueGraph Build()
	{
		var speaker = new Speaker("Nina");
		var greet = new DialogueNode(Greet, speaker, "哈囉！", new PortraitKey("smile"), NodeExit.Line(Ask));
		var ask = new DialogueNode(Ask, speaker, "要走哪條路？", new PortraitKey("think"), NodeExit.Branch(GoLeft, GoRight));
		var left = new DialogueNode(Left, speaker, "走左邊。", new PortraitKey("smile"), NodeExit.End);
		var right = new DialogueNode(Right, speaker, "走右邊。", new PortraitKey("smile"), NodeExit.End);

		return DialogueGraph.FromNodes(Greet, greet, ask, left, right);
	}
}
```

`tests/ProjectRondo.Domain.Tests/Dialogue/DialoguePlaybackTests.cs`:

```csharp
using ProjectRondo.Domain.Dialogue;

namespace ProjectRondo.Domain.Tests.Dialogue;

public sealed class DialoguePlaybackTests
{
	private static readonly DialogueGraph Graph = DialogueGraphFixture.Build();

	[Fact]
	public void Start_BeginsAtTheStartNode_Speaking()
	{
		var state = DialoguePlayback.Start(Graph);

		Assert.True(state.IsSpeaking);
		Assert.Equal(DialogueGraphFixture.Greet, state.AsSpeaking.Current.Id);
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DOTNET_ROLL_FORWARD=Major dotnet test tests/ProjectRondo.Domain.Tests/ProjectRondo.Domain.Tests.csproj --filter "FullyQualifiedName~DialoguePlaybackTests"`
Expected: FAIL — 編譯錯誤（`DialoguePlayback` 不存在）。

- [ ] **Step 3: Write minimal implementation**

`src/ProjectRondo.Domain/Dialogue/DialoguePlayback.cs`:

```csharp
namespace ProjectRondo.Domain.Dialogue;

/// <summary>
/// Pure, engine-agnostic dialogue advancement. Given a <see cref="DialogueGraph"/>, the current
/// <see cref="DialogueState"/> and one <see cref="DialogueInput"/>, it computes the next state.
/// Invalid input (advancing a choice, selecting a line, an out-of-range index, or input after the
/// end) is a no-op: the same state is returned.
/// </summary>
public static class DialoguePlayback
{
	/// <summary>The state at the graph's start node.</summary>
	public static DialogueState Start(DialogueGraph graph) => StateOf(graph.Nodes[graph.StartId]);

	/// <summary>Projects a node to the state that presents it: a branch node awaits a choice, otherwise it speaks.</summary>
	private static DialogueState StateOf(DialogueNode node) =>
		node.Exit.Match<DialogueState>(
			_ => new Speaking(node),
			branch => new AwaitingChoice(node, branch.Choices),
			_ => new Speaking(node));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `DOTNET_ROLL_FORWARD=Major dotnet test tests/ProjectRondo.Domain.Tests/ProjectRondo.Domain.Tests.csproj --filter "FullyQualifiedName~DialoguePlaybackTests"`
Expected: PASS（1 passed）。

- [ ] **Step 5: Commit**

```bash
git add src/ProjectRondo.Domain/Dialogue/DialoguePlayback.cs tests/ProjectRondo.Domain.Tests/Dialogue/DialogueGraphFixture.cs tests/ProjectRondo.Domain.Tests/Dialogue/DialoguePlaybackTests.cs
git commit -m "$(printf 'Add DialoguePlayback.Start (#1)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 6: `Step` — 線性推進到下一句

**Files:**
- Modify: `src/ProjectRondo.Domain/Dialogue/DialoguePlayback.cs`
- Test: `tests/ProjectRondo.Domain.Tests/Dialogue/DialoguePlaybackTests.cs`

- [ ] **Step 1: Write the failing test** — 在 `DialoguePlaybackTests` 類別內新增：

```csharp
	[Fact]
	public void Advance_FromLine_MovesToTheNextNode()
	{
		var state = DialoguePlayback.Start(Graph);

		var next = DialoguePlayback.Step(Graph, state, DialogueInput.Advance);

		Assert.True(next.IsAwaitingChoice);
		Assert.Equal(DialogueGraphFixture.Ask, next.AsAwaitingChoice.Current.Id);
		Assert.Equal(2, next.AsAwaitingChoice.Choices.Length);
	}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DOTNET_ROLL_FORWARD=Major dotnet test tests/ProjectRondo.Domain.Tests/ProjectRondo.Domain.Tests.csproj --filter "FullyQualifiedName~DialoguePlaybackTests.Advance_FromLine_MovesToTheNextNode"`
Expected: FAIL — 編譯錯誤（`DialoguePlayback.Step` 不存在）。

- [ ] **Step 3: Write minimal implementation** — 在 `DialoguePlayback` 加入 `Step`、`Go` 與兩個 helper。將整個類別替換為：

```csharp
namespace ProjectRondo.Domain.Dialogue;

/// <summary>
/// Pure, engine-agnostic dialogue advancement. Given a <see cref="DialogueGraph"/>, the current
/// <see cref="DialogueState"/> and one <see cref="DialogueInput"/>, it computes the next state.
/// Invalid input (advancing a choice, selecting a line, an out-of-range index, or input after the
/// end) is a no-op: the same state is returned.
/// </summary>
public static class DialoguePlayback
{
	/// <summary>The state at the graph's start node.</summary>
	public static DialogueState Start(DialogueGraph graph) => StateOf(graph.Nodes[graph.StartId]);

	/// <summary>Advances the dialogue by one input, returning the same state for invalid input.</summary>
	public static DialogueState Step(DialogueGraph graph, DialogueState state, DialogueInput input) =>
		state.Match<DialogueState>(
			speaking => StepSpeaking(graph, state, speaking, input),
			awaiting => StepAwaiting(graph, state, awaiting, input),
			_ => state);

	private static DialogueState StepSpeaking(DialogueGraph graph, DialogueState self, Speaking speaking, DialogueInput input) =>
		input.Match<DialogueState>(
			_ => speaking.Current.Exit.Match<DialogueState>(
				linear => Go(graph, linear.Next, self),
				_ => self,
				_ => new Ended(speaking.Current)),
			_ => self);

	private static DialogueState StepAwaiting(DialogueGraph graph, DialogueState self, AwaitingChoice awaiting, DialogueInput input) =>
		input.Match<DialogueState>(
			_ => self,
			select => select.Index >= 0 && select.Index < awaiting.Choices.Length
				? Go(graph, awaiting.Choices[select.Index].Target, self)
				: self);

	private static DialogueState Go(DialogueGraph graph, NodeId id, DialogueState fallback) =>
		graph.Nodes.TryGetValue(id, out var node) ? StateOf(node) : fallback;

	private static DialogueState StateOf(DialogueNode node) =>
		node.Exit.Match<DialogueState>(
			_ => new Speaking(node),
			branch => new AwaitingChoice(node, branch.Choices),
			_ => new Speaking(node));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `DOTNET_ROLL_FORWARD=Major dotnet test tests/ProjectRondo.Domain.Tests/ProjectRondo.Domain.Tests.csproj --filter "FullyQualifiedName~DialoguePlaybackTests"`
Expected: PASS（2 passed）。

- [ ] **Step 5: Commit**

```bash
git add src/ProjectRondo.Domain/Dialogue/DialoguePlayback.cs tests/ProjectRondo.Domain.Tests/Dialogue/DialoguePlaybackTests.cs
git commit -m "$(printf 'Advance dialogue linearly to the next node (#1)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 7: `Step` — 推進到結束（`EndExit` → `Ended`）

**Files:**
- Test: `tests/ProjectRondo.Domain.Tests/Dialogue/DialoguePlaybackTests.cs`

（實作已於 Task 6 涵蓋；本任務新增測試驗證行為並鎖定回歸。）

- [ ] **Step 1: Write the failing test** — 在 `DialoguePlaybackTests` 內新增：

```csharp
	[Fact]
	public void Advance_FromAnEndingLine_Ends_KeepingTheLastNode()
	{
		var atChoice = DialoguePlayback.Step(Graph, DialoguePlayback.Start(Graph), DialogueInput.Advance);
		var atLeft = DialoguePlayback.Step(Graph, atChoice, DialogueInput.Select(0));

		Assert.True(atLeft.IsSpeaking);
		Assert.Equal(DialogueGraphFixture.Left, atLeft.AsSpeaking.Current.Id);

		var ended = DialoguePlayback.Step(Graph, atLeft, DialogueInput.Advance);

		Assert.True(ended.IsEnded);
		Assert.Equal(DialogueGraphFixture.Left, ended.AsEnded.Last.Id);
	}
```

- [ ] **Step 2: Run test to verify it passes** (實作已存在，應直接綠燈)

Run: `DOTNET_ROLL_FORWARD=Major dotnet test tests/ProjectRondo.Domain.Tests/ProjectRondo.Domain.Tests.csproj --filter "FullyQualifiedName~DialoguePlaybackTests.Advance_FromAnEndingLine_Ends_KeepingTheLastNode"`
Expected: PASS（1 passed）。若 FAIL，回頭檢查 Task 6 的 `StepSpeaking` 對 `EndExit` 的處理。

- [ ] **Step 3: Commit**

```bash
git add tests/ProjectRondo.Domain.Tests/Dialogue/DialoguePlaybackTests.cs
git commit -m "$(printf 'Cover advancing an ending line to Ended (#1)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 8: `Step` — 分支選擇（不同選項到不同結局）

**Files:**
- Test: `tests/ProjectRondo.Domain.Tests/Dialogue/DialoguePlaybackTests.cs`

（實作已於 Task 6 涵蓋；本任務鎖定分支路由。）

- [ ] **Step 1: Write the failing test** — 在 `DialoguePlaybackTests` 內新增：

```csharp
	[Theory]
	[InlineData(0, "left")]
	[InlineData(1, "right")]
	public void Select_FromAChoice_RoutesToTheChosenTarget(int index, string expectedNode)
	{
		var atChoice = DialoguePlayback.Step(Graph, DialoguePlayback.Start(Graph), DialogueInput.Advance);

		var chosen = DialoguePlayback.Step(Graph, atChoice, DialogueInput.Select(index));

		Assert.True(chosen.IsSpeaking);
		Assert.Equal(new NodeId(expectedNode), chosen.AsSpeaking.Current.Id);
	}
```

- [ ] **Step 2: Run test to verify it passes** (實作已存在)

Run: `DOTNET_ROLL_FORWARD=Major dotnet test tests/ProjectRondo.Domain.Tests/ProjectRondo.Domain.Tests.csproj --filter "FullyQualifiedName~DialoguePlaybackTests.Select_FromAChoice_RoutesToTheChosenTarget"`
Expected: PASS（2 passed — 兩組 InlineData）。

- [ ] **Step 3: Commit**

```bash
git add tests/ProjectRondo.Domain.Tests/Dialogue/DialoguePlaybackTests.cs
git commit -m "$(printf 'Cover branch selection routing (#1)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 9: `Step` — 非法輸入 no-op

**Files:**
- Test: `tests/ProjectRondo.Domain.Tests/Dialogue/DialoguePlaybackTests.cs`

（實作已於 Task 6 涵蓋；本任務鎖定所有 no-op 邊界。使用 `Assert.Same` 驗證回傳的是同一個 state 物件。）

- [ ] **Step 1: Write the failing test** — 在 `DialoguePlaybackTests` 內新增：

```csharp
	[Fact]
	public void Select_OnALine_IsANoOp()
	{
		var atLine = DialoguePlayback.Start(Graph);

		var result = DialoguePlayback.Step(Graph, atLine, DialogueInput.Select(0));

		Assert.Same(atLine, result);
	}

	[Fact]
	public void Advance_OnAChoice_IsANoOp()
	{
		var atChoice = DialoguePlayback.Step(Graph, DialoguePlayback.Start(Graph), DialogueInput.Advance);

		var result = DialoguePlayback.Step(Graph, atChoice, DialogueInput.Advance);

		Assert.Same(atChoice, result);
	}

	[Theory]
	[InlineData(-1)]
	[InlineData(2)]
	public void Select_OutOfRange_IsANoOp(int index)
	{
		var atChoice = DialoguePlayback.Step(Graph, DialoguePlayback.Start(Graph), DialogueInput.Advance);

		var result = DialoguePlayback.Step(Graph, atChoice, DialogueInput.Select(index));

		Assert.Same(atChoice, result);
	}

	[Fact]
	public void AnyInput_AfterEnd_IsANoOp()
	{
		var atChoice = DialoguePlayback.Step(Graph, DialoguePlayback.Start(Graph), DialogueInput.Advance);
		var atLeft = DialoguePlayback.Step(Graph, atChoice, DialogueInput.Select(0));
		var ended = DialoguePlayback.Step(Graph, atLeft, DialogueInput.Advance);

		Assert.Same(ended, DialoguePlayback.Step(Graph, ended, DialogueInput.Advance));
		Assert.Same(ended, DialoguePlayback.Step(Graph, ended, DialogueInput.Select(0)));
	}
```

- [ ] **Step 2: Run test to verify it passes** (實作已存在)

Run: `DOTNET_ROLL_FORWARD=Major dotnet test tests/ProjectRondo.Domain.Tests/ProjectRondo.Domain.Tests.csproj --filter "FullyQualifiedName~DialoguePlaybackTests"`
Expected: PASS（全 `DialoguePlaybackTests` 綠燈）。

- [ ] **Step 3: Commit**

```bash
git add tests/ProjectRondo.Domain.Tests/Dialogue/DialoguePlaybackTests.cs
git commit -m "$(printf 'Cover invalid-input no-ops (#1)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 10: 全套綠燈 + 原則審查

**Files:** 無新增；驗證與審查。

- [ ] **Step 1: Run the full domain test suite**

Run: `DOTNET_ROLL_FORWARD=Major dotnet test tests/ProjectRondo.Domain.Tests/ProjectRondo.Domain.Tests.csproj`
Expected: PASS — 既有 13 + 新增（約 13）皆綠燈，失敗 0。

- [ ] **Step 2: Principle review** — 使用 `reviewing-code` skill 針對本分支 diff 檢查 TDD / DDD / functional-core / 17 條原則（switch expression、exhaustive pattern matching、值語意、early return、expression-bodied、tab 縮排…）。修正發現的問題並補測試。

- [ ] **Step 3: Verify no stray build of the Godot project**

確認上述指令僅建置 `ProjectRondo.Domain` 與其測試專案，未觸發 `ProjectRondo.csproj`（Godot）。

- [ ] **Step 4: Final commit（若審查有修正）**

```bash
git add -A
git commit -m "$(printf 'Address principle review for dialogue graph domain (#1)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## 驗收對照（卡片 #1）

- 對話推進 → Task 6（線性）。
- 選項分支 → Task 8。
- 結束狀態 → Task 7。
- 皆有測試且綠燈 → Task 5–9 + Task 10 全套驗證。
- 遵守 17 條原則 → 型別採值語意/不可變（#15）、`Step` 用 switch expression + exhaustive pattern matching（#11/#12）、expression-bodied（#2）、early/no-op 回傳（#10）；Task 10 審查把關。
```