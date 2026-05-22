# Project Overview

JiraTown is a spatial task visualizer. Tasks from Jira, Apple Reminders, Obsidian, and manual CLI input become NPCs in a pixel office.

## Repository Layout

```
apps/
  client/   Next.js, React UI, Phaser office scene
  server/   Fastify API, Socket.IO realtime sync, connector scheduler
  cli/      jiratown command, init template, connector setup

packages/
  shared/      task types, labels, common helpers
  engine/      room generation and task entity mapping
  connectors/  Jira, Reminders, and Obsidian connectors
  npc-ai/      NPC movement helpers
  ui/          shared UI constants
```

## Runtime Architecture

The server owns task state through a small repository interface. Generated apps use local JSON persistence at `.jiratown/tasks.json`; demo seed tasks are only used when `JIRATOWN_DEMO_MODE=true` creates a new store.

The client fetches `/tasks`, connects to Socket.IO, and renders every task as a worker NPC near a desk in a source-derived room.

## Room Mapping

| Source | Room Label |
|---|---|
| Jira | `Epic: <jiraEpic>`, falling back to `Space: <jiraSpace>` |
| Reminders | `List: <reminderList>` |
| Obsidian | `Note: <heading \| file \| vault>` |
| CLI | `Manual Tasks` |

## Reliability Principles

- Connectors are read-only.
- Sync is per-source; one broken connector does not stop other connectors.
- Manual sync reports skipped or error states in a single line per source.
- Background sync keeps retrying.
- Jira API-token, PAT, and OAuth bearer-token modes are separated.
