# API Reference

Base URL:

```text
http://localhost:4000
```

## Health

```http
GET /health
```

Response:

```json
{
  "ok": true,
  "service": "jiratown-server"
}
```

## List Tasks

```http
GET /tasks
```

Response:

```json
{
  "tasks": [
    {
      "id": "JT-101",
      "source": "jira",
      "externalId": "ENG-241",
      "title": "Fix websocket reconnect bug",
      "status": "in_progress",
      "priority": "high",
      "jiraEpic": "Realtime Platform",
      "jiraSpace": "Engineering",
      "labels": ["websocket", "infra"],
      "createdAt": "2026-05-19T00:00:00.000Z",
      "updatedAt": "2026-05-19T00:00:00.000Z"
    }
  ]
}
```

## Create Task

```http
POST /tasks
Content-Type: application/json
```

Body:

```json
{
  "title": "Fix websocket reconnect bug",
  "source": "cli",
  "status": "in_progress",
  "priority": "high",
  "assignee": "Jay",
  "labels": ["infra"]
}
```

Response: `201 Created`

```json
{
  "task": {
    "id": "generated-id",
    "source": "cli",
    "title": "Fix websocket reconnect bug",
    "status": "in_progress",
    "priority": "high"
  }
}
```

## Mark Done

```http
POST /tasks/:id/done
```

Response:

```json
{
  "task": {
    "id": "JT-101",
    "status": "done"
  }
}
```

## Update Status

```http
PATCH /tasks/:id/status
Content-Type: application/json
```

Body:

```json
{
  "status": "blocked"
}
```

Valid statuses:

- `todo`
- `in_progress`
- `blocked`
- `review`
- `done`

## Connector Status

```http
GET /sync/status
```

Response:

```json
{
  "configured": {
    "jira": false,
    "reminders": true,
    "obsidian": false
  },
  "intervals": {
    "jira": 60000,
    "reminders": 15000,
    "obsidian": 5000
  }
}
```

## Trigger Sync

```http
POST /sync
Content-Type: application/json
```

Body:

```json
{
  "sources": ["jira", "obsidian"]
}
```

If `sources` is omitted, all connectors run.

Response:

```json
{
  "results": [
    {
      "source": "jira",
      "tasks": [],
      "skipped": "Jira is not configured."
    },
    {
      "source": "obsidian",
      "tasks": [
        {
          "source": "obsidian",
          "externalId": "Tasks.md:1",
          "title": "Fix reconnect bug",
          "status": "in_progress",
          "priority": "high",
          "obsidianFile": "Tasks.md",
          "obsidianHeading": "Realtime Platform"
        }
      ]
    }
  ],
  "taskCount": 6
}
```

Connector failures are reported in the relevant result item and do not stop other connector results.

## Realtime Events

Socket.IO endpoint:

```text
ws://localhost:4000
```

Event name:

```text
task:event
```

Event payloads:

```ts
type TaskEvent =
  | { type: "tasks.snapshot"; tasks: Task[] }
  | { type: "task.created"; task: Task }
  | { type: "task.updated"; task: Task }
  | { type: "task.deleted"; taskId: string };
```

On connection, the server immediately emits `tasks.snapshot`.
