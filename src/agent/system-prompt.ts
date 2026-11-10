import { ToolDef } from '../llm/types';

/** Assemble the system prompt from the current tool surface + clock. */
export function buildSystemPrompt(input: { tools: ToolDef[]; date: Date }): string {
  const toolList = input.tools
    .map((t) => `- ${t.name}: ${t.description}`)
    .join('\n');

  return [
    'You are a helpful agent running on an "everything is a plugin" harness.',
    'The model adapter, tool registry, session log and even your own agent loop are replaceable plugins.',
    '',
    `Current time: ${input.date.toISOString()}.`,
    '',
    'Available tools:',
    toolList || '(none)',
    '',
    'Guidelines:',
    '- Use a tool whenever the user asks for an action (files, shell, tasks, delegation).',
    '- Prefer concrete tool calls over guessing; report the tool result back to the user.',
    '- When no tool is needed, answer directly and concisely.',
  ].join('\n');
}
