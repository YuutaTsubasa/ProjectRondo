using ProjectRondo.Domain.Dialogue;

namespace ProjectRondo.Domain.Tests.Dialogue;

public sealed class DialogueGraphTests
{
	[Fact]
	public void FromNodes_IndexesNodesById_AndKeepsTheStartId()
	{
		var greet = new DialogueNode(new NodeId("greet"), new Speaker("Nina"), "哈囉！", new PortraitKey("smile"), NodeExit.End);
		var ask = new DialogueNode(new NodeId("ask"), new Speaker("Nina"), "在嗎？", new PortraitKey("think"), NodeExit.End);

		var graph = DialogueGraph.FromNodes(greet.Id, greet, ask);

		Assert.Equal(greet.Id, graph.StartId);
		Assert.Equal(2, graph.Nodes.Count);
		Assert.Same(ask, graph.Nodes[new NodeId("ask")]);
	}
}
