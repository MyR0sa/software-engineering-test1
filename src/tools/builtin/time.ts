import { Tool } from '../types';

/** 回答"现在几点"——纯文本 agent 无法凭空知道时间，需要这个工具去取。 */
export const getTimeTool: Tool = {
    name: 'get_time',
    description: 'Get the current date and time (ISO 8601), optionally offset by hours.',
    inputSchema: {
      type: 'object',
      properties: {
        offsetHours: {
          type: 'number',
          description: 'Hours to add to the current time (e.g. 8 for UTC+8). Default 0.',
        },
      },
    },
    async execute(input) {
      const offset = Number(input.offsetHours ?? 0) || 0;
      const d = new Date(Date.now() + offset * 3600 * 1000);
      return { content: d.toISOString(), meta: { iso: d.toISOString(), offsetHours: offset } };
    },
};