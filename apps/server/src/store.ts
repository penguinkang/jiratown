import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createTask,
  isTaskPriority,
  isTaskStatus,
  type CreateTaskInput,
  type Task,
  type TaskSource,
  type TaskStatus
} from "@jiratown/shared";

export type TaskRepositoryOptions = {
  storagePath?: string;
  demoMode?: boolean;
};

export type TaskRepository = {
  listTasks(): Task[];
  addTask(input: CreateTaskInput): Task;
  upsertSyncedTasks(inputs: CreateTaskInput[]): Task[];
  updateTaskStatus(id: string, status: string): Task | undefined;
  completeTask(id: string): Task | undefined;
};

export function createTaskRepository(options: TaskRepositoryOptions = {}): TaskRepository {
  return new JsonTaskRepository(options);
}

class JsonTaskRepository implements TaskRepository {
  private readonly tasks = new Map<string, Task>();
  private readonly storagePath: string | undefined;

  constructor(options: TaskRepositoryOptions) {
    this.storagePath = options.storagePath ? resolve(options.storagePath) : undefined;
    const initialTasks = this.loadTasks() ?? (options.demoMode ? seedTasks() : []);

    for (const task of initialTasks) {
      this.tasks.set(task.id, task);
    }

    if (this.storagePath && !existsSync(this.storagePath)) {
      this.persist();
    }
  }

  listTasks(): Task[] {
    return [...this.tasks.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  addTask(input: CreateTaskInput): Task {
    const task = createTask(input);
    this.tasks.set(task.id, task);
    this.persist();
    return task;
  }

  upsertSyncedTasks(inputs: CreateTaskInput[]): Task[] {
    const synced: Task[] = [];

    for (const input of inputs) {
      const existing = this.findSyncedTask(input);
      if (!existing) {
        synced.push(this.addTask(input));
        continue;
      }

      const now = new Date().toISOString();
      const task: Task = {
        ...existing,
        ...createTask(input),
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: now,
        statusHistory:
          existing.status === (input.status ?? "todo")
            ? existing.statusHistory
            : [...existing.statusHistory, { status: input.status ?? "todo", changedAt: now }]
      };

      this.tasks.set(task.id, task);
      synced.push(task);
    }

    if (synced.length > 0) {
      this.persist();
    }

    return synced;
  }

  updateTaskStatus(id: string, status: string): Task | undefined {
    if (!isTaskStatus(status)) {
      throw new Error(`Unsupported status: ${status}`);
    }

    const existing = this.tasks.get(id);
    if (!existing) {
      return undefined;
    }

    const now = new Date().toISOString();
    const task: Task = {
      ...existing,
      status,
      updatedAt: now,
      statusHistory:
        existing.status === status
          ? existing.statusHistory
          : [...existing.statusHistory, { status, changedAt: now }]
    };
    this.tasks.set(id, task);
    this.persist();
    return task;
  }

  completeTask(id: string): Task | undefined {
    return this.updateTaskStatus(id, "done" satisfies TaskStatus);
  }

  private findSyncedTask(input: CreateTaskInput): Task | undefined {
    if (!input.source || !input.externalId) return undefined;
    return [...this.tasks.values()].find((task) => task.source === input.source && task.externalId === input.externalId);
  }

  private loadTasks(): Task[] | undefined {
    if (!this.storagePath || !existsSync(this.storagePath)) {
      return undefined;
    }

    const payload = JSON.parse(readFileSync(this.storagePath, "utf8")) as unknown;
    if (!Array.isArray(payload)) {
      throw new Error(`Task store must be a JSON array: ${this.storagePath}`);
    }

    return payload.filter(isTask);
  }

  private persist(): void {
    if (!this.storagePath) {
      return;
    }

    mkdirSync(dirname(this.storagePath), { recursive: true });
    writeFileSync(this.storagePath, `${JSON.stringify(this.listTasks(), null, 2)}\n`);
  }
}

export function parseCreateTaskInput(body: unknown): CreateTaskInput {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be an object.");
  }

  const raw = body as Record<string, unknown>;
  if (typeof raw.title !== "string" || raw.title.trim().length === 0) {
    throw new Error("Task title is required.");
  }

  const input: CreateTaskInput = {
    title: raw.title.trim()
  };

  if (typeof raw.description === "string" && raw.description.trim()) {
    input.description = raw.description.trim();
  }
  if (typeof raw.externalId === "string" && raw.externalId.trim()) {
    input.externalId = raw.externalId.trim();
  }
  if (typeof raw.priority === "string" && isTaskPriority(raw.priority)) {
    input.priority = raw.priority;
  }
  if (typeof raw.status === "string" && isTaskStatus(raw.status)) {
    input.status = raw.status;
  }
  if (typeof raw.source === "string" && ["jira", "cli", "reminders", "obsidian"].includes(raw.source)) {
    input.source = raw.source as TaskSource;
  }
  if (typeof raw.assignee === "string" && raw.assignee.trim()) {
    input.assignee = raw.assignee.trim();
  }
  if (typeof raw.sprint === "string" && raw.sprint.trim()) {
    input.sprint = raw.sprint.trim();
  }
  if (typeof raw.jiraEpic === "string" && raw.jiraEpic.trim()) {
    input.jiraEpic = raw.jiraEpic.trim();
  }
  if (typeof raw.jiraSpace === "string" && raw.jiraSpace.trim()) {
    input.jiraSpace = raw.jiraSpace.trim();
  }
  if (typeof raw.reminderList === "string" && raw.reminderList.trim()) {
    input.reminderList = raw.reminderList.trim();
  }
  if (typeof raw.obsidianVault === "string" && raw.obsidianVault.trim()) {
    input.obsidianVault = raw.obsidianVault.trim();
  }
  if (typeof raw.obsidianFile === "string" && raw.obsidianFile.trim()) {
    input.obsidianFile = raw.obsidianFile.trim();
  }
  if (typeof raw.obsidianHeading === "string" && raw.obsidianHeading.trim()) {
    input.obsidianHeading = raw.obsidianHeading.trim();
  }
  if (Array.isArray(raw.labels)) {
    input.labels = raw.labels.filter((label): label is string => typeof label === "string");
  }

  return input;
}

function isTask(input: unknown): input is Task {
  if (!input || typeof input !== "object") return false;
  const task = input as Partial<Task>;
  return typeof task.id === "string" && typeof task.title === "string" && Boolean(task.createdAt) && Boolean(task.updatedAt);
}

const seededAt = new Date();

function daysAgo(days: number): string {
  const date = new Date(seededAt);
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function seedTask(input: CreateTaskInput & { id: string; ageDays: number }): Task {
  const task = createTask(input);
  const createdAt = daysAgo(input.ageDays);

  const seeded: Task = {
    ...task,
    id: input.id,
    createdAt,
    updatedAt: createdAt,
    comments:
      input.status === "blocked"
        ? [
            {
              id: `${input.id}-comment-1`,
              author: "Build Bot",
              body: "Waiting on upstream dependency before this can move.",
              createdAt
            }
          ]
        : [],
    linkedTickets: input.status === "blocked" ? ["OPS-91"] : []
  };

  if (input.externalId) seeded.externalId = input.externalId;

  return seeded;
}

function seedTasks(): Task[] {
  return [
    seedTask({
      id: "JT-101",
      externalId: "ENG-241",
      title: "Fix websocket reconnect bug",
      description: "Socket reconnect fails after the app idles for more than 30 seconds.",
      priority: "high",
      status: "in_progress",
      source: "jira",
      assignee: "Jay",
      sprint: "Infra Sprint 12",
      jiraEpic: "Realtime Platform",
      jiraSpace: "Engineering",
      labels: ["websocket", "infra"],
      ageDays: 2
    }),
    seedTask({
      id: "JT-102",
      externalId: "UX-88",
      title: "Review onboarding modal copy",
      priority: "medium",
      status: "review",
      source: "jira",
      assignee: "Mina",
      sprint: "Product Polish",
      jiraEpic: "Activation UX",
      jiraSpace: "Product",
      labels: ["ux"],
      ageDays: 5
    }),
    seedTask({
      id: "JT-103",
      externalId: "OPS-17",
      title: "Unblock production deploy",
      description: "Release train is stopped on a missing secrets rotation approval.",
      priority: "critical",
      status: "blocked",
      source: "jira",
      assignee: "Sam",
      sprint: "Incident Response",
      jiraEpic: "Release Reliability",
      jiraSpace: "Operations",
      labels: ["deploy", "blocker"],
      ageDays: 1
    }),
    seedTask({
      id: "JT-104",
      title: "Pick up standing desk mat",
      priority: "low",
      status: "todo",
      source: "reminders",
      reminderList: "Personal",
      labels: ["personal"],
      ageDays: 8
    }),
    seedTask({
      id: "JT-105",
      title: "Archive stale sprint tickets",
      priority: "medium",
      status: "done",
      source: "cli",
      assignee: "Jay",
      labels: ["cleanup"],
      ageDays: 14
    })
  ];
}
