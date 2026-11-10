import { TrajectoryEvent } from '../core/events';

/**
 * A session owns a working directory and an append-only event log (the
 * trajectory). Its message history is never stored directly — it is always a
 * *projection* of the event log, so replay/recovery is exact by construction.
 */
export interface Session {
  id: string;
  title: string;
  createdAt: number;
  workingDirectory: string;
  events: TrajectoryEvent[];
}
