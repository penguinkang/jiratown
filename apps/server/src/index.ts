#!/usr/bin/env node
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import type { TaskEvent } from "@jiratown/shared";
import { configFromEnv, syncSources, watchObsidian, type SyncAdapterName, type SyncConfig } from "@jiratown/connectors";
import { createTaskRepository, parseCreateTaskInput, type TaskRepository } from "./store.js";

export type JiraTownServerConfig = {
  clientOrigin?: string;
  logger?: boolean | { level?: string };
  syncConfig?: SyncConfig;
  syncIntervals?: Partial<Record<SyncAdapterName, number>>;
  storagePath?: string;
  demoMode?: boolean;
  repository?: TaskRepository;
  startSync?: boolean;
};

export function createJiraTownServer(config: JiraTownServerConfig = {}): FastifyInstance {
  const clientOrigin = config.clientOrigin ?? process.env.CLIENT_ORIGIN ?? "http://localhost:3000";
  const clientOrigins = clientOriginVariants(clientOrigin);
  const syncConfig = config.syncConfig ?? configFromEnv();
  const syncIntervals: Record<SyncAdapterName, number> = {
    jira: config.syncIntervals?.jira ?? Number(process.env.JIRATOWN_JIRA_SYNC_INTERVAL_MS ?? 60_000),
    reminders: config.syncIntervals?.reminders ?? Number(process.env.JIRATOWN_REMINDERS_SYNC_INTERVAL_MS ?? 15_000),
    obsidian: config.syncIntervals?.obsidian ?? Number(process.env.JIRATOWN_OBSIDIAN_SYNC_INTERVAL_MS ?? 5_000)
  };
  const repository =
    config.repository ??
    createTaskRepository({
      storagePath: config.storagePath ?? process.env.JIRATOWN_TASK_STORE ?? resolve(process.cwd(), ".jiratown/tasks.json"),
      demoMode: config.demoMode ?? process.env.JIRATOWN_DEMO_MODE === "true"
    });

  const app = Fastify({
    logger: config.logger ?? {
      level: process.env.LOG_LEVEL ?? "info"
    }
  });

  void app.register(cors, {
    origin: clientOrigins
  });

  const io = new Server(app.server, {
    cors: {
      origin: clientOrigins
    }
  });

  function broadcast(event: TaskEvent): void {
    io.emit("task:event", event);
  }

  io.on("connection", (socket) => {
    socket.emit("task:event", { type: "tasks.snapshot", tasks: repository.listTasks() } satisfies TaskEvent);
  });

  app.get("/health", async () => ({
    ok: true,
    service: "jiratown-server"
  }));

  app.get("/tasks", async () => ({
    tasks: repository.listTasks()
  }));

  app.get("/sync/status", async () => ({
    configured: {
      jira: isJiraConfigured(syncConfig),
      reminders: process.platform === "darwin",
      obsidian: Boolean(syncConfig.obsidian?.vaultPath)
    },
    intervals: syncIntervals
  }));

  app.post("/sync", async (request, reply) => {
    const body = request.body as { sources?: SyncAdapterName[] } | undefined;
    const sources = normalizeSources(body?.sources);

    try {
      const results = await syncSources(syncConfig, sources);
      const synced = repository.upsertSyncedTasks(results.flatMap((result) => result.tasks));
      for (const task of synced) {
        broadcast({ type: "task.updated", task });
      }
      broadcast({ type: "tasks.snapshot", tasks: repository.listTasks() });
      return { results, taskCount: repository.listTasks().length };
    } catch (error) {
      return reply.code(500).send({ error: error instanceof Error ? error.message : "Sync failed." });
    }
  });

  app.post("/tasks", async (request, reply) => {
    try {
      const task = repository.addTask(parseCreateTaskInput(request.body));
      broadcast({ type: "task.created", task });
      return reply.code(201).send({ task });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Invalid task input." });
    }
  });

  app.post("/tasks/:id/done", async (request, reply) => {
    const { id } = request.params as { id: string };
    const task = repository.completeTask(id);
    if (!task) {
      return reply.code(404).send({ error: "Task not found." });
    }
    broadcast({ type: "task.updated", task });
    return { task };
  });

  app.patch("/tasks/:id/status", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { status?: unknown } | undefined;

    if (typeof body?.status !== "string") {
      return reply.code(400).send({ error: "Status is required." });
    }

    try {
      const task = repository.updateTaskStatus(id, body.status);
      if (!task) {
        return reply.code(404).send({ error: "Task not found." });
      }
      broadcast({ type: "task.updated", task });
      return { task };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Invalid status." });
    }
  });

  if (config.startSync ?? true) {
    startNearRealtimeSync(app, syncConfig, syncIntervals, repository, broadcast);
  }

  return app;
}

export async function startJiraTownServer(config: JiraTownServerConfig & { port?: number; host?: string } = {}): Promise<FastifyInstance> {
  const app = createJiraTownServer(config);
  await app.listen({
    port: config.port ?? Number(process.env.PORT ?? 4000),
    host: config.host ?? "0.0.0.0"
  });
  return app;
}

function normalizeSources(sources?: SyncAdapterName[]): SyncAdapterName[] {
  const allowed: SyncAdapterName[] = ["jira", "reminders", "obsidian"];
  if (!sources?.length) return allowed;
  return sources.filter((source): source is SyncAdapterName => allowed.includes(source));
}

async function runSourceSync(
  app: FastifyInstance,
  syncConfig: SyncConfig,
  source: SyncAdapterName,
  repository: TaskRepository,
  broadcast: (event: TaskEvent) => void
): Promise<void> {
  try {
    const results = await syncSources(syncConfig, [source]);
    const synced = repository.upsertSyncedTasks(results.flatMap((result) => result.tasks));
    for (const task of synced) {
      broadcast({ type: "task.updated", task });
    }
    if (synced.length > 0) {
      broadcast({ type: "tasks.snapshot", tasks: repository.listTasks() });
    }
  } catch (error) {
    app.log.warn({ source, error: error instanceof Error ? error.message : error }, "connector sync failed");
  }
}

function startNearRealtimeSync(
  app: FastifyInstance,
  syncConfig: SyncConfig,
  syncIntervals: Record<SyncAdapterName, number>,
  repository: TaskRepository,
  broadcast: (event: TaskEvent) => void
): void {
  const timers: NodeJS.Timeout[] = [];
  for (const source of normalizeSources()) {
    const interval = syncIntervals[source];
    if (Number.isFinite(interval) && interval > 0) {
      timers.push(setInterval(() => void runSourceSync(app, syncConfig, source, repository, broadcast), interval));
    }
  }

  const watcher = watchObsidian(syncConfig.obsidian ?? {}, () => void runSourceSync(app, syncConfig, "obsidian", repository, broadcast));
  app.addHook("onClose", (_instance, done) => {
    for (const timer of timers) clearInterval(timer);
    watcher?.close();
    done();
  });

  for (const source of normalizeSources()) {
    void runSourceSync(app, syncConfig, source, repository, broadcast);
  }
}

function isJiraConfigured(syncConfig: SyncConfig): boolean {
  const jira = syncConfig.jira;
  return Boolean(
    (jira?.authMode === "oauth" && jira.cloudId && jira.accessToken) ||
      (jira?.baseUrl && ((jira.email && jira.apiToken) || jira.pat))
  );
}

function clientOriginVariants(clientOrigin: string): string[] {
  const origins = new Set([clientOrigin, "http://localhost:3000", "http://127.0.0.1:3000"]);
  try {
    const url = new URL(clientOrigin);
    if (url.hostname === "localhost") {
      url.hostname = "127.0.0.1";
      origins.add(url.toString().replace(/\/$/, ""));
    } else if (url.hostname === "127.0.0.1") {
      url.hostname = "localhost";
      origins.add(url.toString().replace(/\/$/, ""));
    }
  } catch {
    // Keep the explicit origin and defaults above.
  }
  return [...origins];
}

function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const key = match[1];
    const rawValue = match[2];
    if (!key || rawValue === undefined) continue;
    process.env[key] ??= rawValue.replace(/^['"]|['"]$/g, "");
  }
}

function isCurrentEntrypoint(): boolean {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(process.argv[1]));
  } catch {
    return fileURLToPath(import.meta.url) === resolve(process.argv[1]);
  }
}

if (isCurrentEntrypoint()) {
  loadEnvLocal();
  await startJiraTownServer();
}
