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

	[Fact]
	public void Advance_FromLine_MovesToTheNextNode()
	{
		var state = DialoguePlayback.Start(Graph);

		var next = DialoguePlayback.Step(Graph, state, DialogueInput.Advance);

		Assert.True(next.IsAwaitingChoice);
		Assert.Equal(DialogueGraphFixture.Ask, next.AsAwaitingChoice.Current.Id);
		Assert.Equal(2, next.AsAwaitingChoice.Choices.Length);
	}

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

	[Fact]
	public void Advance_ToAMissingNode_IsANoOp()
	{
		var speaker = new Speaker("Nina");
		var dangling = new DialogueNode(new NodeId("start"), speaker, "…", new PortraitKey("smile"), NodeExit.Line(new NodeId("nowhere")));
		var graph = DialogueGraph.FromNodes(dangling.Id, dangling);
		var state = DialoguePlayback.Start(graph);

		var result = DialoguePlayback.Step(graph, state, DialogueInput.Advance);

		Assert.Same(state, result);
	}
}
