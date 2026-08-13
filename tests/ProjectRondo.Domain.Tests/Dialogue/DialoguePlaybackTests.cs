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
}
