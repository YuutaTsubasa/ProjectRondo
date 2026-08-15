using ProjectRondo.Domain.Dialogue;

namespace ProjectRondo.Domain.Tests.Dialogue;

public sealed class DialogueGraphValidationTests
{
	private static readonly Speaker Nina = new("Nina");
	private static readonly PortraitKey Smile = new("smile");

	private static DialogueNode Node(string id, NodeExit exit) => new(new NodeId(id), Nina, "…", Smile, exit);

	[Fact]
	public void AWellFormedGraph_HasNoErrors()
	{
		var errors = DialogueGraphFixture.Build().Validate();

		Assert.Empty(errors);
	}

	[Fact]
	public void AMissingStartNode_IsReported()
	{
		var graph = DialogueGraph.FromNodes(new NodeId("absent"), Node("greet", NodeExit.End));

		var errors = graph.Validate();

		Assert.Contains(errors, error => error.IsMissingStartNode && error.AsMissingStartNode.StartId == new NodeId("absent"));
	}

	[Fact]
	public void ADanglingLinearTarget_IsReported()
	{
		var graph = DialogueGraph.FromNodes(new NodeId("greet"), Node("greet", NodeExit.Line(new NodeId("nowhere"))));

		var errors = graph.Validate();

		Assert.Contains(errors, error => error.IsDanglingReference
			&& error.AsDanglingReference.From == new NodeId("greet")
			&& error.AsDanglingReference.Target == new NodeId("nowhere"));
	}

	[Fact]
	public void ADanglingChoiceTarget_IsReported()
	{
		var branch = NodeExit.Branch(new DialogueChoice("走", new NodeId("gone")));
		var graph = DialogueGraph.FromNodes(new NodeId("ask"), Node("ask", branch));

		var errors = graph.Validate();

		Assert.Contains(errors, error => error.IsDanglingReference && error.AsDanglingReference.Target == new NodeId("gone"));
	}

	[Fact]
	public void AnUnreachableNode_IsReported()
	{
		var graph = DialogueGraph.FromNodes(
			new NodeId("greet"),
			Node("greet", NodeExit.End),
			Node("orphan", NodeExit.End));

		var errors = graph.Validate();

		Assert.Contains(errors, error => error.IsUnreachableNode && error.AsUnreachableNode.Node == new NodeId("orphan"));
	}

	[Fact]
	public void AGraphReachableWithNoDanglingTargets_ReportsNothing()
	{
		var graph = DialogueGraph.FromNodes(new NodeId("greet"), Node("greet", NodeExit.End));

		Assert.Empty(graph.Validate());
	}

	[Fact]
	public void ACycle_TerminatesAndReportsNothing()
	{
		var graph = DialogueGraph.FromNodes(
			new NodeId("a"),
			Node("a", NodeExit.Line(new NodeId("b"))),
			Node("b", NodeExit.Line(new NodeId("a"))));

		Assert.Empty(graph.Validate());
	}

	[Fact]
	public void AMissingStartWithADanglingReference_ReportsBoth_ButNoUnreachable()
	{
		var graph = DialogueGraph.FromNodes(new NodeId("absent"), Node("greet", NodeExit.Line(new NodeId("nowhere"))));

		var errors = graph.Validate();

		Assert.Contains(errors, error => error.IsMissingStartNode);
		Assert.Contains(errors, error => error.IsDanglingReference && error.AsDanglingReference.Target == new NodeId("nowhere"));
		Assert.DoesNotContain(errors, error => error.IsUnreachableNode);
	}
}
