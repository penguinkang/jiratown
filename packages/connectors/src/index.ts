import { execFile } from "node:child_process";
import { watch, type FSWatcher } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import { promisify } from "node:util";
import type { CreateTaskInput, TaskPriority, TaskSource, TaskStatus } from "@jiratown/shared";

const execFileAsync = promisify(execFile);

export type TaskAdapter = {
  source: TaskSource;
  list(): Promise<CreateTaskInput[]>;
};

export type SyncAdapterName = "jira" | "reminders" | "obsidian";

export type SyncResult = {
  source: SyncAdapterName;
  tasks: CreateTaskInput[];
  skipped?: string;
};

export type SyncConfig = {
  jira?: JiraConfig;
  reminders?: RemindersConfig;
  obsidian?: ObsidianConfig;
};

export type JiraConfig = {
  baseUrl?: string;
  email?: string;
  apiToken?: string;
  pat?: string;
  accessToken?: string;
  cloudId?: string;
  authMode?: "cloud-api-token" | "data-center-pat" | "oauth";
  jql?: string;
  maxResults?: number;
};

export type RemindersConfig = {
  lists?: string[];
};

export type ObsidianConfig = {
  vaultPath?: string;
  include?: string[];
};

export async function collectTasks(adapters: TaskAdapter[]): Promise<CreateTaskInput[]> {
  const batches = await Promise.all(adapters.map((adapter) => adapter.list()));
  return batches.flat();
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): SyncConfig {
  const jira: JiraConfig = {
    authMode: env.JIRATOWN_JIRA_AUTH_MODE === "data-center-pat" ? "data-center-pat" : "cloud-api-token"
  };
  if (env.JIRATOWN_JIRA_BASE_URL) jira.baseUrl = env.JIRATOWN_JIRA_BASE_URL;
  if (env.JIRATOWN_JIRA_EMAIL) jira.email = env.JIRATOWN_JIRA_EMAIL;
  if (env.JIRATOWN_JIRA_API_TOKEN) jira.apiToken = env.JIRATOWN_JIRA_API_TOKEN;
  if (env.JIRATOWN_JIRA_PAT) jira.pat = env.JIRATOWN_JIRA_PAT;
  if (env.JIRATOWN_JIRA_ACCESS_TOKEN) jira.accessToken = env.JIRATOWN_JIRA_ACCESS_TOKEN;
  if (env.JIRATOWN_JIRA_CLOUD_ID) jira.cloudId = env.JIRATOWN_JIRA_CLOUD_ID;
  if (env.JIRATOWN_JIRA_AUTH_MODE === "oauth") jira.authMode = "oauth";
  if (env.JIRATOWN_JIRA_JQL) jira.jql = env.JIRATOWN_JIRA_JQL;
  if (env.JIRATOWN_JIRA_MAX_RESULTS) jira.maxResults = Number(env.JIRATOWN_JIRA_MAX_RESULTS);

  const reminders: RemindersConfig = {};
  const reminderLists = splitCsv(env.JIRATOWN_REMINDERS_LISTS);
  if (reminderLists) reminders.lists = reminderLists;

  const obsidian: ObsidianConfig = {};
  if (env.JIRATOWN_OBSIDIAN_VAULT) obsidian.vaultPath = env.JIRATOWN_OBSIDIAN_VAULT;
  const obsidianInclude = splitCsv(env.JIRATOWN_OBSIDIAN_INCLUDE);
  if (obsidianInclude) obsidian.include = obsidianInclude;

  return {
    jira,
    reminders,
    obsidian
  };
}

export async function syncSources(config: SyncConfig, sources: SyncAdapterName[] = ["jira", "reminders", "obsidian"]): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  for (const source of sources) {
    if (source === "jira") {
      if (!isJiraConfigured(config.jira)) {
        results.push({ source, tasks: [], skipped: "Jira is not configured." });
      } else {
        results.push(await safeList(source, createJiraAdapter(config.jira)));
      }
    }

    if (source === "reminders") {
      results.push(await safeList(source, createRemindersAdapter(config.reminders ?? {})));
    }

    if (source === "obsidian") {
      if (!config.obsidian?.vaultPath) {
        results.push({ source, tasks: [], skipped: "Obsidian vault path is not configured." });
      } else {
        results.push(await safeList(source, createObsidianAdapter(config.obsidian)));
      }
    }
  }

  return results;
}

async function safeList(source: SyncAdapterName, adapter: TaskAdapter): Promise<SyncResult> {
  try {
    return { source, tasks: await adapter.list() };
  } catch (error) {
    return {
      source,
      tasks: [],
      skipped: error instanceof Error ? error.message : "Connector failed."
    };
  }
}

export function createJiraAdapter(config: JiraConfig = {}): TaskAdapter {
  return {
    source: "jira",
    async list() {
      if (!isJiraConfigured(config)) {
        return [];
      }

      const baseUrl = jiraApiBaseUrl(config);
      const jql = config.jql ?? "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC";
      const fields = [
        "summary",
        "description",
        "status",
        "priority",
        "assignee",
        "labels",
        "parent",
        "project",
        "created",
        "updated",
        "customfield_10020"
      ];

      const response = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
        method: "POST",
        headers: {
          ...jiraHeaders(config),
          "content-type": "application/json"
        },
        body: JSON.stringify({
          jql,
          maxResults: config.maxResults ?? 50,
          fields
        })
      });

      if (!response.ok) {
        throw new Error(`Jira sync failed: ${response.status} ${await response.text()}`);
      }

      const payload = await response.json() as JiraSearchResponse;
      const apiBase = baseUrl.replace(/\/rest\/.*$/, "");
      return payload.issues.map((issue) => mapJiraIssue(issue, apiBase));
    }
  };
}

export function createRemindersAdapter(config: RemindersConfig = {}): TaskAdapter {
  return {
    source: "reminders",
    async list() {
      if (process.platform !== "darwin") {
        return [];
      }

      const script = remindersAppleScript(config.lists);
      let stdout = "";
      try {
        const result = await execFileAsync("osascript", ["-e", script], {
          timeout: 15_000,
          maxBuffer: 1024 * 1024 * 4
        });
        stdout = result.stdout;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("not authorized") || message.includes("(-1743)") || message.includes("not allowed")) {
          throw new Error("Reminders permission is not granted. Allow your terminal app to automate Reminders in macOS System Settings.");
        }
        throw new Error("Reminders sync failed. Open Reminders once, check macOS Automation permissions, then retry.");
      }
      const rows = JSON.parse(stdout || "[]") as AppleReminderRow[];
      return rows.map(mapReminder);
    }
  };
}

export function createObsidianAdapter(config: ObsidianConfig): TaskAdapter {
  return {
    source: "obsidian",
    async list() {
      if (!config.vaultPath) return [];
      const files = await findMarkdownFiles(config.vaultPath, config.include);
      const batches = await Promise.all(files.map((file) => readObsidianFile(config.vaultPath!, file)));
      return batches.flat();
    }
  };
}

export function watchObsidian(config: ObsidianConfig, onChange: () => void): FSWatcher | undefined {
  if (!config.vaultPath) return undefined;
  let timer: NodeJS.Timeout | undefined;
  const trigger = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(onChange, 250);
  };

  try {
    return watch(config.vaultPath, { recursive: true }, (_event, filename) => {
      if (filename && filename.endsWith(".md")) trigger();
    });
  } catch {
    return undefined;
  }
}

async function findMarkdownFiles(root: string, include?: string[]): Promise<string[]> {
  const found: string[] = [];
  const allowed = include?.filter(Boolean);

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
        const rel = relative(root, path);
        if (!allowed?.length || allowed.some((needle) => rel.includes(needle))) {
          found.push(path);
        }
      }
    }
  }

  await walk(root);
  return found;
}

async function readObsidianFile(vaultPath: string, filePath: string): Promise<CreateTaskInput[]> {
  const text = await readFile(filePath, "utf8");
  const info = await stat(filePath);
  const file = relative(vaultPath, filePath);
  const vault = basename(vaultPath);
  const tasks: CreateTaskInput[] = [];
  let heading: string | undefined;

  for (const line of text.split(/\r?\n/)) {
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (headingMatch?.[2]) {
      heading = headingMatch[2].trim();
      continue;
    }

    const taskMatch = /^\s*[-*]\s+\[( |x|X|-)\]\s+(.+)$/.exec(line);
    if (!taskMatch) continue;

    const checked = taskMatch[1]?.toLowerCase() === "x";
    const rawTitle = taskMatch[2]!.trim();
    const title = rawTitle
      .replace(/\s+#\w[\w/-]*/g, "")
      .replace(/\s+📅\s*\d{4}-\d{2}-\d{2}/g, "")
      .trim();

    tasks.push({
      source: "obsidian",
      externalId: `${file}:${tasks.length + 1}`,
      sourceUrl: `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(file)}`,
      title,
      status: checked ? "done" : statusFromText(rawTitle),
      priority: priorityFromText(rawTitle),
      labels: labelsFromText(rawTitle),
      obsidianVault: vault,
      obsidianFile: file,
      ...(heading ? { obsidianHeading: heading } : {}),
      description: `From ${file}${heading ? ` > ${heading}` : ""}. Last modified ${info.mtime.toISOString()}`
    });
  }

  return tasks;
}

function mapJiraIssue(issue: JiraIssue, baseUrl: string): CreateTaskInput {
  const fields = issue.fields;
  const epic = fields.parent?.fields?.summary;
  const sprint = Array.isArray(fields.customfield_10020) ? fields.customfield_10020.at(-1)?.name : undefined;
  const task: CreateTaskInput = {
    source: "jira",
    externalId: issue.key,
    sourceUrl: `${baseUrl}/browse/${issue.key}`,
    title: fields.summary ?? issue.key,
    status: mapJiraStatus(fields.status?.name),
    priority: mapJiraPriority(fields.priority?.name),
    labels: fields.labels ?? []
  };
  const description = plainJiraDescription(fields.description);
  const jiraSpace = fields.project?.name ?? fields.project?.key;
  if (description) task.description = description;
  if (fields.assignee?.displayName) task.assignee = fields.assignee.displayName;
  if (sprint) task.sprint = sprint;
  if (epic) task.jiraEpic = epic;
  if (jiraSpace) task.jiraSpace = jiraSpace;
  return task;
}

function mapReminder(row: AppleReminderRow): CreateTaskInput {
  const task: CreateTaskInput = {
    source: "reminders",
    externalId: row.id,
    sourceUrl: "x-apple-reminderkit://",
    title: row.title,
    status: row.completed ? "done" : "todo",
    priority: row.priority >= 7 ? "critical" : row.priority >= 5 ? "high" : row.priority >= 1 ? "medium" : "low",
    reminderList: row.list,
    labels: []
  };
  if (row.notes) task.description = row.notes;
  return task;
}

function isJiraConfigured(config?: JiraConfig): boolean {
  if (!config) return false;
  if (config.authMode === "oauth") return Boolean(config.cloudId && config.accessToken);
  if (!config.baseUrl) return false;
  if (config.authMode === "data-center-pat") return Boolean(config.pat);
  return Boolean(config.email && config.apiToken);
}

function jiraHeaders(config: JiraConfig): HeadersInit {
  if (config.authMode === "oauth") {
    return {
      accept: "application/json",
      authorization: `Bearer ${config.accessToken}`
    };
  }

  if (config.authMode === "data-center-pat") {
    return {
      accept: "application/json",
      authorization: `Bearer ${config.pat}`
    };
  }

  const token = Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");
  return {
    accept: "application/json",
    authorization: `Basic ${token}`
  };
}

function jiraApiBaseUrl(config: JiraConfig): string {
  if (config.authMode === "oauth") {
    return `https://api.atlassian.com/ex/jira/${config.cloudId}`;
  }

  return config.baseUrl!.replace(/\/$/, "");
}

function plainJiraDescription(description: unknown): string | undefined {
  if (!description || typeof description !== "object") return undefined;
  const text = collectText(description).join(" ").replace(/\s+/g, " ").trim();
  return text || undefined;
}

function collectText(node: unknown): string[] {
  if (!node || typeof node !== "object") return [];
  const record = node as Record<string, unknown>;
  const text = typeof record.text === "string" ? [record.text] : [];
  const children = Array.isArray(record.content) ? record.content.flatMap(collectText) : [];
  return [...text, ...children];
}

function mapJiraStatus(status?: string): TaskStatus {
  const lower = status?.toLowerCase() ?? "";
  if (lower.includes("done") || lower.includes("closed") || lower.includes("resolved")) return "done";
  if (lower.includes("block")) return "blocked";
  if (lower.includes("review") || lower.includes("qa")) return "review";
  if (lower.includes("progress") || lower.includes("doing")) return "in_progress";
  return "todo";
}

function mapJiraPriority(priority?: string): TaskPriority {
  const lower = priority?.toLowerCase() ?? "";
  if (lower.includes("critical") || lower.includes("blocker") || lower.includes("highest")) return "critical";
  if (lower.includes("high")) return "high";
  if (lower.includes("low") || lower.includes("lowest")) return "low";
  return "medium";
}

function priorityFromText(text: string): TaskPriority {
  if (/[!]{3}|#critical\b/i.test(text)) return "critical";
  if (/[!]{2}|#high\b/i.test(text)) return "high";
  if (/#low\b/i.test(text)) return "low";
  return "medium";
}

function statusFromText(text: string): TaskStatus {
  if (/#blocked\b/i.test(text)) return "blocked";
  if (/#review\b/i.test(text)) return "review";
  if (/#doing|#in-progress\b/i.test(text)) return "in_progress";
  return "todo";
}

function labelsFromText(text: string): string[] {
  return [...text.matchAll(/#([\w/-]+)/g)].map((match) => match[1]!).filter((label) => !["blocked", "review", "doing", "in-progress", "critical", "high", "low"].includes(label));
}

function splitCsv(value?: string): string[] | undefined {
  const values = value?.split(",").map((item) => item.trim()).filter(Boolean);
  return values?.length ? values : undefined;
}

function remindersAppleScript(lists?: string[]): string {
  const listFilter = JSON.stringify(lists ?? []);
  return `
set listFilter to ${JSON.stringify(listFilter)}
set allowedLists to {}
if listFilter is not "[]" then
  set AppleScript's text item delimiters to {"\\",\\""}
  set cleaned to text 3 thru -3 of listFilter
  if cleaned is not "" then set allowedLists to text items of cleaned
end if
set output to "["
set firstItem to true
tell application "Reminders"
  repeat with reminderList in lists
    set listName to name of reminderList
    if (count of allowedLists) is 0 or allowedLists contains listName then
      repeat with reminderItem in reminders of reminderList
        if completed of reminderItem is false then
          if firstItem is false then set output to output & ","
          set firstItem to false
          set output to output & "{"
          set output to output & "\\"id\\":\\"" & id of reminderItem & "\\","
          set output to output & "\\"title\\":\\"" & my jsonEscape(name of reminderItem) & "\\","
          set output to output & "\\"list\\":\\"" & my jsonEscape(listName) & "\\","
          set output to output & "\\"completed\\":false,"
          set output to output & "\\"priority\\":" & priority of reminderItem & ","
          set output to output & "\\"notes\\":\\"" & my jsonEscape(body of reminderItem as text) & "\\""
          set output to output & "}"
        end if
      end repeat
    end if
  end repeat
end tell
set output to output & "]"
return output

on jsonEscape(valueText)
  set valueText to valueText as text
  set AppleScript's text item delimiters to "\\\\"
  set parts to text items of valueText
  set AppleScript's text item delimiters to "\\\\\\\\"
  set valueText to parts as text
  set AppleScript's text item delimiters to "\\""
  set parts to text items of valueText
  set AppleScript's text item delimiters to "\\\\\\""
  return parts as text
end jsonEscape
`;
}

type JiraSearchResponse = {
  issues: JiraIssue[];
};

type JiraIssue = {
  key: string;
  fields: {
    summary?: string;
    description?: unknown;
    status?: { name?: string };
    priority?: { name?: string };
    assignee?: { displayName?: string };
    labels?: string[];
    parent?: { fields?: { summary?: string } };
    project?: { key?: string; name?: string };
    customfield_10020?: Array<{ name?: string }>;
  };
};

type AppleReminderRow = {
  id: string;
  title: string;
  list: string;
  completed: boolean;
  priority: number;
  notes?: string;
};
