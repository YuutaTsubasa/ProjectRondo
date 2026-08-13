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
