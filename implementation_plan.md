JiraTown — Codex Implementation Plan

Reference Projects

Primary inspiration / architecture references:

* DeskRPG GitHub￼
* Agent Town GitHub￼
* AI Town Starter Kit￼

This project will not fork those repositories directly.
Instead:

* clone them locally for architecture reference
* study rendering/networking/entity systems
* build a clean-room implementation in a new repository

⸻

Vision

A multiplayer pixel-art task world where:

* every Jira ticket / Reminder / manual task becomes a live NPC
* NPCs wander around office desks
* users spatially inspect workload and priority
* tickets visibly move through workflow states
* task overload becomes visual chaos
* blockers physically obstruct NPC movement
* task detail appears through RPG-style dialogue balloons

⸻

Proposed Repo

jiratown/

⸻

Core Product Requirements

Task Sources

1. Jira Sync

Supports:

* Jira Cloud REST API
* OAuth or PAT token
* polling + webhook hybrid sync

Entities:

* ticket
* epic
* assignee
* sprint
* priority
* status
* comments

⸻

2. Manual CLI Tasks

Example:

jt task create \
  --title "Fix websocket reconnect bug" \
  --priority high \
  --status in_progress

Additional commands:

jt task ls
jt task done <id>
jt task sync
jt npc spawn

CLI acts as:

* local-first task injection
* debugging/dev tool
* offline mode

⸻

3. Apple Reminders Sync

Mac-only first implementation.

Integration options:

Phase 1

Use AppleScript:

osascript

or:

reminders-cli

Phase 2

Native bridge:

* Swift helper daemon
* EventKit API
* push sync

Reminder list mapping:

Reminder List	Office Zone
Work	Engineering Floor
Personal	Lobby
Shopping	Storage Room
Urgent	War Room

⸻

Gameplay / UX Requirements

NPC Task Rendering

Every task is an NPC.

NPC behaviors:

* idle wandering
* walking between desks
* sitting at desks
* clustered meetings
* blocked pacing animation
* sleep animation for stale tasks

⸻

Hover Interaction

On hover:

┌─────────────────────────┐
│ Fix Kafka reconnect bug │
└─────────────────────────┘

Requirements:

* animated balloon
* fades in/out
* priority color border
* follows NPC head position

⸻

Click Interaction

Clicking NPC opens expanded RPG dialogue popup.

Contents:

* title
* description
* source
* priority
* assignee
* labels
* comments
* status history
* linked tickets

Example:

┌───────────────────────────────┐
│ [HIGH] Fix websocket timeout  │
│ Status: In Progress           │
│ Assignee: Jay                 │
│ Sprint: Infra Sprint 12       │
│                               │
│ Socket reconnect failing      │
│ after idle period >30s        │
└───────────────────────────────┘

⸻

Priority Table Overlay

Triggered from top-right menu button.

UI:

* modal overlay
* sortable/filterable table
* grouped by:
    * priority
    * sprint
    * assignee
    * source

Columns:

* task title
* status
* age
* priority
* source
* assignee

Hotkeys:

TAB = open table
ESC = close

⸻

Technical Architecture

Frontend

Stack

Component	Technology
Framework	Next.js
Rendering	Phaser 3
UI	React
Styling	Tailwind
Animation	GSAP
State	Zustand
Networking	Socket.IO
Audio	Howler.js

⸻

Backend

Stack

Component	Technology
API	Fastify
Runtime	Node.js
DB	PostgreSQL
Cache	Redis
Realtime	Socket.IO
Queue	BullMQ
ORM	Prisma

⸻

Entity System

ECS Model

Entity
 ├── Position
 ├── Sprite
 ├── Movement
 ├── TaskData
 ├── Animation
 ├── Balloon
 └── Interaction

⸻

Directory Structure

jiratown/
├── apps/
│   ├── client/
│   ├── server/
│   └── cli/
│
├── packages/
│   ├── engine/
│   ├── task-sync/
│   ├── ui/
│   ├── shared/
│   └── npc-ai/
│
├── integrations/
│   ├── jira/
│   ├── reminders/
│   └── manual/
│
├── assets/
│   ├── sprites/
│   ├── tilesets/
│   └── audio/
│
└── docs/

⸻

World Design

Office Zones

Zone	Meaning
Engineering	active tasks
Meeting Room	blocked/review
Graveyard	stale tasks
Boss Room	critical priority
Lounge	completed tasks
Dungeon	incidents/outages

⸻

NPC Visual Mapping

Task State	Animation
TODO	wandering
IN_PROGRESS	typing animation
BLOCKED	pacing
REVIEW	talking
DONE	sleeping/chilling

⸻

Priority Visual Effects

Priority	Visual
Low	gray aura
Medium	blue particles
High	orange flames
Critical	red lightning

⸻

Data Model

Task Entity

type Task = {
  id: string
  source: "jira" | "cli" | "reminders"
  externalId?: string
  title: string
  description?: string
  status:
    | "todo"
    | "in_progress"
    | "blocked"
    | "review"
    | "done"
  priority:
    | "low"
    | "medium"
    | "high"
    | "critical"
  assignee?: string
  createdAt: Date
  updatedAt: Date
  labels: string[]
}

⸻

Jira Integration

Initial Sync

Polling:

every 60 seconds

Webhook support:

ticket updated
ticket created
ticket transitioned
comment added

⸻

Jira Mapping

Jira	Game
Epic	Office wing
Sprint	Day/night cycle
Story Points	NPC size
Blocker	Obstacle
Assignee	Desk ownership

⸻

Apple Reminder Integration

MVP

Mac daemon periodically runs:

osascript read-reminders.scpt

Converts:

{
  "title": "...",
  "priority": "...",
  "completed": false
}

into task entities.

⸻

Multiplayer

Features

* shared office
* multiple users
* synchronized NPCs
* presence indicators
* collaborative inspection

⸻

Rendering Pipeline

Phaser Scene Layers

Ground
Furniture
NPCs
Effects
Balloons
UI Overlay

⸻

NPC AI Behaviors

State Machine

Idle
Walking
Working
Blocked
Talking
Sleeping

⸻

Codex Task Breakdown

Phase 1 — Foundation

Goal

Get office rendering + NPC movement working.

Tasks

* initialize monorepo
* setup Phaser + Next.js
* implement tilemap renderer
* create ECS entity model
* render moving NPCs
* implement hover balloons

Deliverable:

Pixel office with wandering task NPCs

⸻

Phase 2 — Task Backend

Goal

Persistent tasks + sync layer.

Tasks

* PostgreSQL schema
* Prisma setup
* Fastify APIs
* task CRUD
* websocket sync
* CLI client

Deliverable:

CLI-created tasks appear live in office

⸻

Phase 3 — Jira Integration

Goal

Live Jira task ingestion.

Tasks

* OAuth/PAT auth
* Jira polling worker
* webhook endpoint
* ticket mapping layer
* NPC generation rules

Deliverable:

Jira tickets become animated NPCs

⸻

Phase 4 — Reminder Integration

Goal

Apple Reminders ingestion.

Tasks

* AppleScript integration
* EventKit prototype
* reminder polling daemon
* reminder → task mapping

Deliverable:

Apple reminders appear in office

⸻

Phase 5 — Advanced UX

Goal

Polished interaction model.

Tasks

* animated speech balloons
* detailed modal popups
* task table overlay
* minimap
* priority effects
* ambient office sounds

Deliverable:

Playable collaborative task RPG

⸻

Phase 6 — Intelligence Layer

Goal

Autonomous world behavior.

Future Features

* AI scrum master NPC
* automatic clustering
* burnout detection
* sprint heatmaps
* dependency visualization
* ticket congestion simulation

⸻

Suggested Initial Sprint

Week 1

Deliverables

* Phaser office
* tilemap rendering
* one animated NPC
* hover balloon
* websocket sync

⸻

Example Dev Commands

pnpm dev
pnpm dev:client
pnpm dev:server
pnpm cli task create

⸻

Suggested Art Direction

Style:

* cozy cyber office
* Stardew Valley + Habbo + Ragnarok Online
* subtle neon effects
* warm office ambience

Recommended assets:

* LPC sprites
* Kenney office packs
* custom procedural accessories

⸻

MVP Success Criteria

The MVP is successful when:

* tasks sync from Jira
* reminders sync from Apple Reminders
* CLI-created tasks appear instantly
* every task is visible as a moving NPC
* hovering shows titles
* clicking shows detailed popup
* task table overlay works
* multiple users can observe same office

⸻

Recommended Codex Prompt Strategy

Use specialized agents:

Agent	Responsibility
engine-agent	Phaser ECS
backend-agent	APIs/db
sync-agent	Jira/reminders
ui-agent	overlays/balloons
npc-agent	movement/behavior
infra-agent	Docker/devops

⸻

First Commands

git init jiratown
git clone https://github.com/dandacompany/deskrpg references/deskrpg
git clone https://github.com/geezerrrr/agent-town references/agent-town

Then:

pnpm create next-app
pnpm add phaser zustand socket.io

⸻

Key Design Principle

Do NOT build:

* another kanban board

Build:

* a living spatial visualization of engineering workload

Where:

* task pressure
* blockers
* priorities
* engineering chaos

are immediately visible through movement, density, and world behavior.