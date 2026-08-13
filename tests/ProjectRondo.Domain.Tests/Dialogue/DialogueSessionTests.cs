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
