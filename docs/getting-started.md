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

Open:

- Client: http://localhost:3000
- API server: http://localhost:4000

Tasks persist in `.jiratown/tasks.json`. New apps start empty by default; set `JIRATOWN_DEMO_MODE=true` before the first server launch if you want sample tasks.

## Verify The App

```bash
curl http://localhost:4000/health
jiratown task ls
jiratown connect doctor
```

Expected behavior:

- `/health` returns `{"ok":true,"service":"jiratown-server"}`.
- `task ls` prints current tasks.
- `connect doctor` reports `OK`, `MISSING`, or `WARN` for server, client, Jira, Reminders, and Obsidian.

## Configure Connectors

Use guided setup:

```bash
jiratown connect jira
jiratown connect obsidian
jiratown connect reminders
```

The commands write `.env.local` in the generated app. You can also edit `.env.local` directly.

Common setups:

- Jira Cloud: set `JIRATOWN_JIRA_BASE_URL`, `JIRATOWN_JIRA_EMAIL`, and `JIRATOWN_JIRA_API_TOKEN`.
- Internal Jira OAuth: set `JIRATOWN_JIRA_AUTH_MODE=oauth`, `JIRATOWN_JIRA_CLOUD_ID`, and `JIRATOWN_JIRA_ACCESS_TOKEN`.
- Jira Data Center: set `JIRATOWN_JIRA_AUTH_MODE=data-center-pat`, `JIRATOWN_JIRA_BASE_URL`, and `JIRATOWN_JIRA_PAT`.
- Apple Reminders: optionally set `JIRATOWN_REMINDERS_LISTS`.
- Obsidian: set `JIRATOWN_OBSIDIAN_VAULT`.

Detailed connector instructions are in [Connector Setup](https://cdn.jsdelivr.net/npm/jiratown/docs/connectors.html).

## Sync Now

JiraTown syncs in the background, but you can force a sync:

```bash
jiratown sync
jiratown sync --source jira
jiratown sync --source reminders,obsidian
```

Connector failures are reported per source and do not stop the server.

## Create Manual Tasks

```bash
jiratown task create --title "Fix websocket reconnect bug" --priority high --status in_progress
jiratown task create --title "Sync reminders" --source reminders --reminder-list Work
jiratown task create --title "Review launch plan" --source obsidian --external-id "Launch.md:1"
```

Manual tasks appear live in the office through Socket.IO and are written to `.jiratown/tasks.json`.

## Troubleshooting

If Reminders sync fails, open Reminders once and grant Automation permissions for your terminal app in macOS System Settings.

If Jira sync is missing issues, confirm the JQL query works in Jira first, then run:

```bash
jiratown sync --source jira
```
