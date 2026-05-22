# Connector Setup

JiraTown connectors are read-only. They import external tasks into the live office and broadcast updates over Socket.IO.

## Quick Check

```bash
jiratown dev
jiratown connect doctor
jiratown sync
```

`connect doctor` reports which connectors are configured and how often each one syncs.

## Jira Cloud

```env
JIRATOWN_JIRA_AUTH_MODE=cloud-api-token
JIRATOWN_JIRA_BASE_URL=https://company.atlassian.net
JIRATOWN_JIRA_EMAIL=you@company.com
JIRATOWN_JIRA_API_TOKEN=...
JIRATOWN_JIRA_JQL='assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC'
```

Imported Jira fields map issue key, epic or project, status, priority, assignee, sprint, and labels into JiraTown task metadata.

## Jira Cloud OAuth

```env
JIRATOWN_JIRA_AUTH_MODE=oauth
JIRATOWN_JIRA_CLOUD_ID=...
JIRATOWN_JIRA_ACCESS_TOKEN=...
```

OAuth requests use Atlassian's API gateway path: `https://api.atlassian.com/ex/jira/{cloudId}`.

## Jira Data Center / Server

```env
JIRATOWN_JIRA_AUTH_MODE=data-center-pat
JIRATOWN_JIRA_BASE_URL=https://jira.company.com
JIRATOWN_JIRA_PAT=...
```

This uses `Authorization: Bearer <token>`.

## Apple Reminders

```env
JIRATOWN_REMINDERS_LISTS=Work,Personal
JIRATOWN_REMINDERS_SYNC_INTERVAL_MS=15000
```

Apple Reminders sync is macOS only. If sync is blocked, allow your terminal app to automate Reminders in System Settings > Privacy & Security > Automation.

## Obsidian

```env
JIRATOWN_OBSIDIAN_VAULT=/Users/you/Documents/Obsidian/My Vault
JIRATOWN_OBSIDIAN_INCLUDE=Tasks.md,Projects/
JIRATOWN_OBSIDIAN_SYNC_INTERVAL_MS=5000
```

Tasks are parsed from Markdown checkbox syntax:

```markdown
# Realtime Platform

- [ ] Fix reconnect bug #high #doing
- [ ] Unblock deploy #critical #blocked
- [x] Archive stale sprint tickets
```

Heading, file path, checkbox state, status tags, priority tags, and labels are normalized into JiraTown tasks.

## Manual Sync

```bash
jiratown sync
jiratown sync --source jira
jiratown sync --source reminders,obsidian
```

Connector failures do not stop the server. Failed connectors are reported as skipped in sync output, and the next polling interval will try again.
