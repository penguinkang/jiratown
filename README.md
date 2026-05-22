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

Tasks are stored locally by default in `.jiratown/tasks.json`. The generated app also creates `.env.local` from `.env.example` so connector setup stays local to your machine.

## CLI

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

## Packages

- `jiratown`: small CLI package and `jiratown`/`jt` commands.
- `@jiratown/server`: Fastify API, Socket.IO realtime updates, sync scheduler, and local JSON task store.
- `@jiratown/client`: Next/React/Phaser app shell.
- `@jiratown/connectors`: Jira, Apple Reminders, and Obsidian adapters.
- `@jiratown/shared`: task types, labels, and common helpers.
- `@jiratown/engine`: room/entity mapping and visual rules.

## Development

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm build
```

This repository remains a pnpm monorepo for development, but published packages include only their declared files and compiled `dist` output where applicable.

## Migration From `jiratown@0.1.x`

Earlier versions expected users to clone the repository and run workspace commands such as `pnpm cli` or `pnpm dev`. The recommended flow is now a generated local app:

```bash
npx jiratown init my-office
cd my-office
pnpm install
jiratown dev
```

Move any existing connector environment variables into the generated app’s `.env.local`. Manual tasks now persist in `.jiratown/tasks.json`; set `JIRATOWN_DEMO_MODE=true` only when you want the old seeded demo tasks on first launch.

## Documentation

- [Getting Started](https://cdn.jsdelivr.net/npm/jiratown/docs/getting-started.html)
- [Connector Setup](https://cdn.jsdelivr.net/npm/jiratown/docs/connectors.html)
- [API Reference](https://cdn.jsdelivr.net/npm/jiratown/docs/api.html)
- [Project Overview](https://cdn.jsdelivr.net/npm/jiratown/docs/project.html)
