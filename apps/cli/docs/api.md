# API Reference

The default server listens on `http://localhost:4000`.

## GET /health

```json
{"ok":true,"service":"jiratown-server"}
```

## GET /tasks

Returns all tasks sorted by creation time.

```json
{
  "tasks": [
    {
      "id": "JT-101",
      "source": "jira",
      "title": "Fix websocket reconnect bug",
      "status": "in_progress",
      "priority": "high",
      "labels": []
    }
  ]
}
```

## POST /tasks

Creates a manual task and broadcasts `task.created`.

```bash
curl -X POST http://localhost:4000/tasks \
  -H 'content-type: application/json' \
  -d '{"title":"Fix websocket reconnect bug","priority":"high"}'
```

## POST /tasks/:id/done

Marks a task done and broadcasts `task.updated`.

## PATCH /tasks/:id/status

Updates status to `todo`, `in_progress`, `blocked`, `review`, or `done`.

## GET /sync/status

Returns connector configuration status and polling intervals.

## POST /sync

Triggers connector sync. If `sources` is omitted, all connectors run.

```json
{
  "sources": ["jira", "obsidian"]
}
```

## Socket.IO

Clients receive `task:event` messages: `tasks.snapshot`, `task.created`, `task.updated`, and `task.deleted`.
