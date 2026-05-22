# JiraTown Connectors

JiraTown connectors are read-only. They import external tasks into the live office and broadcast updates over Socket.IO.

## Quick Check

Use the generated app’s `.env.local`, configure the sources you use, restart JiraTown, then run:

```bash
jiratown dev
jiratown connect doctor
jiratown sync
```

`connect doctor` reports which connectors are configured and how often each one syncs.

## Jira Cloud

Use this for Atlassian-hosted Jira sites such as `https://company.atlassian.net`.

```bash
JIRATOWN_JIRA_AUTH_MODE=cloud-api-token
JIRATOWN_JIRA_BASE_URL=https://company.atlassian.net
JIRATOWN_JIRA_EMAIL=you@company.com
JIRATOWN_JIRA_API_TOKEN=...
JIRATOWN_JIRA_JQL='assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC'
```

Imported mapping:

- issue key -> NPC label
- epic parent summary -> room
- project name/key -> room fallback
- status -> NPC state
- priority -> NPC visual priority
- assignee, sprint, labels -> details popup

For internal work Jira accounts, this may be blocked by company policy. If API tokens are disabled, use a company-approved OAuth app in a later deployment, or Jira Data Center PAT mode if your company hosts Jira itself.

## Jira Cloud OAuth

Use this when a company admin has approved an Atlassian OAuth 2.0 app and JiraTown receives an access token from that flow:

```bash
JIRATOWN_JIRA_AUTH_MODE=oauth
JIRATOWN_JIRA_CLOUD_ID=...
JIRATOWN_JIRA_ACCESS_TOKEN=...
JIRATOWN_JIRA_JQL='assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC'
```

OAuth requests use Atlassian's API gateway path: `https://api.atlassian.com/ex/jira/{cloudId}`.

## Jira Data Center / Server

```bash
JIRATOWN_JIRA_AUTH_MODE=data-center-pat
JIRATOWN_JIRA_BASE_URL=https://jira.company.com
JIRATOWN_JIRA_PAT=...
```

This uses `Authorization: Bearer <token>`.

## Apple Reminders

macOS only:

```bash
JIRATOWN_REMINDERS_LISTS=Work,Personal
JIRATOWN_REMINDERS_SYNC_INTERVAL_MS=15000
```

The current connector uses `osascript` and reads incomplete reminders. Reminder list names become rooms.

The first run may trigger macOS Automation or Reminders permissions. If sync returns no reminders, open System Settings and allow Terminal or your shell app to automate Reminders.

## Obsidian

Point JiraTown at a local vault:

```bash
JIRATOWN_OBSIDIAN_VAULT=/Users/you/Documents/Obsidian/My Vault
JIRATOWN_OBSIDIAN_INCLUDE=Tasks.md,Projects/
JIRATOWN_OBSIDIAN_SYNC_INTERVAL_MS=5000
```

Markdown tasks are imported from `.md` files:

```md
# Realtime Platform

- [ ] Fix reconnect bug #high #doing
- [ ] Unblock deploy #critical #blocked
- [x] Archive stale sprint tickets
```

Imported mapping:

- heading -> room
- file path -> external id prefix
- checked task -> done
- `#blocked`, `#review`, `#doing`, `#in-progress` -> status
- `#critical`, `#high`, `#low` or `!!!`, `!!` -> priority
- other tags -> labels

Obsidian sync uses a file watcher when available and falls back to polling.

## Near Real-Time Behavior

Default intervals:

- Jira: 60 seconds
- Reminders: 15 seconds
- Obsidian: file watcher plus 5 second polling fallback

Manual trigger:

```bash
jiratown sync
jiratown sync --source jira
jiratown sync --source reminders,obsidian
```

Connector failures do not stop the server. Failed connectors are reported as skipped in sync output, and the next polling interval will try again.
