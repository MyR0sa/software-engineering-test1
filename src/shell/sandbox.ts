import path from 'node:path';
import fs from 'node:fs';

/**
 * Filesystem confinement. All `read_file`/`write_file`/`list_dir`/`bash` tool
 * paths are resolved against this root and rejected if they escape it. This is
 * the harness' "filesystem capability seam": the policy is a single class, so
 * a stricter or remote sandbox can replace it without touching the tools.
 */
export class Sandbox {
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
    fs.mkdirSync(this.root, { recursive: true });
  }

  /** Resolve a tool-supplied path and enforce it stays inside the root. */
  resolve(inputPath: string): string {
    const abs = path.resolve(this.root, inputPath);
    if (!this.isWithin(abs)) {
      throw new Error(`path escapes sandbox: ${inputPath}`);
    }
    return abs;
  }

  isWithin(p: string): boolean {
    const rel = path.relative(this.root, path.resolve(p));
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel) || rel === '';
  }

  /** Resolve a path *under* a session's working directory. */
  resolveIn(workingDirectory: string, inputPath: string): string {
    const abs = path.resolve(workingDirectory, inputPath);
    if (!this.isWithin(abs)) {
      throw new Error(`path escapes sandbox: ${inputPath}`);
    }
    return abs;
  }
}
