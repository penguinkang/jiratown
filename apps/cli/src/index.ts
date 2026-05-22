#!/usr/bin/env node
import { spawn } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isTaskPriority, isTaskStatus, priorityLabels, statusLabels, type CreateTaskInput, type Task } from "@jiratown/shared";

const serverUrl = process.env.JIRATOWN_SERVER_URL ?? "http://localhost:4000";

type Flags = Record<string, string | boolean>;
type EnvMap = Record<string, string>;

async function main(argv: string[]) {
  const [domain, action, id, ...rest] = argv;

  if (domain === "init") {
    await initApp(
      action?.startsWith("--") ? undefined : action,
      parseFlags([action?.startsWith("--") ? action : undefined, id, ...rest].filter((arg): arg is string => typeof arg === "string"))
    );
    return;
  }

  if (domain === "dev") {
    await runDev();
    return;
  }

  if (domain === "sync") {
    await syncTasks(parseFlags([action, id, ...rest].filter((arg): arg is string => typeof arg === "string")));
    return;
  }

  if (domain === "connect" && action === "doctor") {
    await doctor();
    return;
  }

  if (domain === "connect" && action === "jira") {
    await connectJira();
    return;
  }

  if (domain === "connect" && action === "obsidian") {
    await connectObsidian();
    return;
  }

  if (domain === "connect" && action === "reminders") {
    await connectReminders();
    return;
  }

  if (domain === "task" && action === "create") {
    const flags = parseFlags([id, ...rest].filter((arg): arg is string => typeof arg === "string"));
    await createTask(flags);
    return;
  }

  if (domain === "task" && action === "ls") {
    await listTasks();
    return;
  }

  if (domain === "task" && action === "done" && id) {
    await completeTask(id);
    return;
  }

  if (domain === "task" && action === "sync") {
    await syncTasks(parseFlags([id, ...rest].filter((arg): arg is string => typeof arg === "string")));
    return;
  }

  if (domain === "npc" && action === "spawn") {
    await postTask({
      title: "Manual NPC spawn",
      priority: "medium",
      status: "todo",
      source: "cli"
    });
    return;
  }

  printHelp();
}

function parseFlags(args: string[]): Flags {
  const flags: Flags = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg?.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      index += 1;
    }
  }
  return flags;
}

async function initApp(dirArg: string | undefined, flags: Flags) {
  const target = resolve(dirArg && !dirArg.startsWith("--") ? dirArg : "jiratown-app");
  if (existsSync(target) && (await readdir(target)).length > 0) {
    throw new Error(`Target directory is not empty: ${target}`);
  }

  await copyDirectory(templateDir(), target);

  const envExample = join(target, ".env.example");
  const envLocal = join(target, ".env.local");
  if (!existsSync(envLocal)) {
    await copyFile(envExample, envLocal);
  }

  console.log(`Created JiraTown app in ${target}`);

  if (flags.install === true && flags["no-install"] !== true) {
    await runCommand("pnpm", ["install"], target);
  }

  console.log("Next steps:");
  console.log(`  cd ${target}`);
  console.log("  pnpm install");
  console.log("  jiratown dev");
}

async function runDev() {
  const packagePath = resolve(process.cwd(), "package.json");
  if (!existsSync(packagePath)) {
    throw new Error("Run `jiratown dev` from a JiraTown app directory.");
  }

  const child = spawn("pnpm", ["run", "dev"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env
  });

  await new Promise<void>((resolvePromise, reject) => {
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`dev exited with code ${code ?? 1}`));
    });
    child.on("error", reject);
  });
}

async function createTask(flags: Flags) {
  const title = value(flags.title);
  if (!title) {
    throw new Error("Missing required flag: --title");
  }

  const priority = value(flags.priority);
  const status = value(flags.status);
  const labels = value(flags.labels);
  const description = value(flags.description);
  const externalId = value(flags["external-id"]) ?? value(flags.externalId);
  const assignee = value(flags.assignee);
  const sprint = value(flags.sprint);
  const jiraEpic = value(flags["jira-epic"]) ?? value(flags.jiraEpic);
  const jiraSpace = value(flags["jira-space"]) ?? value(flags.jiraSpace);
  const reminderList = value(flags["reminder-list"]) ?? value(flags.reminderList);
  const sourceFlag = value(flags.source);
  const source = sourceFlag === "jira" || sourceFlag === "reminders" || sourceFlag === "cli" || sourceFlag === "obsidian"
    ? sourceFlag
    : reminderList
      ? "reminders"
      : jiraEpic || jiraSpace
        ? "jira"
        : "cli";

  await postTask({
    title,
    source,
    ...(priority && isTaskPriority(priority) ? { priority } : {}),
    ...(status && isTaskStatus(status) ? { status } : {}),
    ...(description ? { description } : {}),
    ...(externalId ? { externalId } : {}),
    ...(assignee ? { assignee } : {}),
    ...(sprint ? { sprint } : {}),
    ...(jiraEpic ? { jiraEpic } : {}),
    ...(jiraSpace ? { jiraSpace } : {}),
    ...(reminderList ? { reminderList } : {}),
    ...(labels ? { labels: labels.split(",").map((label) => label.trim()).filter(Boolean) } : {})
  });
}

async function postTask(input: CreateTaskInput) {
  const response = await request<{ task: Task }>("/tasks", {
    method: "POST",
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" }
  });
  printTask(response.task);
}

async function listTasks() {
  const response = await request<{ tasks: Task[] }>("/tasks");
  for (const task of response.tasks) {
    printTask(task);
  }
}

async function completeTask(id: string) {
  const response = await request<{ task: Task }>(`/tasks/${encodeURIComponent(id)}/done`, {
    method: "POST"
  });
  printTask(response.task);
}

async function syncTasks(flags: Flags = {}) {
  const source = value(flags.source);
  const sources = source ? source.split(",").map((item) => item.trim()).filter(Boolean) : undefined;
  const response = await request<{ results: Array<{ source: string; tasks: CreateTaskInput[]; skipped?: string }>; taskCount: number }>("/sync", {
    method: "POST",
    body: JSON.stringify({ sources }),
    headers: { "content-type": "application/json" }
  });

  for (const result of response.results) {
    const status = result.skipped ? `skipped: ${oneLine(result.skipped)}` : `${result.tasks.length} tasks`;
    console.log(`${result.source}: ${status}`);
  }
  console.log(`JiraTown now has ${response.taskCount} tasks`);
}

async function doctor() {
  const env = await readEnvLocal();
  const server = await checkJson(`${serverUrl}/health`);
  const client = await checkText(process.env.JIRATOWN_CLIENT_URL ?? "http://localhost:3000");

  printStatus(server.ok ? "OK" : "MISSING", "server", server.detail ?? serverUrl);
  printStatus(client.ok ? "OK" : "WARN", "client", client.detail ?? "http://localhost:3000");
  printStatus(isJiraConfigured(env) ? "OK" : "MISSING", "jira", jiraHint(env));
  printStatus(process.platform === "darwin" ? "OK" : "WARN", "reminders", process.platform === "darwin" ? "macOS available" : "Apple Reminders requires macOS");
  printStatus(env.JIRATOWN_OBSIDIAN_VAULT ? "OK" : "MISSING", "obsidian", env.JIRATOWN_OBSIDIAN_VAULT ?? "set JIRATOWN_OBSIDIAN_VAULT");
}

async function connectJira() {
  const env = await readEnvLocal();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const mode = await ask(rl, "Auth mode (cloud-api-token, data-center-pat, oauth)", env.JIRATOWN_JIRA_AUTH_MODE ?? "cloud-api-token");
    env.JIRATOWN_JIRA_AUTH_MODE = mode;

    if (mode === "oauth") {
      env.JIRATOWN_JIRA_CLOUD_ID = await ask(rl, "Cloud ID", env.JIRATOWN_JIRA_CLOUD_ID);
      env.JIRATOWN_JIRA_ACCESS_TOKEN = await ask(rl, "OAuth bearer token", env.JIRATOWN_JIRA_ACCESS_TOKEN);
    } else if (mode === "data-center-pat") {
      env.JIRATOWN_JIRA_BASE_URL = await ask(rl, "Jira base URL", env.JIRATOWN_JIRA_BASE_URL ?? "https://jira.company.com");
      env.JIRATOWN_JIRA_PAT = await ask(rl, "Data Center PAT", env.JIRATOWN_JIRA_PAT);
    } else {
      env.JIRATOWN_JIRA_BASE_URL = await ask(rl, "Jira Cloud base URL", env.JIRATOWN_JIRA_BASE_URL ?? "https://your-company.atlassian.net");
      env.JIRATOWN_JIRA_EMAIL = await ask(rl, "Atlassian email", env.JIRATOWN_JIRA_EMAIL);
      env.JIRATOWN_JIRA_API_TOKEN = await ask(rl, "Atlassian API token", env.JIRATOWN_JIRA_API_TOKEN);
    }

    env.JIRATOWN_JIRA_JQL = await ask(rl, "JQL", env.JIRATOWN_JIRA_JQL ?? "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC");
  } finally {
    rl.close();
  }

  await writeEnvLocal(env);
  console.log("Updated .env.local for Jira.");
}

async function connectObsidian() {
  const env = await readEnvLocal();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    env.JIRATOWN_OBSIDIAN_VAULT = await ask(rl, "Obsidian vault path", env.JIRATOWN_OBSIDIAN_VAULT);
    env.JIRATOWN_OBSIDIAN_INCLUDE = await ask(rl, "Include filter (comma-separated, optional)", env.JIRATOWN_OBSIDIAN_INCLUDE ?? "");
  } finally {
    rl.close();
  }

  const vault = env.JIRATOWN_OBSIDIAN_VAULT;
  if (!vault || !existsSync(vault)) {
    throw new Error(`Vault path is not readable: ${vault}`);
  }

  const files = await findMarkdownFiles(vault);
  if (files === 0) {
    console.log("WARN obsidian: vault is readable but contains no Markdown files.");
  } else {
    console.log(`OK obsidian: found ${files} Markdown files.`);
  }

  await writeEnvLocal(env);
  console.log("Updated .env.local for Obsidian.");
}

async function connectReminders() {
  const env = await readEnvLocal();
  if (process.platform !== "darwin") {
    console.log("WARN reminders: Apple Reminders is only available on macOS.");
    return;
  }

  const probe = spawn("osascript", ["-e", "tell application \"Reminders\" to count lists"], {
    stdio: ["ignore", "pipe", "pipe"]
  });
  const code = await new Promise<number | null>((resolvePromise) => probe.on("exit", resolvePromise));
  if (code === 0) {
    console.log("OK reminders: permission probe succeeded.");
  } else {
    console.log("MISSING reminders: allow your terminal app to automate Reminders in System Settings > Privacy & Security > Automation.");
  }

  if (!env.JIRATOWN_REMINDERS_LISTS) {
    env.JIRATOWN_REMINDERS_LISTS = "Work,Personal";
    await writeEnvLocal(env);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${serverUrl}${path}`, init);
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function printTask(task: Task) {
  const assignee = task.assignee ? ` @${task.assignee}` : "";
  console.log(`${task.id} [${priorityLabels[task.priority]}] ${statusLabels[task.status]}${assignee} - ${task.title}`);
}

function printHelp() {
  console.log(`JiraTown CLI

Commands:
  jiratown init [dir] [--install]
  jiratown dev
  jiratown connect doctor
  jiratown connect jira
  jiratown connect obsidian
  jiratown connect reminders
  jiratown sync [--source jira,obsidian]
  jiratown task create --title "Fix websocket reconnect bug" --priority high --status in_progress
  jiratown task ls
  jiratown task done <id>

Environment:
  JIRATOWN_SERVER_URL defaults to ${serverUrl}
`);
}

function value(input: string | boolean | undefined): string | undefined {
  return typeof input === "string" && input.trim().length > 0 ? input.trim() : undefined;
}

function oneLine(value: string): string {
  return value.split(/\r?\n/)[0]!.trim();
}

function templateDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../templates/default");
}

async function copyDirectory(source: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = join(source, entry.name);
    const targetPath = join(target, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
    } else if (entry.isFile()) {
      await mkdir(dirname(targetPath), { recursive: true });
      await copyFile(sourcePath, targetPath);
    }
  }
}

async function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  const child = spawn(command, args, { cwd, stdio: "inherit" });
  await new Promise<void>((resolvePromise, reject) => {
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? 1}`));
    });
    child.on("error", reject);
  });
}

async function readEnvLocal(): Promise<EnvMap> {
  const envPath = resolve(process.cwd(), ".env.local");
  const examplePath = resolve(process.cwd(), ".env.example");
  const path = existsSync(envPath) ? envPath : examplePath;
  if (!existsSync(path)) {
    return {};
  }

  const env: EnvMap = {};
  for (const line of (await readFile(path, "utf8")).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (match?.[1]) {
      env[match[1]] = match[2]?.replace(/^['"]|['"]$/g, "") ?? "";
    }
  }
  return env;
}

async function writeEnvLocal(env: EnvMap): Promise<void> {
  const lines = Object.entries(env)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`);
  await writeFile(resolve(process.cwd(), ".env.local"), `${lines.join("\n")}\n`);
}

async function ask(rl: ReturnType<typeof createInterface>, question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` (${defaultValue})` : "";
  const answer = await rl.question(`${question}${suffix}: `);
  return answer.trim() || defaultValue || "";
}

async function checkJson(url: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    const response = await fetch(url);
    return { ok: response.ok, detail: response.ok ? url : `${url} returned ${response.status}` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "unreachable" };
  }
}

async function checkText(url: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    const response = await fetch(url);
    return { ok: response.ok, detail: response.ok ? url : `${url} returned ${response.status}` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "unreachable" };
  }
}

function printStatus(status: "OK" | "MISSING" | "WARN", name: string, detail: string) {
  console.log(`${status} ${name}: ${detail}`);
}

function isJiraConfigured(env: EnvMap): boolean {
  if (env.JIRATOWN_JIRA_AUTH_MODE === "oauth") {
    return Boolean(env.JIRATOWN_JIRA_CLOUD_ID && env.JIRATOWN_JIRA_ACCESS_TOKEN);
  }
  if (env.JIRATOWN_JIRA_AUTH_MODE === "data-center-pat") {
    return Boolean(env.JIRATOWN_JIRA_BASE_URL && env.JIRATOWN_JIRA_PAT);
  }
  return Boolean(env.JIRATOWN_JIRA_BASE_URL && env.JIRATOWN_JIRA_EMAIL && env.JIRATOWN_JIRA_API_TOKEN);
}

function jiraHint(env: EnvMap): string {
  if (isJiraConfigured(env)) return env.JIRATOWN_JIRA_AUTH_MODE ?? "cloud-api-token";
  return "run `jiratown connect jira`";
}

async function findMarkdownFiles(root: string): Promise<number> {
  let count = 0;
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile() && path.toLowerCase().endsWith(".md")) {
        count += 1;
      }
    }
  }
  const info = await stat(root);
  if (!info.isDirectory()) {
    throw new Error(`Vault path is not a directory: ${root}`);
  }
  await walk(root);
  return count;
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
