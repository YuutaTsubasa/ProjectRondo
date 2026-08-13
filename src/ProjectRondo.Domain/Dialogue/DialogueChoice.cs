namespace ProjectRondo.Domain.Dialogue;

/// <summary>A branch option: a label the player picks, and the node it leads to.</summary>
public readonly record struct DialogueChoice(string Label, NodeId Target);
