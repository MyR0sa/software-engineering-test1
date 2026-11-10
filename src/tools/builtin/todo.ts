import { Tool } from '../types';

interface TodoItem {
  text: string;
  done?: boolean;
}

export const todoTool: Tool = {
  name: 'todo_write',
  description: 'Create and update a task list for the current session.',
  inputSchema: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        description: 'The full task list (replaces the previous list).',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            done: { type: 'boolean' },
          },
          required: ['text'],
        },
      },
    },
    required: ['todos'],
  },
  async execute(input, tctx) {
    const todos = (input.todos ?? []) as TodoItem[];
    // Publish a plugin-specific event so the UI can render the live task list.
    tctx.bus.emit('todo.updated', { todos }, tctx.sessionId);
    const lines = todos.map((t, i) => `${i + 1}. [${t.done ? 'x' : ' '}] ${t.text}`);
    return { content: lines.join('\n') || '(no tasks)', meta: { todos } };
  },
};
