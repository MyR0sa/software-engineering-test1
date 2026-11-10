import fs from 'node:fs';
import path from 'node:path';
import { Tool } from '../types';

export const listDirTool: Tool = {
  name: 'list_dir',
  description: 'List the contents of a directory inside the session workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory path relative to the session working directory.' },
    },
  },
  async execute(input, tctx) {
    try {
      const p = tctx.sandbox.resolveIn(tctx.workingDirectory, String(input.path ?? '.'));
      const entries = await fs.promises.readdir(p, { withFileTypes: true });
      const lines = entries.map((e) => `${e.isDirectory() ? 'DIR ' : 'FILE'} ${e.name}`);
      return {
        content: lines.join('\n') || '(empty directory)',
        meta: { path: p, count: entries.length },
      };
    } catch (err) {
      return { content: `list_dir failed: ${(err as Error).message}`, isError: true };
    }
  },
};

export const readFileTool: Tool = {
  name: 'read_file',
  description: 'Read a UTF-8 text file inside the session workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to the session working directory.' },
    },
    required: ['path'],
  },
  async execute(input, tctx) {
    try {
      const p = tctx.sandbox.resolveIn(tctx.workingDirectory, String(input.path ?? ''));
      const content = await fs.promises.readFile(p, 'utf8');
      const truncated = content.length > 20_000 ? content.slice(0, 20_000) + '\n...(truncated)' : content;
      return { content: truncated || '(empty file)', meta: { path: p, bytes: Buffer.byteLength(content) } };
    } catch (err) {
      return { content: `read_file failed: ${(err as Error).message}`, isError: true };
    }
  },
};

export const writeFileTool: Tool = {
  name: 'write_file',
  description: 'Create or overwrite a UTF-8 text file inside the session workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to the session working directory.' },
      content: { type: 'string', description: 'Text content to write.' },
    },
    required: ['path', 'content'],
  },
  async execute(input, tctx) {
    try {
      const p = tctx.sandbox.resolveIn(tctx.workingDirectory, String(input.path ?? ''));
      const content = String(input.content ?? '');
      await fs.promises.mkdir(path.dirname(p), { recursive: true });
      await fs.promises.writeFile(p, content, 'utf8');
      return {
        content: `wrote ${Buffer.byteLength(content)} bytes to ${path.basename(p)}`,
        meta: { path: p, bytes: Buffer.byteLength(content) },
      };
    } catch (err) {
      return { content: `write_file failed: ${(err as Error).message}`, isError: true };
    }
  },
};
