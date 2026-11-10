import { ToolDef } from '../llm/types';
import { Tool, ToolContext, ToolResult } from './types';

/**
 * The tool registry is itself a plugin-provided service. Tools register with a
 * name + JSON Schema + executor; the agent loop asks the registry for the
 * schemas to send to the model, then asks it to execute whatever the model
 * chooses. Adding a tool means registering one, nothing else changes.
 */
export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): this {
    if (this.tools.has(tool.name)) throw new Error(`tool already registered: ${tool.name}`);
    this.tools.set(tool.name, tool);
    return this;
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return [...this.tools.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The model-facing declarations (name + description + schema). */
  defs(): ToolDef[] {
    return this.list().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  async execute(name: string, input: Record<string, unknown>, tctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) return { content: `unknown tool: ${name}`, isError: true };
    return tool.execute(input, tctx);
  }
}
