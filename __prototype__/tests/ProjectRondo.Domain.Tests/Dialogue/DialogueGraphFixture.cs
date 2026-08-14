using ProjectRondo.Domain.Dialogue;

namespace ProjectRondo.Domain.Tests.Dialogue;

/// <summary>A small dialogue used across playback tests: one line, a two-way branch, two endings.</summary>
internal static class DialogueGraphFixture
{
	public static readonly NodeId Greet = new("greet");
	public static readonly NodeId Ask = new("ask");
	public static readonly NodeId Left = new("left");
	public static readonly NodeId Right = new("right");

	public static readonly DialogueChoice GoLeft = new("左邊", Left);
	public static readonly DialogueChoice GoRight = new("右邊", Right);

	public static DialogueGraph Build()
	{
		var speaker = new Speaker("Nina");
		var greet = new DialogueNode(Greet, speaker, "哈囉！", new PortraitKey("smile"), NodeExit.Line(Ask));
		var ask = new DialogueNode(Ask, speaker, "要走哪條路？", new PortraitKey("think"), NodeExit.Branch(GoLeft, GoRight));
		var left = new DialogueNode(Left, speaker, "走左邊。", new PortraitKey("smile"), NodeExit.End);
		var right = new DialogueNode(Right, speaker, "走右邊。", new PortraitKey("smile"), NodeExit.End);

		return DialogueGraph.FromNodes(Greet, greet, ask, left, right);
	}
}
