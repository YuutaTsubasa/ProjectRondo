using ProjectRondo.Domain.Dialogue;

namespace ProjectRondo.Domain.Tests.Dialogue;

public sealed class DialogueValueTypesTests
{
	[Fact]
	public void NodeId_WithSameValue_AreEqual()
	{
		Assert.Equal(new NodeId("intro"), new NodeId("intro"));
		Assert.NotEqual(new NodeId("intro"), new NodeId("outro"));
	}

	[Fact]
	public void DialogueChoice_WithSameContent_AreEqual()
	{
		var left = new DialogueChoice("左邊", new NodeId("left"));
		var right = new DialogueChoice("左邊", new NodeId("left"));

		Assert.Equal(left, right);
	}

	[Fact]
	public void SpeakerAndPortrait_ExposeTheirValues()
	{
		Assert.Equal("Nina", new Speaker("Nina").Name);
		Assert.Equal("smile", new PortraitKey("smile").Value);
	}
}
