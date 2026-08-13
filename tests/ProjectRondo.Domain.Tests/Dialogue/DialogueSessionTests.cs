using System.Collections.Immutable;
using ProjectRondo.Domain.Dialogue;
using R3;

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
}
