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
