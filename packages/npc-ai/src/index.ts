import { randomPointInZone, zoneForTask, type TaskEntity } from "@jiratown/engine";

export function updateNpc(entity: TaskEntity, deltaMs: number): TaskEntity {
  if (entity.movement.state === "sleeping") {
    return entity;
  }

  const dx = entity.movement.target.x - entity.position.x;
  const dy = entity.movement.target.y - entity.position.y;
  const distance = Math.hypot(dx, dy);

  if (distance < 4) {
    const zone = zoneForTask(entity.task);
    return {
      ...entity,
      movement: {
        ...entity.movement,
        target: randomPointInZone(zone)
      }
    };
  }

  const step = Math.min(distance, (entity.movement.speed * deltaMs) / 1000);
  return {
    ...entity,
    position: {
      x: entity.position.x + (dx / distance) * step,
      y: entity.position.y + (dy / distance) * step
    }
  };
}
