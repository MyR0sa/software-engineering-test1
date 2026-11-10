import path from 'node:path';
import fs from 'node:fs';
import { TrajectoryEvent } from '../core/events';
import { Session } from './types';

interface PersistedSessionMeta {
  id: string;
  title: string;
  createdAt: number;
  workingDirectory: string;
}

/**
 * Append-only JSONL persistence. Each session's trajectory is one line per
 * event; the index file stores session metadata. On boot, sessions are
 * replayed from disk — this is the "recover by replay" model.
 */
export class SessionPersistence {
  private readonly dir: string;
  private readonly indexFile: string;
  private readonly writeQueues = new Map<string, Promise<void>>();

  constructor(baseDir: string) {
    this.dir = path.join(baseDir, '.harness', 'sessions');
    this.indexFile = path.join(baseDir, '.harness', 'index.json');
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private fileFor(id: string): string {
    return path.join(this.dir, `${id}.jsonl`);
  }

  async writeMeta(s: Session): Promise<void> {
    const metas = this.readIndex();
    const meta: PersistedSessionMeta = {
      id: s.id,
      title: s.title,
      createdAt: s.createdAt,
      workingDirectory: s.workingDirectory,
    };
    const i = metas.findIndex((m) => m.id === s.id);
    if (i >= 0) metas[i] = meta;
    else metas.push(meta);
    await fs.promises.writeFile(this.indexFile, JSON.stringify(metas, null, 2));
  }

  /** Serialise writes per session so JSONL lines stay in order. */
  writeEvent(id: string, e: TrajectoryEvent): Promise<void> {
    const prev = this.writeQueues.get(id) ?? Promise.resolve();
    const next = prev.then(() =>
      fs.promises.appendFile(this.fileFor(id), JSON.stringify(e) + '\n'),
    );
    this.writeQueues.set(id, next.catch(() => undefined));
    return next.catch(() => undefined);
  }

  async loadAll(): Promise<Session[]> {
    const metas = this.readIndex();
    const sessions: Session[] = [];
    for (const m of metas) {
      let events: TrajectoryEvent[] = [];
      try {
        const txt = await fs.promises.readFile(this.fileFor(m.id), 'utf8');
        events = txt
          .split('\n')
          .filter((l) => l.trim())
          .map((l) => JSON.parse(l) as TrajectoryEvent);
      } catch {
        // No log yet — start with an empty trajectory.
      }
      fs.mkdirSync(m.workingDirectory, { recursive: true });
      sessions.push({
        id: m.id,
        title: m.title,
        createdAt: m.createdAt,
        workingDirectory: m.workingDirectory,
        events,
      });
    }
    return sessions;
  }

  private readIndex(): PersistedSessionMeta[] {
    try {
      return JSON.parse(fs.readFileSync(this.indexFile, 'utf8')) as PersistedSessionMeta[];
    } catch {
      return [];
    }
  }
}
