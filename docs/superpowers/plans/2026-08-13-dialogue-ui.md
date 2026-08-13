# 對話 UI（R3 綁定）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把已合併的對話 Domain 接上 Godot 對話框 UI，以 R3 反應式綁定；反應式核心 `DialogueSession` 走 domain TDD，Godot 表現層作者化並 compile-check、由人在編輯器驗收。

**Architecture:** Domain 新增 `DialogueSession`——用 R3 把純函式 `DialoguePlayback` 包成反應式狀態（`State` + 衍生串流）。Godot `DialogueBox : Control` 訂閱 session 渲染、逐字 tween、回送輸入；`PortraitLibrary` 解析立繪；臨時 `DialogueDemo` 場景觸發。

**Tech Stack:** C# / net8.0、xUnit、R3（`ReactiveProperty`/`Observable`）、OneOf、Godot 4.7.1 (mono)。

**設計來源：** [docs/superpowers/specs/2026-08-13-dialogue-ui-design.md](../specs/2026-08-13-dialogue-ui-design.md)（卡片 [#3](https://github.com/YuutaTsubasa/ProjectRondo/issues/3)）

---

## 環境注意事項

- 本機僅有 .NET 10 runtime、專案目標 net8.0：**所有 `dotnet` 指令前綴 `DOTNET_ROLL_FORWARD=Major`**。
- 兩種驗證指令：
  - **Domain 測試（TDD）**：`DOTNET_ROLL_FORWARD=Major dotnet test tests/ProjectRondo.Domain.Tests/ProjectRondo.Domain.Tests.csproj`
  - **Godot 表現層 compile-check**：`DOTNET_ROLL_FORWARD=Major dotnet build ProjectRondo.csproj`
- **表現層無法在此 render/run**：`DialogueBox`/`.tscn`/tween/貼圖只能 compile-check，視覺與互動由使用者在 Godot 編輯器驗收（Task 9 有清單）。
- 縮排 **tab**、file-scoped namespace、值語意、遵循 `docs/engineering-principles.md` 的 18 條（含 #17 用 XML summary、#18 空集合用 `[]`）。

## 檔案結構

| 檔案 | 層 | 職責 | 驗證 |
| --- | --- | --- | --- |
| `src/ProjectRondo.Domain/Dialogue/DialogueSession.cs` | domain | 反應式對話狀態（wraps `DialoguePlayback`） | xUnit |
| `tests/ProjectRondo.Domain.Tests/Dialogue/DialogueSessionTests.cs` | test | session 行為 | xUnit |
| `Scripts/Dialogue/PortraitLibrary.cs` | presentation | `PortraitKey → Texture2D`（fallback） | compile-check |
| `Scripts/Dialogue/DialogueBox.cs` | presentation | `Control` 對話框：訂閱/渲染/逐字/輸入 | compile-check |
| `Scenes/UI/DialogueBox.tscn` | presentation | 對話框場景 | 編輯器 |
| `Assets/Portraits/knight_idle.png` | asset | 普通表情立繪 | 編輯器匯入 |
| `Scripts/Dialogue/DialogueDemo.cs` | presentation | 臨時觸發：載入範例對話 | compile-check |
| `Scenes/UI/DialogueDemo.tscn` | presentation | 臨時觸發場景 | 編輯器 |

重用既有 `tests/ProjectRondo.Domain.Tests/Dialogue/DialogueGraphFixture.cs`（`internal static`，含 greet→ask 分支→left/right 結局）。

---

## Task 1: `DialogueSession` 核心（State / Advance / Select / Dispose）

**Files:**
- Create: `src/ProjectRondo.Domain/Dialogue/DialogueSession.cs`
- Test: `tests/ProjectRondo.Domain.Tests/Dialogue/DialogueSessionTests.cs`

- [ ] **Step 1: Write the failing test**

`tests/ProjectRondo.Domain.Tests/Dialogue/DialogueSessionTests.cs`:

```csharp
using ProjectRondo.Domain.Dialogue;

namespace ProjectRondo.Domain.Tests.Dialogue;

public sealed class DialogueSessionTests
{
	private static DialogueSession NewSession() => new(DialogueGraphFixture.Build());

	[Fact]
	public void Starts_AtTheStartNode()
	{
		using var session = NewSession();

		Assert.True(session.State.CurrentValue.IsSpeaking);
		Assert.Equal(DialogueGraphFixture.Greet, session.State.CurrentValue.AsSpeaking.Current.Id);
	}

	[Fact]
	public void Advance_MovesToTheNextNode()
	{
		using var session = NewSession();

		session.Advance();

		Assert.True(session.State.CurrentValue.IsAwaitingChoice);
		Assert.Equal(DialogueGraphFixture.Ask, session.State.CurrentValue.AsAwaitingChoice.Current.Id);
	}

	[Fact]
	public void Select_RoutesToTheChosenTarget()
	{
		using var session = NewSession();

		session.Advance();   // Greet -> Ask (branch)
		session.Select(0);   // choose left

		Assert.True(session.State.CurrentValue.IsSpeaking);
		Assert.Equal(DialogueGraphFixture.Left, session.State.CurrentValue.AsSpeaking.Current.Id);
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DOTNET_ROLL_FORWARD=Major dotnet test tests/ProjectRondo.Domain.Tests/ProjectRondo.Domain.Tests.csproj --filter "FullyQualifiedName~DialogueSessionTests"`
Expected: FAIL — 編譯錯誤（`DialogueSession` 不存在）。

- [ ] **Step 3: Write minimal implementation**

`src/ProjectRondo.Domain/Dialogue/DialogueSession.cs`:

```csharp
using R3;

namespace ProjectRondo.Domain.Dialogue;

/// <summary>
/// A running dialogue as reactive state: wraps the pure <see cref="DialoguePlayback"/> so the presentation
/// layer binds to <see cref="State"/> instead of polling. Invalid input is a no-op that returns the same
/// <see cref="DialogueState"/>, so R3's equality check suppresses the emission.
/// </summary>
public sealed class DialogueSession : IDisposable
{
	private readonly DialogueGraph _graph;
	private readonly ReactiveProperty<DialogueState> _state;

	public DialogueSession(DialogueGraph graph)
	{
		_graph = graph;
		_state = new ReactiveProperty<DialogueState>(DialoguePlayback.Start(graph));
	}

	/// <summary>The current dialogue state; replays its value to each new subscriber.</summary>
	public ReadOnlyReactiveProperty<DialogueState> State => _state;

	/// <summary>Advances the current line; a no-op on a branch or after the end.</summary>
	public void Advance() => _state.Value = DialoguePlayback.Step(_graph, _state.Value, DialogueInput.Advance);

	/// <summary>Selects the branch option at <paramref name="index"/>; a no-op elsewhere or out of range.</summary>
	public void Select(int index) => _state.Value = DialoguePlayback.Step(_graph, _state.Value, DialogueInput.Select(index));

	public void Dispose() => _state.Dispose();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `DOTNET_ROLL_FORWARD=Major dotnet test tests/ProjectRondo.Domain.Tests/ProjectRondo.Domain.Tests.csproj --filter "FullyQualifiedName~DialogueSessionTests"`
Expected: PASS（3 passed）。

- [ ] **Step 5: Commit**

```bash
git add src/ProjectRondo.Domain/Dialogue/DialogueSession.cs tests/ProjectRondo.Domain.Tests/Dialogue/DialogueSessionTests.cs
git commit -m "$(printf 'Add DialogueSession reactive core (#3)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: `DialogueSession` 衍生串流（Speaker / Line / Portrait / Choices / IsFinished）

**Files:**
- Modify: `src/ProjectRondo.Domain/Dialogue/DialogueSession.cs`
- Test: `tests/ProjectRondo.Domain.Tests/Dialogue/DialogueSessionTests.cs`

- [ ] **Step 1: Write the failing test** — 在 `DialogueSessionTests` 內新增（並於檔案頂端補 `using System.Collections.Immutable;`）：

```csharp
	[Fact]
	public void Speaker_Line_Portrait_ReflectTheCurrentNode()
	{
		using var session = NewSession();
		var speaker = default(Speaker);
		var line = string.Empty;
		var portrait = default(PortraitKey);
		using var d1 = session.Speaker.Subscribe(value => speaker = value);
		using var d2 = session.Line.Subscribe(value => line = value);
		using var d3 = session.Portrait.Subscribe(value => portrait = value);

		Assert.Equal("Nina", speaker.Name);
		Assert.Equal("哈囉！", line);
		Assert.Equal(new PortraitKey("smile"), portrait);
	}

	[Fact]
	public void Choices_AreEmptyOnALine_AndPopulatedOnABranch()
	{
		using var session = NewSession();
		var choices = default(ImmutableArray<DialogueChoice>);
		using var d = session.Choices.Subscribe(value => choices = value);

		Assert.Empty(choices);   // at Greet (a line)

		session.Advance();       // to Ask (a branch)

		Assert.Equal(2, choices.Length);
	}

	[Fact]
	public void IsFinished_BecomesTrueAtTheEnd()
	{
		using var session = NewSession();
		var finished = false;
		using var d = session.IsFinished.Subscribe(value => finished = value);

		session.Advance();   // Ask
		session.Select(0);   // Left (a line with an end exit)
		session.Advance();   // Ended

		Assert.True(finished);
	}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DOTNET_ROLL_FORWARD=Major dotnet test tests/ProjectRondo.Domain.Tests/ProjectRondo.Domain.Tests.csproj --filter "FullyQualifiedName~DialogueSessionTests"`
Expected: FAIL — 編譯錯誤（`Speaker`/`Line`/`Portrait`/`Choices`/`IsFinished` 不存在）。

- [ ] **Step 3: Write implementation** — 將 `DialogueSession.cs` 整檔替換為：

```csharp
using System.Collections.Immutable;
using R3;

namespace ProjectRondo.Domain.Dialogue;

/// <summary>
/// A running dialogue as reactive state: wraps the pure <see cref="DialoguePlayback"/> so the presentation
/// layer binds to <see cref="State"/> (and its derived streams) instead of polling. Invalid input is a
/// no-op that returns the same <see cref="DialogueState"/>, so R3's equality check suppresses the emission.
/// </summary>
public sealed class DialogueSession : IDisposable
{
	private readonly DialogueGraph _graph;
	private readonly ReactiveProperty<DialogueState> _state;

	public DialogueSession(DialogueGraph graph)
	{
		_graph = graph;
		_state = new ReactiveProperty<DialogueState>(DialoguePlayback.Start(graph));
		Speaker = _state.Select(NodeOf).Select(node => node.Speaker).DistinctUntilChanged();
		Line = _state.Select(NodeOf).Select(node => node.Line).DistinctUntilChanged();
		Portrait = _state.Select(NodeOf).Select(node => node.Portrait).DistinctUntilChanged();
		Choices = _state.Select(state => state.IsAwaitingChoice ? state.AsAwaitingChoice.Choices : []).DistinctUntilChanged();
		IsFinished = _state.Select(state => state.IsEnded).DistinctUntilChanged();
	}

	/// <summary>The current dialogue state; replays its value to each new subscriber.</summary>
	public ReadOnlyReactiveProperty<DialogueState> State => _state;

	/// <summary>The speaker of the current line.</summary>
	public Observable<Speaker> Speaker { get; }

	/// <summary>The text of the current line.</summary>
	public Observable<string> Line { get; }

	/// <summary>The portrait key of the current line.</summary>
	public Observable<PortraitKey> Portrait { get; }

	/// <summary>The current choices; empty unless awaiting a selection.</summary>
	public Observable<ImmutableArray<DialogueChoice>> Choices { get; }

	/// <summary>True once the dialogue has ended.</summary>
	public Observable<bool> IsFinished { get; }

	/// <summary>Advances the current line; a no-op on a branch or after the end.</summary>
	public void Advance() => _state.Value = DialoguePlayback.Step(_graph, _state.Value, DialogueInput.Advance);

	/// <summary>Selects the branch option at <paramref name="index"/>; a no-op elsewhere or out of range.</summary>
	public void Select(int index) => _state.Value = DialoguePlayback.Step(_graph, _state.Value, DialogueInput.Select(index));

	public void Dispose() => _state.Dispose();

	private static DialogueNode NodeOf(DialogueState state) =>
		state.Match(speaking => speaking.Current, awaiting => awaiting.Current, ended => ended.Last);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `DOTNET_ROLL_FORWARD=Major dotnet test tests/ProjectRondo.Domain.Tests/ProjectRondo.Domain.Tests.csproj --filter "FullyQualifiedName~DialogueSessionTests"`
Expected: PASS（6 passed）。

- [ ] **Step 5: Commit**

```bash
git add src/ProjectRondo.Domain/Dialogue/DialogueSession.cs tests/ProjectRondo.Domain.Tests/Dialogue/DialogueSessionTests.cs
git commit -m "$(printf 'Add DialogueSession derived streams (#3)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: `DialogueSession` no-op 不發射 + Dispose

**Files:**
- Test: `tests/ProjectRondo.Domain.Tests/Dialogue/DialogueSessionTests.cs`

（實作已於 Task 1/2 支援；本任務以測試釘住反應式契約。）

- [ ] **Step 1: Write the failing test** — 在 `DialogueSessionTests` 內新增：

```csharp
	[Fact]
	public void InvalidInput_DoesNotEmitANewState()
	{
		using var session = NewSession();
		var emissions = 0;
		using var d = session.State.Subscribe(_ => emissions++);

		Assert.Equal(1, emissions);   // initial replay on subscribe

		session.Select(0);            // Select on a line (Greet) -> no-op
		Assert.Equal(1, emissions);

		session.Advance();            // Greet -> Ask (valid)
		Assert.Equal(2, emissions);

		session.Advance();            // Advance on a branch (Ask) -> no-op
		session.Select(9);            // out of range -> no-op
		Assert.Equal(2, emissions);
	}

	[Fact]
	public void Dispose_IsSafeAndIdempotent()
	{
		var session = NewSession();

		session.Dispose();
		session.Dispose();
	}
```

- [ ] **Step 2: Run test to verify it passes** (實作已存在)

Run: `DOTNET_ROLL_FORWARD=Major dotnet test tests/ProjectRondo.Domain.Tests/ProjectRondo.Domain.Tests.csproj --filter "FullyQualifiedName~DialogueSessionTests"`
Expected: PASS（8 passed）。若 `InvalidInput_DoesNotEmitANewState` FAIL，代表 no-op 未回傳同參考——回頭檢查 `DialoguePlayback.Step`（不應在此任務改動）。

- [ ] **Step 3: Commit**

```bash
git add tests/ProjectRondo.Domain.Tests/Dialogue/DialogueSessionTests.cs
git commit -m "$(printf 'Cover DialogueSession no-op suppression and dispose (#3)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 4: `PortraitLibrary`（立繪解析 + fallback）

**Files:**
- Create: `Scripts/Dialogue/PortraitLibrary.cs`

（表現層，無單元測試；以 Godot build compile-check。）

- [ ] **Step 1: Write implementation**

`Scripts/Dialogue/PortraitLibrary.cs`:

```csharp
using Godot;
using ProjectRondo.Domain.Dialogue;

namespace ProjectRondo.Dialogue;

/// <summary>
/// Resolves a <see cref="PortraitKey"/> to a portrait texture, falling back to a default when the key has
/// no dedicated art yet. Card #4 fills <see cref="_byKey"/> with per-emotion textures; until then every key
/// resolves to the neutral portrait.
/// </summary>
public sealed class PortraitLibrary
{
	private const string NeutralPath = "res://Assets/Portraits/knight_idle.png";

	private readonly Dictionary<string, Texture2D> _byKey = new();
	private readonly Texture2D _fallback;

	private PortraitLibrary(Texture2D fallback) => _fallback = fallback;

	/// <summary>The stub library used until card #4 supplies per-emotion portraits.</summary>
	public static PortraitLibrary Neutral() => new(GD.Load<Texture2D>(NeutralPath));

	/// <summary>The texture for <paramref name="key"/>, or the fallback when the key is unmapped.</summary>
	public Texture2D Resolve(PortraitKey key) => _byKey.TryGetValue(key.Value, out var texture) ? texture : _fallback;
}
```

- [ ] **Step 2: Compile-check**

Run: `DOTNET_ROLL_FORWARD=Major dotnet build ProjectRondo.csproj`
Expected: `建置成功` / Build succeeded, 0 errors.

- [ ] **Step 3: Commit**

```bash
git add Scripts/Dialogue/PortraitLibrary.cs
git commit -m "$(printf 'Add PortraitLibrary with neutral fallback (#3)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 5: `DialogueBox`（Control 對話框腳本）

**Files:**
- Create: `Scripts/Dialogue/DialogueBox.cs`

- [ ] **Step 1: Write implementation**

`Scripts/Dialogue/DialogueBox.cs`:

```csharp
using System.Collections.Immutable;
using Godot;
using ProjectRondo.Domain.Dialogue;
using R3;

namespace ProjectRondo.Dialogue;

/// <summary>Presents a <see cref="DialogueSession"/>: speaker name, portrait, a typewritten line, and choice buttons.</summary>
public partial class DialogueBox : Control
{
	private const float CharactersPerSecond = 40f;

	private Label _name = null!;
	private RichTextLabel _line = null!;
	private VBoxContainer _choices = null!;
	private TextureRect _portrait = null!;
	private PortraitLibrary _library = null!;

	private DialogueSession? _session;
	private readonly List<IDisposable> _bindings = new();
	private float _revealed;
	private bool _typing;

	public override void _Ready()
	{
		_name = GetNode<Label>("%NameLabel");
		_line = GetNode<RichTextLabel>("%LineText");
		_choices = GetNode<VBoxContainer>("%ChoiceContainer");
		_portrait = GetNode<TextureRect>("%PortraitRect");
		_library = PortraitLibrary.Neutral();
		Hide();
	}

	/// <summary>Binds and shows the dialogue for <paramref name="session"/>.</summary>
	public void Open(DialogueSession session)
	{
		_session = session;
		_bindings.Add(session.Speaker.Subscribe(speaker => _name.Text = speaker.Name));
		_bindings.Add(session.Portrait.Subscribe(key => _portrait.Texture = _library.Resolve(key)));
		_bindings.Add(session.Line.Subscribe(StartTypewriter));
		_bindings.Add(session.Choices.Subscribe(RebuildChoices));
		_bindings.Add(session.IsFinished.Subscribe(finished => { if (finished) Close(); }));
		Show();
	}

	public override void _Process(double delta)
	{
		if (!_typing) return;

		_revealed += CharactersPerSecond * (float)delta;
		_line.VisibleCharacters = (int)_revealed;
		if (_revealed >= _line.Text.Length)
		{
			CompleteLine();
		}
	}

	public override void _UnhandledInput(InputEvent @event)
	{
		var advance = @event.IsActionPressed("ui_accept")
			|| @event is InputEventMouseButton { Pressed: true, ButtonIndex: MouseButton.Left };
		if (!advance || _session is null) return;

		if (_typing)
		{
			CompleteLine();
		}
		else
		{
			_session.Advance();
		}
		GetViewport().SetInputAsHandled();
	}

	private void StartTypewriter(string line)
	{
		_line.Text = line;
		_line.VisibleCharacters = 0;
		_revealed = 0f;
		_typing = line.Length > 0;
	}

	private void CompleteLine()
	{
		_line.VisibleCharacters = -1;
		_typing = false;
	}

	private void RebuildChoices(ImmutableArray<DialogueChoice> choices)
	{
		foreach (var child in _choices.GetChildren())
		{
			child.QueueFree();
		}

		for (var index = 0; index < choices.Length; index++)
		{
			var captured = index;
			var button = new Button { Text = choices[index].Label };
			button.Pressed += () => _session?.Select(captured);
			_choices.AddChild(button);
		}

		_choices.Visible = choices.Length > 0;
	}

	private void Close()
	{
		foreach (var binding in _bindings)
		{
			binding.Dispose();
		}
		_bindings.Clear();
		_session = null;
		Hide();
	}

	public override void _ExitTree() => Close();
}
```

- [ ] **Step 2: Compile-check**

Run: `DOTNET_ROLL_FORWARD=Major dotnet build ProjectRondo.csproj`
Expected: `建置成功`, 0 errors.

- [ ] **Step 3: Commit**

```bash
git add Scripts/Dialogue/DialogueBox.cs
git commit -m "$(printf 'Add DialogueBox control bound to DialogueSession (#3)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 6: `DialogueBox.tscn`（對話框場景）

**Files:**
- Create: `Scenes/UI/DialogueBox.tscn`

（節點名稱/型別必須對應 Task 5 的 `GetNode` 唯一名稱：`%NameLabel`/`%LineText`/`%ChoiceContainer`/`%PortraitRect`。版面 anchor 由使用者在編輯器微調；此處求「節點結構正確、可載入」。）

- [ ] **Step 1: Write the scene**

`Scenes/UI/DialogueBox.tscn`:

```
[gd_scene load_steps=2 format=3]

[ext_resource type="Script" path="res://Scripts/Dialogue/DialogueBox.cs" id="1_box"]

[node name="DialogueBox" type="Control"]
layout_mode = 3
anchors_preset = 15
anchor_right = 1.0
anchor_bottom = 1.0
grow_horizontal = 2
grow_vertical = 2
script = ExtResource("1_box")

[node name="PortraitRect" type="TextureRect" parent="."]
unique_name_in_owner = true
layout_mode = 1
anchors_preset = 2
anchor_top = 1.0
anchor_bottom = 1.0
offset_left = 40.0
offset_top = -900.0
offset_right = 640.0
offset_bottom = -20.0
grow_vertical = 0
expand_mode = 1
stretch_mode = 5

[node name="Panel" type="PanelContainer" parent="."]
layout_mode = 1
anchors_preset = 12
anchor_top = 1.0
anchor_right = 1.0
anchor_bottom = 1.0
offset_top = -240.0
grow_horizontal = 2
grow_vertical = 0

[node name="Margin" type="MarginContainer" parent="Panel"]
layout_mode = 2
theme_override_constants/margin_left = 32
theme_override_constants/margin_top = 16
theme_override_constants/margin_right = 32
theme_override_constants/margin_bottom = 16

[node name="VBox" type="VBoxContainer" parent="Panel/Margin"]
layout_mode = 2

[node name="NameLabel" type="Label" parent="Panel/Margin/VBox"]
unique_name_in_owner = true
layout_mode = 2
text = "說話者"

[node name="LineText" type="RichTextLabel" parent="Panel/Margin/VBox"]
unique_name_in_owner = true
layout_mode = 2
size_flags_vertical = 3
fit_content = true
bbcode_enabled = false

[node name="ChoiceContainer" type="VBoxContainer" parent="Panel/Margin/VBox"]
unique_name_in_owner = true
layout_mode = 2
```

- [ ] **Step 2: Sanity-check the scene loads (compile still green)**

Run: `DOTNET_ROLL_FORWARD=Major dotnet build ProjectRondo.csproj`
Expected: `建置成功`（腳本未變，確認 repo 仍可建置）。場景實際載入由 Task 9 在編輯器驗收。

- [ ] **Step 3: Commit**

```bash
git add Scenes/UI/DialogueBox.tscn
git commit -m "$(printf 'Add DialogueBox scene (#3)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 7: 匯入立繪資產 `knight_idle.png`

**Files:**
- Create: `Assets/Portraits/knight_idle.png`（從 `~/Downloads/knight_idle.png` 複製）

- [ ] **Step 1: Copy the asset into the project**

```bash
mkdir -p Assets/Portraits
cp ~/Downloads/knight_idle.png Assets/Portraits/knight_idle.png
ls -la Assets/Portraits/knight_idle.png
```
Expected: 檔案存在（約 2.3 MB，2048×3072 RGBA）。

- [ ] **Step 2: Commit the asset**

```bash
git add Assets/Portraits/knight_idle.png
git commit -m "$(printf 'Add neutral knight portrait asset (#3)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

> **編輯器手動步驟（Task 9 驗收時）**：在 Godot 編輯器開啟專案一次，讓它為 `knight_idle.png` 產生 `.import`（`GD.Load` 才載得到）；產生後把 `Assets/Portraits/knight_idle.png.import` 一併 commit。

---

## Task 8: 臨時觸發 `DialogueDemo`（腳本 + 場景）

**Files:**
- Create: `Scripts/Dialogue/DialogueDemo.cs`
- Create: `Scenes/UI/DialogueDemo.tscn`

- [ ] **Step 1: Write the harness script**

`Scripts/Dialogue/DialogueDemo.cs`:

```csharp
using Godot;
using ProjectRondo.Domain.Dialogue;

namespace ProjectRondo.Dialogue;

/// <summary>
/// Temporary harness until card #2 wires NPC triggers: on ready it builds a sample dialogue and opens it
/// in the child <see cref="DialogueBox"/>. Delete this scene and script once NPC interaction drives dialogues.
/// </summary>
public partial class DialogueDemo : Node
{
	private DialogueSession? _session;

	public override void _Ready()
	{
		_session = new DialogueSession(SampleGraph());
		GetNode<DialogueBox>("DialogueBox").Open(_session);
	}

	public override void _ExitTree() => _session?.Dispose();

	private static DialogueGraph SampleGraph()
	{
		var nina = new Speaker("Nina");
		var normal = new PortraitKey("normal");
		var greet = new DialogueNode(new NodeId("greet"), nina, "哈囉，旅人！", normal, NodeExit.Line(new NodeId("ask")));
		var ask = new DialogueNode(new NodeId("ask"), nina, "要走哪條路？", normal,
			NodeExit.Branch(new DialogueChoice("左邊", new NodeId("left")), new DialogueChoice("右邊", new NodeId("right"))));
		var left = new DialogueNode(new NodeId("left"), nina, "走左邊，一路小心。", normal, NodeExit.End);
		var right = new DialogueNode(new NodeId("right"), nina, "走右邊，祝你好運。", normal, NodeExit.End);

		return DialogueGraph.FromNodes(greet.Id, greet, ask, left, right);
	}
}
```

- [ ] **Step 2: Write the harness scene**

`Scenes/UI/DialogueDemo.tscn`:

```
[gd_scene load_steps=3 format=3]

[ext_resource type="Script" path="res://Scripts/Dialogue/DialogueDemo.cs" id="1_demo"]
[ext_resource type="PackedScene" path="res://Scenes/UI/DialogueBox.tscn" id="2_box"]

[node name="DialogueDemo" type="Node"]
script = ExtResource("1_demo")

[node name="DialogueBox" parent="." instance=ExtResource("2_box")]
```

- [ ] **Step 3: Compile-check**

Run: `DOTNET_ROLL_FORWARD=Major dotnet build ProjectRondo.csproj`
Expected: `建置成功`, 0 errors.

- [ ] **Step 4: Commit**

```bash
git add Scripts/Dialogue/DialogueDemo.cs Scenes/UI/DialogueDemo.tscn
git commit -m "$(printf 'Add temporary DialogueDemo harness scene (#3)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 9: 全套驗證 + 原則審查 + 使用者編輯器驗收

**Files:** 無新增；驗證與審查。

- [ ] **Step 1: Domain 測試全綠**

Run: `DOTNET_ROLL_FORWARD=Major dotnet test tests/ProjectRondo.Domain.Tests/ProjectRondo.Domain.Tests.csproj`
Expected: 既有 47 + 新增 10（`DialogueSessionTests`，含審查後補的兩個 distinct 契約測試）= 57 passed，失敗 0。

- [ ] **Step 2: Godot 表現層 compile-check 全綠**

Run: `DOTNET_ROLL_FORWARD=Major dotnet build ProjectRondo.csproj`
Expected: `建置成功`, 0 errors, 0 warnings。

- [ ] **Step 3: Principle review** — 用 `reviewing-code` skill 對本分支 diff 檢查 18 條 + TDD/DDD/functional/reactive lenses。特別注意：`DialogueSession` 是否純（無 Godot/timer）、衍生串流是否 derive 而非手動同步（#13）、`DialogueBox` 的迴圈是否落在 #8 例外（Godot 節點副作用/index-coupled）、XML summary（#17）、空集合 `[]`（#18）。修正發現的問題並補測試。

- [ ] **Step 4: 使用者在 Godot 編輯器手動驗收**（無法在此自動化）

交給使用者依序確認：
1. 開啟 Godot 編輯器，讓 `knight_idle.png` 完成匯入（產生 `.import`，並 commit）。
2. 執行 `Scenes/UI/DialogueDemo.tscn`。
3. 驗收清單：
   - 立繪（普通表情）顯示於側邊。
   - 說話者名「Nina」、台詞逐字出現。
   - 打字中按 `Enter`/點擊 → 整行瞬間補完；再按 → 前進。
   - 走到分支出現「左邊 / 右邊」按鈕；點選 → 進入對應結局台詞。
   - 走到結局再前進 → 對話框關閉。

- [ ] **Step 5: Final commit（若審查或驗收有修正）**

```bash
git add -A
git commit -m "$(printf 'Address review and editor verification for dialogue UI (#3)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## 驗收對照（卡片 #3）

- `Control` 對話框（說話者名/立繪/逐字/選項按鈕）→ Task 5、6。
- R3 `ReactiveProperty` 綁定當前節點/選項、事件驅動 → Task 1、2（`DialogueSession` 衍生串流）、Task 5（訂閱）。
- 選項輸入回傳 Domain 推進 → Task 5 `RebuildChoices` → `session.Select(i)`。
- 立繪依情緒 key 切換 → Task 4 `PortraitLibrary`（本卡片普通表情 + fallback；#4 補齊）。
- TDD → Task 1–3 domain 測試；表現層 compile-check + 使用者編輯器驗收（Task 9）。
