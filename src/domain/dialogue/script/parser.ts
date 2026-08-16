import { type DialogueGraph, fromNodes, validate } from '../dialogueGraph';
import { type DialogueNode } from '../dialogueNode';
import { type NodeExit, linearExit, branchExit, END_EXIT } from '../nodeExit';
import { nodeId } from '../nodeId';
import { speaker } from '../speaker';
import { portraitKey } from '../portraitKey';
import { dialogueChoice } from '../dialogueChoice';
import { tokenize } from './lexer';
import { type ParseError } from './parseError';

interface Building {
  id: string;
  speaker: string;
  line: string;
  portrait: string;
  exit: NodeExit | undefined; // undefined = not yet set (auto-chain candidate)
}

const DEFAULT_PORTRAIT = 'normal';

/** Compiles DSL source into a DialogueGraph. Returns the graph (if any nodes) and all authoring errors. */
export const parse = (source: string): { graph: DialogueGraph | undefined; errors: readonly ParseError[] } => {
  const tokens = tokenize(source);
  const nodes: Building[] = [];
  const errors: ParseError[] = [];
  const labels = new Set<string>();
  let pendingLabel: string | undefined;
  let pendingLabelLine = 0;
  let auto = 0;

  const prev = (): Building | undefined => nodes[nodes.length - 1];

  for (const t of tokens) {
    switch (t.kind) {
      case 'label': {
        if (pendingLabel !== undefined) errors.push({ kind: 'labelWithoutLine', id: pendingLabel, line: pendingLabelLine });
        if (labels.has(t.id)) errors.push({ kind: 'duplicateLabel', id: t.id, line: t.line });
        labels.add(t.id);
        pendingLabel = t.id;
        pendingLabelLine = t.line;
        break;
      }
      case 'line': {
        if (t.speaker === '') { errors.push({ kind: 'emptyLine', line: t.line }); break; }
        const previous = prev();
        const id = pendingLabel ?? `#${auto++}`;
        pendingLabel = undefined;
        if (previous && previous.exit === undefined) previous.exit = linearExit(nodeId(id)); // auto-chain
        nodes.push({ id, speaker: t.speaker, line: t.text, portrait: t.portrait ?? DEFAULT_PORTRAIT, exit: undefined });
        break;
      }
      case 'goto': {
        const previous = prev();
        if (!previous) { errors.push({ kind: 'gotoWithoutLine', line: t.line }); break; }
        previous.exit = t.target === 'END' ? END_EXIT : linearExit(nodeId(t.target));
        break;
      }
      case 'choice': {
        const previous = prev();
        if (!previous) { errors.push({ kind: 'choiceWithoutLine', line: t.line }); break; }
        // A choice target is always a NodeId (choices carry no exit), so `* leave -> END` is treated
        // as a jump to a node literally named "END" and surfaces as a danglingReference from validate().
        // To end after a choice, point it at a labelled node whose own exit is `-> END`.
        const choice = dialogueChoice(t.text, nodeId(t.target));
        previous.exit =
          previous.exit && previous.exit.kind === 'branch'
            ? branchExit([...previous.exit.choices, choice])
            : branchExit([choice]);
        break;
      }
      default: {
        const _exhaustive: never = t;
        break;
      }
    }
  }
  if (pendingLabel !== undefined) errors.push({ kind: 'labelWithoutLine', id: pendingLabel, line: pendingLabelLine });

  if (nodes.length === 0) {
    // Empty or comments-only source: surface a diagnostic instead of a silent `undefined`.
    if (errors.length === 0) errors.push({ kind: 'emptyScript' });
    return { graph: undefined, errors };
  }

  const built: DialogueNode[] = nodes.map((n) => ({
    id: nodeId(n.id),
    speaker: speaker(n.speaker),
    line: n.line,
    portrait: portraitKey(n.portrait),
    exit: n.exit ?? END_EXIT, // trailing node with no explicit exit ends the dialogue
  }));
  const graph = fromNodes(nodeId(nodes[0].id), built);
  // A duplicate label (or any other syntactic problem) can make `built` silently
  // drop or misattribute nodes via the id-keyed Map in fromNodes — don't hand back
  // a graph that may not reflect the source. validate() errors (dangling/unreachable)
  // are about a graph we DID build correctly, so those stay non-fatal.
  const hadSyntaxErrors = errors.length > 0;
  errors.push(...validate(graph));
  return { graph: hadSyntaxErrors ? undefined : graph, errors };
};
