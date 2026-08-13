# 對話 UI（R3 綁定對話狀態）— 設計文件

- **卡片**：[#3 對話 UI（R3 綁定對話狀態）](https://github.com/YuutaTsubasa/ProjectRondo/issues/3)
- **日期**：2026-08-13
- **依賴**：#1 對話圖 Domain（已合併）、#4 角色立繪（未做 → 本卡片先 stub）
- **工程取向**：TDD + DDD + Functional + Reactive，遵循 `docs/engineering-principles.md` 的 18 條原則

## 目標

把已合併的對話 Domain（`DialoguePlayback` 純函式推進）接上 Godot 對話框 UI，以 R3 反應式綁定，事件驅動渲染。

## 分層

本專案是 **2 層**：純 domain（`src/ProjectRondo.Domain/`，可快速測）＋ Godot 表現層（`Scripts/` + `Scenes/`）。

- **Domain（可測核心）**：新增 `DialogueSession`——把純函式 `DialoguePlayback` 包成 R3 反應式狀態。純 C# + R3、**無 Godot、無 timer**。由現有 domain 測試專案 TDD。
- **Presentation（Godot）**：`DialogueBox : Control` 訂閱 session、渲染、做逐字 tween、回送輸入。此層在無 Godot SDK 的 CI/本機環境**無法單元測試**（見「測試邊界」）。

## Domain：`DialogueSession`

位置：`src/ProjectRondo.Domain/Dialogue/DialogueSession.cs`

```csharp
public sealed class DialogueSession : IDisposable
{
    public DialogueSession(DialogueGraph graph);   // ctor 內以 DialoguePlayback.Start 落到初始狀態

    public ReadOnlyReactiveProperty<DialogueState> State { get; }

    // 衍生唯讀串流（derive，不手動同步；#13）。皆 DistinctUntilChanged，只在真的變化時發射。
    public Observable<Speaker> Speaker { get; }
    public Observable<string> Line { get; }
    public Observable<PortraitKey> Portrait { get; }
    public Observable<ImmutableArray<DialogueChoice>> Choices { get; }  // 非 AwaitingChoice → 空
    public Observable<bool> IsFinished { get; }

    public void Advance();          // State ← DialoguePlayback.Step(graph, State.Value, DialogueInput.Advance)
    public void Select(int index);  // State ← DialoguePlayback.Step(graph, State.Value, DialogueInput.Select(index))

    public void Dispose();          // 釋放 State
}
```

實作要點：
- 內部 `ReactiveProperty<DialogueState> _state`，初值 `DialoguePlayback.Start(graph)`。
- `Speaker`/`Line`/`Portrait` 由每個狀態都有的節點投影：`Speaking.Current` / `AwaitingChoice.Current` / `Ended.Last`——一個私有 `CurrentNode(DialogueState) -> DialogueNode`（`Match`）取出，再取 `.Speaker` / `.Line` / `.Portrait`。
- `Choices` = `AwaitingChoice.Choices`，其餘狀態為 `[]`（#18 collection expression）。
- **no-op 天然不重繪**：非法輸入時 `DialoguePlayback.Step` 回傳**同一個** `DialogueState` 參考；R3 `ReactiveProperty<T>` 預設以 `EqualityComparer<T>.Default` 去重，相等即不發射 → 衍生串流也不發射。此契約由測試釘住。

## Presentation：`DialogueBox`

- 腳本：`Scripts/Dialogue/DialogueBox.cs`（`partial class DialogueBox : Control`）
- 場景：`Scenes/UI/DialogueBox.tscn`

節點結構（底部橫向對話框 + 側邊 VN 站立圖）：
- `PortraitRect : TextureRect` — 全身站立圖，垂直靠底、置於一側。
- `Panel`（底部對話框）內：`NameLabel : Label`、`LineText : RichTextLabel`（逐字）、`ChoiceContainer : VBoxContainer`（動態放選項 `Button`）。

行為（訂閱 session 衍生串流）：
- `Speaker` → `NameLabel.Text`。
- `Portrait` → `PortraitRect.Texture = PortraitLibrary.Resolve(key)`。
- `Line` → 重置逐字動畫，從 0 打到整行。
- `Choices` → 清空並依選項重建 `Button`，每顆 `Pressed` 綁 `session.Select(i)`；空集合時清空/隱藏。
- `IsFinished`（true）→ 關閉對話框。

輸入：
- `ui_accept` / 滑鼠點擊 → **若逐字未完成：瞬間補完整行**；否則 `session.Advance()`。
- 分支節點時推進交給選項按鈕；對分支按 `Advance()` 是 domain no-op，無害。

逐字動畫：view 內以 Godot `Tween` 或 `_Process` 逐步揭字，屬表現層（timer），**不進 domain**。

## 立繪解析 `PortraitLibrary`

- 位置：`Scripts/Dialogue/PortraitLibrary.cs`。
- 職責：`PortraitKey → Texture2D`，未知 key **fallback 到普通表情**。
- 目前只有 `knight_idle.png`（普通），匯入 `Assets/Portraits/`。#4 之後補齊表情清單與資源，只需擴充此對應表。

## 臨時觸發（因 #2 未做）

- `Scenes/UI/DialogueDemo.tscn` + `Scripts/Dialogue/DialogueDemo.cs`：一開場建立範例 `DialogueGraph`（一段線性 → 一個二選一分支 → 兩個結局），建 `DialogueSession` 注入 `DialogueBox`，用來自我驗收。
- 明確標註為**臨時**：#2 NPC 觸發接上後移除。不修改 `HubWorld.tscn`。

## 測試 / 驗證邊界

- **TDD（可自動驗，走 domain 測試專案）**：`tests/ProjectRondo.Domain.Tests/Dialogue/DialogueSessionTests.cs`
  - 初始狀態落在起始節點。
  - `Advance` 前進到下一句；`Select(i)` 路由到對應目標。
  - 衍生串流：`Speaker`/`Line`/`Portrait`/`Choices`/`IsFinished` 反映當前狀態。
  - **no-op 不發射**：訂閱 `State`，對分支按 `Advance`、越界 `Select`、結束後推進 → 訂閱計數不增加。
  - `Dispose` 後不再發射。
  - （R3 透過 domain 專案的 PackageReference 傳遞到測試專案可用。）
- **無法自動驗（需你在 Godot 編輯器實跑）**：`DialogueBox.tscn`/`DialogueDemo.tscn`、tween、貼圖、版面。我會產出 `.tscn` 與腳本並盡量 compile-check 表現層，但視覺與互動由你驗收。

## 不做（YAGNI）

- #4 的表情產製、多表情資源（本卡片只 stub 普通表情）。
- #2 的 NPC/範圍觸發、對話中鎖玩家移動（屬 #2）。
- 存檔/對話歷史、文字速度設定選單、多角色同框、語音。

## 驗收對照（卡片 #3）

- `Control` 對話框（說話者名、立繪、逐字、選項按鈕）→ `DialogueBox`。
- R3 `ReactiveProperty` 綁定當前節點/選項、事件驅動 → `DialogueSession` 衍生串流。
- 選項輸入回傳 Domain 推進 → `session.Select(i)` → `DialoguePlayback.Step`。
- 立繪依情緒 key 切換 → `PortraitLibrary.Resolve`（本卡片先普通表情 + fallback）。
