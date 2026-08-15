using Godot;
using ProjectRondo.Domain.Dialogue;

namespace ProjectRondo.Dialogue;

/// <summary>
/// Temporary harness until card #2 wires NPC triggers: on ready it builds a sample dialogue and opens it
/// in the child <see cref="DialogueBox"/>. Delete this scene and script once NPC interaction drives dialogues.
/// </summary>
public partial class DialogueDemo : Node
{
	private DialogueSession? _session;

	public override void _Ready()
	{
		_session = new DialogueSession(SampleGraph());
		GetNode<DialogueBox>("DialogueBox").Open(_session);
	}

	public override void _ExitTree() => _session?.Dispose();

	private static DialogueGraph SampleGraph()
	{
		var nina = new Speaker("Nina");
		var normal = new PortraitKey("normal");
		var greet = new DialogueNode(new NodeId("greet"), nina, "哈囉，旅人！", normal, NodeExit.Line(new NodeId("ask")));
		var ask = new DialogueNode(new NodeId("ask"), nina, "要走哪條路？", normal,
			NodeExit.Branch(new DialogueChoice("左邊", new NodeId("left")), new DialogueChoice("右邊", new NodeId("right"))));
		var left = new DialogueNode(new NodeId("left"), nina, "走左邊，一路小心。", normal, NodeExit.End);
		var right = new DialogueNode(new NodeId("right"), nina, "走右邊，祝你好運。", normal, NodeExit.End);

		return DialogueGraph.FromNodes(greet.Id, greet, ask, left, right);
	}
}
