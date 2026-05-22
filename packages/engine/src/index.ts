import { taskRoomLabel, type Task, type TaskPriority, type TaskSource, type TaskStatus } from "@jiratown/shared";

export type Vector2 = {
  x: number;
  y: number;
};

export type MovementComponent = {
  target: Vector2;
  speed: number;
  state: "idle" | "walking" | "working" | "blocked" | "talking" | "sleeping";
};

export type SpriteComponent = {
  key: string;
  tint: number;
  scale: number;
};

export type BalloonComponent = {
  title: string;
  priority: TaskPriority;
  visible: boolean;
};

export type InteractionComponent = {
  hovered: boolean;
  selected: boolean;
};

export type TaskEntity = {
  id: string;
  position: Vector2;
  sprite: SpriteComponent;
  movement: MovementComponent;
  task: Task;
  balloon: BalloonComponent;
  interaction: InteractionComponent;
};

export type OfficeZone = {
  id: string;
  label: string;
  source: TaskSource | "manual";
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

const roomSlots = [
  { x: 64, y: 84, width: 330, height: 220 },
  { x: 418, y: 84, width: 330, height: 220 },
  { x: 772, y: 84, width: 330, height: 220 },
  { x: 64, y: 352, width: 330, height: 210 },
  { x: 418, y: 352, width: 330, height: 210 },
  { x: 772, y: 352, width: 330, height: 210 }
];

export const priorityTint: Record<TaskPriority, number> = {
  low: 0x9ca3af,
  medium: 0x3b82f6,
  high: 0xf97316,
  critical: 0xef4444
};

export const sourceRoomTint: Record<TaskSource | "manual", number> = {
  jira: 0x1f3b57,
  reminders: 0x28513d,
  obsidian: 0x43306b,
  cli: 0x4a3a24,
  manual: 0x4a3a24
};

export function buildOfficeZones(tasks: Task[]): OfficeZone[] {
  const rooms = new Map<string, { label: string; source: TaskSource | "manual" }>();

  for (const task of tasks) {
    const label = taskRoomLabel(task);
    const id = slugRoom(label);
    rooms.set(id, {
      label,
      source: task.source === "cli" ? "manual" : task.source
    });
  }

  if (rooms.size === 0) {
    rooms.set("manual-tasks", { label: "Manual Tasks", source: "manual" });
  }

  return [...rooms.entries()].map(([id, room], index) => ({
    id,
    label: room.label,
    source: room.source,
    bounds: roomSlots[index % roomSlots.length]!
  }));
}

export function zoneForTask(task: Task, zones = buildOfficeZones([task])): OfficeZone {
  const roomId = slugRoom(taskRoomLabel(task));
  return zones.find((zone) => zone.id === roomId) ?? zones[0] ?? buildOfficeZones([])[0]!;
}

export function randomPointInZone(zone: OfficeZone, seed = Math.random()): Vector2 {
  const mixed = Math.abs(Math.sin(seed * 9999));
  const x = zone.bounds.x + 28 + mixed * (zone.bounds.width - 56);
  const y = zone.bounds.y + 34 + Math.abs(Math.cos(seed * 4567)) * (zone.bounds.height - 68);
  return { x, y };
}

export function taskToEntity(task: Task, index: number, zones = buildOfficeZones([task])): TaskEntity {
  const zone = zoneForTask(task, zones);
  const position = randomPointInZone(zone, index + task.id.length);

  return {
    id: task.id,
    position,
    sprite: {
      key: "task-npc",
      tint: priorityTint[task.priority],
      scale: task.priority === "critical" ? 1.18 : task.priority === "high" ? 1.08 : 1
    },
    movement: {
      target: randomPointInZone(zone, index + task.title.length + 2),
      speed: task.priority === "critical" ? 70 : task.priority === "high" ? 58 : 42,
      state: movementStateForStatus(task.status)
    },
    task,
    balloon: {
      title: task.title,
      priority: task.priority,
      visible: false
    },
    interaction: {
      hovered: false,
      selected: false
    }
  };
}

export function movementStateForStatus(status: TaskStatus): MovementComponent["state"] {
  switch (status) {
    case "in_progress":
      return "working";
    case "blocked":
      return "blocked";
    case "review":
      return "talking";
    case "done":
      return "sleeping";
    case "todo":
      return "walking";
  }
}

function slugRoom(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
