# Project Overview

JiraTown is a spatial task visualizer. Tasks from Jira, Apple Reminders, Obsidian, and manual CLI input become NPCs in a pixel office.

## Repository Layout

```text
apps/
  client/   Next.js, React UI, Phaser office scene
  server/   Fastify API, Socket.IO realtime sync, connector scheduler
  cli/      jiratown command, init template, connector setup

packages/
  shared/    task types, labels, common helpers
  engine/    room generation, ECS-style task entity mapping
  connectors/ Jira, Reminders, and Obsidian connectors
  npc-ai/    NPC movement helpers
  ui/        shared UI constants

docs/
  api.md
  connectors.md
  getting-started.md
  project.md
```

## Runtime Architecture

The server owns task state through a small repository interface. Generated apps use local JSON persistence at `.jiratown/tasks.json`; demo seed tasks are only used when `JIRATOWN_DEMO_MODE=true` creates a new store.

The client fetches `/tasks`, connects to Socket.IO, and renders every task as a stationary worker NPC near a desk in a source-derived room.

The connector scheduler runs in the server:

- Jira polls on an interval.
- Reminders polls on an interval.
- Obsidian watches Markdown files when possible and also polls.

All connector output is normalized into `CreateTaskInput`.

## Room Mapping

Rooms are generated from source metadata:

- Jira: `Epic: <jiraEpic>`, falling back to `Space: <jiraSpace>`.
- Reminders: `List: <reminderList>`.
- Obsidian: `Note: <heading | file | vault>`.
- CLI: `Manual Tasks`.

## Task Model

Core fields live in `packages/shared/src/index.ts`.

Important fields:

- `source`: `jira`, `reminders`, `obsidian`, or `cli`
- `externalId`: stable connector id, such as Jira issue key or Obsidian file line id
- `title`
- `status`: `todo`, `in_progress`, `blocked`, `review`, `done`
- `priority`: `low`, `medium`, `high`, `critical`
- source room metadata: `jiraEpic`, `jiraSpace`, `reminderList`, `obsidianFile`, `obsidianHeading`

## Reliability Principles

- Connectors are read-only.
- Sync is per-source; one broken connector does not stop other connectors.
- Manual sync reports skipped/error states in a single line per source.
- Background sync keeps retrying.
- Obsidian uses file watching plus polling fallback.
- API-token, PAT, and OAuth bearer-token Jira modes are separated to avoid ambiguous auth behavior.
