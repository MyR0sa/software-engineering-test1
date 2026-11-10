import path from 'node:path';
import fs from 'node:fs';
import { EventBus, TrajectoryEvent, EVENTS } from '../core/events';
import { uid } from '../core/ids';
import { LlmMessage } from '../llm/types';
import { Session } from './types';
import { SessionPersistence } from './persistence';
import { projectMessages } from './projection';

/**
 * The session store is the source of truth for every session's trajectory. It
 * subscribes to the bus once and records every session-scoped event into the
 * append-only log (and to disk). History is always re-derived by projection.
 */
export class SessionStore {
  private sessions = new Map<string, Session>();
  private unsubscribe: () => void;

  constructor(
    private bus: EventBus,
    private workspaceRoot: string,
    private persistence: SessionPersistence,
  ) {
    this.unsubscribe = bus.onAny((e) => this.record(e));
  }

  async init(): Promise<void> {
    for (const s of await this.persistence.loadAll()) {
      this.sessions.set(s.id, s);
      this.bus.emit(EVENTS.sessionLoaded, { id: s.id, title: s.title }, s.id);
    }
  }

  private record(e: TrajectoryEvent): void {
    if (e.sessionId === 'system') return;
    const s = this.sessions.get(e.sessionId);
    if (!s) return;
    s.events.push(e);
    void this.persistence.writeEvent(e.sessionId, e);
  }

  createSession(title?: string): Session {
    const id = uid('ses');
    const workingDirectory = path.join(this.workspaceRoot, 'sessions', id);
    fs.mkdirSync(workingDirectory, { recursive: true });
    const session: Session = {
      id,
      title: title?.trim() || '新会话',
      createdAt: Date.now(),
      workingDirectory,
      events: [],
    };
    this.sessions.set(id, session);
    void this.persistence.writeMeta(session);
    this.bus.emit(EVENTS.sessionCreated, { id, title: session.title, workingDirectory }, id);
    return session;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  list(): Session[] {
    return [...this.sessions.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  getEvents(id: string): TrajectoryEvent[] {
    return this.sessions.get(id)?.events ?? [];
  }

  getHistory(id: string): LlmMessage[] {
    const s = this.sessions.get(id);
    return s ? projectMessages(s.events) : [];
  }

  dispose(): void {
    this.unsubscribe();
  }
}
