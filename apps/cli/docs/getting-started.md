# Getting Started

This guide creates a local JiraTown app and connects it to task sources.

## Requirements

- Node.js 22+
- pnpm 9+
- macOS if you want Apple Reminders sync

## Create An App

```bash
npx jiratown init my-office
cd my-office
pnpm install
jiratown dev
```

Client: http://localhost:3000  
API server: http://localhost:4000

Tasks persist in `.jiratown/tasks.json`. New apps start empty by default; set `JIRATOWN_DEMO_MODE=true` before the first server launch if you want sample tasks.

## Verify The App

```bash
curl http://localhost:4000/health
jiratown task ls
jiratown connect doctor
```

- `/health` returns `{"ok":true,"service":"jiratown-server"}`.
- `task ls` prints current tasks.
- `connect doctor` reports `OK`, `MISSING`, or `WARN` for server, client, Jira, Reminders, and Obsidian.

## Configure Connectors

```bash
jiratown connect jira
jiratown connect obsidian
jiratown connect reminders
```

The commands write `.env.local` in the generated app. You can also edit `.env.local` directly.

Detailed connector instructions are in [Connector Setup](./connectors.md).

## Sync Now

```bash
jiratown sync
jiratown sync --source jira
jiratown sync --source reminders,obsidian
```

## Create Manual Tasks

```bash
jiratown task create --title "Fix websocket reconnect bug" --priority high --status in_progress
jiratown task create --title "Sync reminders" --source reminders --reminder-list Work
jiratown task create --title "Review launch plan" --source obsidian --external-id "Launch.md:1"
```

Manual tasks appear live in the office through Socket.IO and are written to `.jiratown/tasks.json`.
