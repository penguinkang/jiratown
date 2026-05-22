# JiraTown

JiraTown is a pixel RPG workload visualizer. Jira tickets, Apple Reminders, Obsidian tasks, and manual tasks become NPCs that move through an office world based on priority and workflow status.

## Quick Start

```bash
npx jiratown init my-office
cd my-office
pnpm install
jiratown dev
```

Client: http://localhost:3000

Server: http://localhost:4000

Tasks are stored locally by default in `.jiratown/tasks.json`. The generated app creates `.env.local` from `.env.example` so connector setup stays local to your machine.

## Commands

```bash
jiratown init [dir] [--install]
jiratown dev
jiratown connect doctor
jiratown connect jira
jiratown connect obsidian
jiratown connect reminders
jiratown sync --source jira,obsidian
jiratown task create --title "Fix websocket reconnect bug" --priority high
jiratown task ls
jiratown task done <id>
```

## Documentation

- [Getting Started](https://github.com/penguinkang/jiratown/blob/main/apps/cli/docs/getting-started.md)
- [Connector Setup](https://github.com/penguinkang/jiratown/blob/main/apps/cli/docs/connectors.md)
- [API Reference](https://github.com/penguinkang/jiratown/blob/main/apps/cli/docs/api.md)
- [Project Overview](https://github.com/penguinkang/jiratown/blob/main/apps/cli/docs/project.md)
