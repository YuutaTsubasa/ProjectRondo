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
