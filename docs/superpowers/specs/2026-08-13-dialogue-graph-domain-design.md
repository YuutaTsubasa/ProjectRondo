# 對話圖 Domain 模型 — 設計文件

- **卡片**：[#1 對話圖 Domain 模型（TDD）](https://github.com/YuutaTsubasa/ProjectRondo/issues/1)
- **日期**：2026-08-13
- **位置**：`src/ProjectRondo.Domain/Dialogue/`
- **測試**：`tests/ProjectRondo.Domain.Tests/Dialogue/`
- **工程取向**：TDD + DDD + Functional + Reactive（純 C#，無 Godot 依賴）

## 目標

以純 C# 建立對話圖模型與純函式推進，供 M2 對話系統使用：

- NPC 互動（#2）觸發對話。
- 對話 UI（#3）以 R3 `ReactiveProperty` 綁定對話狀態，事件驅動渲染。

領域層只負責「對話圖的資料結構」與「推進規則」，不涉及 tween、輸入來源、渲染。

## 核心型別（皆不可變值型別，遵循原則 #15 值語意）

| 型別 | 定義 | 說明 |
| --- | --- | --- |
| `NodeId` | `readonly record struct NodeId(string Value)` | 節點識別，值語意 |
| `Speaker` | `readonly record struct Speaker(string Name)` | 說話者 |
| `PortraitKey` | `readonly record struct PortraitKey(string Value)` | 情緒/立繪 key |
| `DialogueChoice` | `readonly record struct DialogueChoice(string Label, NodeId Target)` | 一個分支選項 |
| `DialogueNode` | `sealed record DialogueNode(NodeId Id, Speaker Speaker, string Line, PortraitKey Portrait, NodeExit Exit)` | 一個對話節點 |
| `DialogueGraph` | `sealed record DialogueGraph(ImmutableDictionary<NodeId, DialogueNode> Nodes, NodeId StartId)` | 整張對話圖 |

### 節點出口 `NodeExit`

用 `OneOf` 表達節點後續走向的三態：

```csharp
// OneOf<LinearExit, BranchExit, EndExit>
LinearExit(NodeId Next)                          // 線性，下一句
BranchExit(ImmutableArray<DialogueChoice> Choices) // 分支選擇
EndExit                                            // 結束
```

- `BranchExit` 至少一個選項（由建構時保證）。
- 便利建構子：`NodeExit.Line(next)`、`NodeExit.Branch(choices)`、`NodeExit.End`。

## 推進：純函式 `(state, input) -> nextState`（方向 A）

對話進行中的觀察狀態本身即為三態聯集，UI 可直接綁定：

```csharp
// DialogueState = OneOf<Speaking, AwaitingChoice, Ended>
Speaking(DialogueNode Current)                                       // 線性台詞，等待「繼續」
AwaitingChoice(DialogueNode Current, ImmutableArray<DialogueChoice> Choices) // 等待選擇
Ended(DialogueNode Last)                                             // 結束（保留最後一句供顯示）

// DialogueInput = OneOf<Advance, Select>
Advance                 // 推進到下一句（僅對 Speaking 有效）
Select(int Index)       // 選擇分支（僅對 AwaitingChoice 有效）
```

推進函式（純靜態，比照既有 `CharacterMovement.Step` 風格）：

```csharp
public static class DialoguePlayback
{
    public static DialogueState Start(DialogueGraph graph);
    public static DialogueState Step(DialogueGraph graph, DialogueState state, DialogueInput input);
}
```

`Step` 的語意（以 exhaustive pattern matching / switch expression 實作，原則 #11/#12）：

| 目前 state | 輸入 | 結果 |
| --- | --- | --- |
| `Speaking`（節點出口 `LinearExit`） | `Advance` | 走到 `Next` 節點對應的 state |
| `Speaking`（節點出口 `EndExit`） | `Advance` | `Ended(該節點)` |
| `AwaitingChoice` | `Select(i)`（i 合法） | 走到 `Choices[i].Target` 節點對應的 state |
| 其餘（非法輸入） | 任意 | **no-op**：回傳原 state 不變 |

節點 → state 的投影（內部輔助）：依 `DialogueNode.Exit` 決定落在 `Speaking` / `AwaitingChoice`。
其中出口為 `LinearExit` 或 `EndExit` → `Speaking`（皆等待 `Advance`）；出口為 `BranchExit` → `AwaitingChoice`。

> `Speaking` 同時涵蓋「線性台詞」與「最後一句」，兩者都以 `Advance` 推進：前者走到下一句，後者走到 `Ended`。是否為最後一句對 UI 是內部細節，不需另設狀態。

### 非法輸入：no-op

在 `AwaitingChoice` 上按 `Advance`、在 `Speaking` 上 `Select`、`Select` 索引越界、`Ended` 後再推進——一律回傳原 state 不變。對 reactive UI 友善（狀態不變則不重繪），且易測試。

## 邊界與錯誤處理

- `DialogueGraph` 內若出口指向不存在的 `NodeId`：屬「圖建構錯誤」，非執行期輸入錯誤。本卡片以「圖由建構者保證完整」為前提；越界的節點參照在 `Step` 遇到時視為 no-op（保守，不丟例外），但不主動做全圖驗證（YAGNI；若後續 #對話圖編輯器 需要再加 `Validate`）。
- 空 `BranchExit`：由 `NodeExit.Branch` 建構子擋下（至少一項），不進入領域。

## 依賴方向

```
DialogueGraph / DialogueNode / NodeExit  (資料)
        ▲
        │ 讀取
DialoguePlayback.Step  (純函式推進)
        ▲
        │ 綁定（#3）
Reactive UI（R3 ReactiveProperty<DialogueState>）—— 不在本卡片範圍
```

## 測試計畫（xUnit，TDD 紅→綠）

`tests/ProjectRondo.Domain.Tests/Dialogue/`：

1. **Start** — `Start(graph)` 落在 `StartId`，型別依起始節點出口為 `Speaking` 或 `AwaitingChoice`。
2. **線性推進** — `Speaking`＋`Advance` → 下一句節點。
3. **走到結束** — 線性鏈最後一句（`EndExit`）＋`Advance` → `Ended`，且保留最後節點。
4. **分支選擇** — `AwaitingChoice`＋`Select(i)` → `Choices[i].Target` 對應 state。
5. **多分支各自到不同目標** — 同一分支節點，不同 `Select` 到不同 `Target`。
6. **非法輸入 no-op**
   - 分支上 `Advance` → 不變。
   - 線性上 `Select` → 不變。
   - `Select` 越界（負值、≥ 數量）→ 不變。
   - `Ended` 後任意輸入 → 不變。
7. **值語意** — 相同內容的 `NodeId`/`DialogueChoice` 相等（record/struct 相等性）。
8. **`NodeExit.Branch` 空選項** — 丟 `ArgumentException`（或等價）。

測試以小型手工建構的對話圖為 fixture（含一段線性 → 一個分支 → 兩個結局）。

## 不做（YAGNI）

- 全圖驗證器 / 對話圖編輯器（另立卡片）。
- 存檔／回溯歷史。
- 變數、條件分支、旗標（若劇情需要再擴充 `NodeExit`）。
- 逐字 tween、輸入來源、Godot 綁定（屬 #2 / #3）。
