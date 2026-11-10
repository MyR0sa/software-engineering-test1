import { EventBus } from './events';

/**
 * A plugin is a plain function that receives a `Context` and wires itself in:
 * it registers services, subscribes to events, and can schedule cleanup.
 *
 * This is the "everything is a plugin" kernel, modelled after Cordis' core
 * idea (as used by DeepSeek Harness): the model adapter, the tool registry,
 * the session log, the agent loop and even the HTTP gateway are *all* plugins
 * composed into one `Context`. Nothing is privileged — the loop depends on the
 * model/tools/session services exactly the way a user plugin would.
 */
export type Plugin = (ctx: Context) => void | Promise<void>;

type DisposeFn = () => void | Promise<void>;

/** A lazily-resolved service factory with declared dependencies. */
export interface ServiceSpec {
  /** Unique service name (the DI key). */
  name: string;
  /** Names of services to inject, resolved and passed to `factory` in order. */
  deps?: string[];
  /** Receives resolved deps + the context; return the singleton instance. */
  factory: (deps: unknown[], ctx: Context) => unknown;
}

export class Context {
  /** The shared event bus. Plugins read it from here or inject it as "bus". */
  readonly bus = new EventBus();

  private specs = new Map<string, ServiceSpec>();
  private instances = new Map<string, unknown>();
  private disposers: DisposeFn[] = [];
  private plugins: { name: string; fn: Plugin }[] = [];

  // ---- services (dependency injection) -------------------------------------

  /** Register a service factory. Throws if the name is taken. */
  provide(spec: ServiceSpec): this {
    if (this.specs.has(spec.name)) {
      throw new Error(`service already registered: ${spec.name}`);
    }
    this.specs.set(spec.name, spec);
    return this;
  }

  /** Resolve a service by name (cached; injected deps resolve recursively). */
  get<T = unknown>(name: string): T {
    if (this.instances.has(name)) return this.instances.get(name) as T;
    const spec = this.specs.get(name);
    if (!spec) throw new Error(`unknown service: ${name}`);
    const deps = (spec.deps ?? []).map((d) => this.get(d));
    const instance = spec.factory(deps, this);
    this.instances.set(name, instance);
    return instance as T;
  }

  /** Convenience alias for `get`. */
  service<T = unknown>(name: string): T {
    return this.get<T>(name);
  }

  // ---- events (delegated to the bus) ---------------------------------------

  on(type: string, handler: (e: import('./events').TrajectoryEvent) => void): this {
    this.bus.on(type, handler);
    return this;
  }

  emit(
    type: string,
    data: Record<string, unknown> = {},
    sessionId = 'system',
  ): this {
    this.bus.emit(type, data, sessionId);
    return this;
  }

  // ---- plugins & lifecycle -------------------------------------------------

  /** Register a plugin to be composed by `start()`. */
  use(plugin: Plugin, name = plugin.name || 'anonymous'): this {
    this.plugins.push({ name, fn: plugin });
    return this;
  }

  /** Compose all registered plugins, in order. */
  async start(): Promise<void> {
    for (const p of this.plugins) {
      await p.fn(this);
      this.bus.emit('plugin.loaded', { plugin: p.name });
    }
  }

  /** Schedule cleanup, run in reverse order on `dispose()`. */
  onDispose(fn: DisposeFn): void {
    this.disposers.push(fn);
  }

  async dispose(): Promise<void> {
    for (const fn of [...this.disposers].reverse()) await fn();
    this.disposers = [];
    this.instances.clear();
    this.specs.clear();
    this.plugins = [];
    this.bus.reset();
  }

  /** Snapshot of the composed plugins + service graph, for the UI inventory. */
  inventory(): { plugins: string[]; services: { name: string; deps: string[] }[] } {
    return {
      plugins: this.plugins.map((p) => p.name),
      services: [...this.specs.keys()].map((name) => ({
        name,
        deps: this.specs.get(name)!.deps ?? [],
      })),
    };
  }
}
