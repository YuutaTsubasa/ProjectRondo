namespace ProjectRondo.Domain.Dialogue;

/// <summary>One line of dialogue: who says it, the text, the portrait to show, and where it leads.</summary>
public sealed record DialogueNode(NodeId Id, Speaker Speaker, string Line, PortraitKey Portrait, NodeExit Exit);
