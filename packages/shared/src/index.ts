export type TaskSource = "jira" | "cli" | "reminders" | "obsidian";
export type TaskStatus = "todo" | "in_progress" | "blocked" | "review" | "done";
export type TaskPriority = "low" | "medium" | "high" | "critical";

export type TaskComment = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
};

export type StatusHistoryEntry = {
  status: TaskStatus;
  changedAt: string;
};

export type Task = {
  id: string;
  source: TaskSource;
  externalId?: string;
  sourceUrl?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee?: string;
  sprint?: string;
  jiraEpic?: string;
  jiraSpace?: string;
  reminderList?: string;
  obsidianVault?: string;
  obsidianFile?: string;
  obsidianHeading?: string;
  labels: string[];
  comments: TaskComment[];
  statusHistory: StatusHistoryEntry[];
  linkedTickets: string[];
  createdAt: string;
  updatedAt: string;
};

export type CreateTaskInput = {
  title: string;
  description?: string;
  source?: TaskSource;
  externalId?: string;
  sourceUrl?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  assignee?: string;
  sprint?: string;
  jiraEpic?: string;
  jiraSpace?: string;
  reminderList?: string;
  obsidianVault?: string;
  obsidianFile?: string;
  obsidianHeading?: string;
  labels?: string[];
};

export type TaskEvent =
  | { type: "task.created"; task: Task }
  | { type: "task.updated"; task: Task }
  | { type: "task.deleted"; taskId: string }
  | { type: "tasks.snapshot"; tasks: Task[] };

export const statusLabels: Record<TaskStatus, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  blocked: "Blocked",
  review: "Review",
  done: "Done"
};

export const priorityLabels: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical"
};

export const priorityRank: Record<TaskPriority, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

export const taskStatuses = Object.keys(statusLabels) as TaskStatus[];
export const taskPriorities = Object.keys(priorityLabels) as TaskPriority[];

export function isTaskStatus(value: string): value is TaskStatus {
  return taskStatuses.includes(value as TaskStatus);
}

export function isTaskPriority(value: string): value is TaskPriority {
  return taskPriorities.includes(value as TaskPriority);
}

export function createTask(input: CreateTaskInput): Task {
  const now = new Date().toISOString();
  const status = input.status ?? "todo";

  const task: Task = {
    id: crypto.randomUUID(),
    source: input.source ?? "cli",
    title: input.title,
    status,
    priority: input.priority ?? "medium",
    labels: input.labels ?? [],
    comments: [],
    statusHistory: [{ status, changedAt: now }],
    linkedTickets: [],
    createdAt: now,
    updatedAt: now
  };

  if (input.description) task.description = input.description;
  if (input.externalId) task.externalId = input.externalId;
  if (input.sourceUrl) task.sourceUrl = input.sourceUrl;
  if (input.assignee) task.assignee = input.assignee;
  if (input.sprint) task.sprint = input.sprint;
  if (input.jiraEpic) task.jiraEpic = input.jiraEpic;
  if (input.jiraSpace) task.jiraSpace = input.jiraSpace;
  if (input.reminderList) task.reminderList = input.reminderList;
  if (input.obsidianVault) task.obsidianVault = input.obsidianVault;
  if (input.obsidianFile) task.obsidianFile = input.obsidianFile;
  if (input.obsidianHeading) task.obsidianHeading = input.obsidianHeading;

  return task;
}

export function taskRoomLabel(task: Pick<Task, "source" | "jiraEpic" | "jiraSpace" | "reminderList" | "obsidianVault" | "obsidianFile" | "obsidianHeading">): string {
  if (task.source === "jira") {
    if (task.jiraEpic) return `Epic: ${task.jiraEpic}`;
    return `Space: ${task.jiraSpace ?? "Jira Backlog"}`;
  }

  if (task.source === "reminders") {
    return `List: ${task.reminderList ?? "Reminders"}`;
  }

  if (task.source === "obsidian") {
    return `Note: ${task.obsidianHeading ?? task.obsidianFile ?? task.obsidianVault ?? "Obsidian"}`;
  }

  return "Manual Tasks";
}

export function taskAgeDays(task: Pick<Task, "createdAt">): number {
  const createdAt = new Date(task.createdAt).getTime();
  return Math.max(0, Math.floor((Date.now() - createdAt) / 86_400_000));
}
