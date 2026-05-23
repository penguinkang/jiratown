import { buildOfficeZones, priorityTint, sourceRoomTint, taskToEntity, zoneForTask, type OfficeZone, type TaskEntity } from "@jiratown/engine";
import type { Task } from "@jiratown/shared";
import { taskRoomLabel } from "@jiratown/shared";
import * as Phaser from "phaser";

type NpcRender = {
  entity: TaskEntity;
  body: Phaser.GameObjects.Container;
  basePosition: Phaser.Math.Vector2;
  head: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  roomMarker: Phaser.GameObjects.Text;
  balloon: Phaser.GameObjects.Container;
};

type AvatarAppearance = {
  skin: number;
  hair: number;
  outfit: number;
  accent: number;
  hairStyle: "short" | "bob" | "bun" | "side";
  accessory: "glasses" | "file" | "badge" | "coffee";
};

const worldWidth = 1152;
const worldHeight = 720;

export class OfficeScene extends Phaser.Scene {
  private tasks: Task[] = [];
  private npcs = new Map<string, NpcRender>();
  private roomPage = 0;
  private roomsPerPage = 6;
  private zones: OfficeZone[] = buildOfficeZones([]);
  private visibleZones: OfficeZone[] = [];
  private officeObjects: Phaser.GameObjects.GameObject[] = [];
  private ready = false;
  private onSelectTask: (taskId: string) => void;

  constructor(onSelectTask: (taskId: string) => void, roomPage = 0, roomsPerPage = 6) {
    super("office");
    this.onSelectTask = onSelectTask;
    this.roomPage = roomPage;
    this.roomsPerPage = roomsPerPage;
  }

  create() {
    this.ready = true;
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    this.drawOffice(this.zones);
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.cameras.main.scrollX += (pointer.x < 24 ? -4 : pointer.x > this.scale.width - 24 ? 4 : 0);
      this.cameras.main.scrollY += (pointer.y < 24 ? -4 : pointer.y > this.scale.height - 24 ? 4 : 0);
    });
    this.setTasks(this.tasks);
  }

  setTasks(tasks: Task[]) {
    this.tasks = tasks;
    if (!this.ready) {
      return;
    }

    const existingIds = new Set(this.npcs.keys());
    this.zones = buildOfficeZones(tasks);
    this.visibleZones = this.zones.slice(this.roomPage * this.roomsPerPage, (this.roomPage + 1) * this.roomsPerPage);
    this.drawOffice(this.visibleZones);
    const activeTasks = tasks.filter((task) => task.status !== "done");
    const entities = activeTasks.map((task, index) => {
      const entity = taskToEntity(task, index, this.visibleZones.length > 0 ? this.visibleZones : this.zones);
      entity.position = this.positionNearDesk(entity.task, index, this.visibleZones.length > 0 ? this.visibleZones : this.zones);
      entity.movement.target = entity.position;
      return entity;
    }).filter((entity) => this.visibleZones.some((zone) => zone.id === zoneForTask(entity.task, this.zones).id));

    for (const entity of entities) {
      existingIds.delete(entity.id);
      const current = this.npcs.get(entity.id);
      if (current) {
        current.entity = {
          ...entity
        };
        current.basePosition.set(entity.position.x, entity.position.y);
        current.head.setFillStyle(entity.sprite.tint);
        current.label.setText(npcLabel(entity.task));
        current.roomMarker.setText(taskRoomLabel(entity.task).replace(/^(Epic|Space|List): /, ""));
        current.body.setScale(entity.sprite.scale);
        continue;
      }
      try {
        this.npcs.set(entity.id, this.createNpc(entity));
      } catch (error) {
        console.error("Failed to create NPC", entity.id, error);
        this.npcs.set(entity.id, this.createFallbackNpc(entity));
      }
    }

    for (const staleId of existingIds) {
      const render = this.npcs.get(staleId);
      render?.body.destroy(true);
      render?.balloon.destroy(true);
      this.npcs.delete(staleId);
    }
  }

  setRoomPage(roomPage: number, roomsPerPage: number) {
    this.roomPage = roomPage;
    this.roomsPerPage = roomsPerPage;
    if (this.ready) {
      this.setTasks(this.tasks);
    }
  }

  update(_time: number, delta: number) {
    for (const render of this.npcs.values()) {
      this.advanceNpc(render, delta);
      const idleOffset = Math.sin(this.time.now / 900 + hashNumber(render.entity.id)) * 1.5;
      render.body.setPosition(render.basePosition.x, render.basePosition.y + idleOffset);
      render.balloon.setPosition(render.entity.position.x, render.entity.position.y - 54);
    }
  }

  private drawOffice(zones: OfficeZone[]) {
    for (const object of this.officeObjects) {
      object.destroy();
    }
    this.officeObjects = [];

    for (const zone of zones) {
      const fill = sourceRoomTint[zone.source];
      const room = this.add.rectangle(
        zone.bounds.x + zone.bounds.width / 2,
        zone.bounds.y + zone.bounds.height / 2,
        zone.bounds.width,
        zone.bounds.height,
        fill
      ).setDepth(1);
      const border = this.add.rectangle(
        zone.bounds.x + zone.bounds.width / 2,
        zone.bounds.y + zone.bounds.height / 2,
        zone.bounds.width,
        zone.bounds.height
      ).setStrokeStyle(2, 0xdbeafe, 0.5).setDepth(2);
      const label = this.add.text(zone.bounds.x + 12, zone.bounds.y + 10, zone.label, {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#dbeafe"
      }).setDepth(3);
      const source = this.add.text(zone.bounds.x + 12, zone.bounds.y + 30, zone.source === "manual" ? "CLI" : zone.source.toUpperCase(), {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#bfdbfe"
      }).setDepth(3);
      this.officeObjects.push(room, border, label, source);
    }

    this.drawDesks(zones);
  }

  private drawDesks(zones: OfficeZone[]) {
    const deskColor = 0x8b6f47;
    const monitorColor = 0x94a3b8;

    for (const zone of zones) {
      for (const [x, y] of deskPositions(zone)) {
        this.officeObjects.push(this.add.rectangle(x, y, 70, 34, deskColor).setDepth(4));
        this.officeObjects.push(this.add.rectangle(x, y - 10, 28, 10, monitorColor).setDepth(5));
        this.officeObjects.push(this.add.rectangle(x, y + 18, 62, 7, 0x5b4632).setDepth(5));
      }
    }
  }

  private createNpc(entity: TaskEntity): NpcRender {
    const appearance = avatarAppearance(entity.id);
    const body = this.add.container(entity.position.x, entity.position.y);
    const shadow = this.add.ellipse(0, 18, 38, 12, 0x000000, 0.25);
    const legs = this.add.rectangle(-6, 17, 8, 22, 0x1f2937);
    const legsRight = this.add.rectangle(7, 17, 8, 22, 0x1f2937);
    const shoes = this.add.rectangle(0, 29, 28, 6, 0x0f172a);
    const torso = this.add.rectangle(0, -2, 30, 34, appearance.outfit).setStrokeStyle(2, priorityTint[entity.task.priority], 0.9);
    const shirt = this.add.triangle(0, -10, -8, -18, 8, -18, 0, -5, 0xf8fafc);
    const tie = this.add.rectangle(0, -2, 5, 18, appearance.accent);
    const armLeft = this.add.rectangle(-20, 0, 7, 30, appearance.skin);
    const armRight = this.add.rectangle(20, 0, 7, 30, appearance.skin);
    const head = this.add.circle(0, -31, 15, appearance.skin);
    const face = this.add.circle(0, -31, 13, appearance.skin);
    const hair = this.createHair(appearance);
    const eyes = [
      this.add.circle(-5, -32, 1.8, 0x111827),
      this.add.circle(5, -32, 1.8, 0x111827)
    ];
    const smile = this.add.rectangle(0, -25, 9, 2, 0x111827);
    const accessory = this.createAccessory(appearance);
    const label = this.add.text(0, 31, npcLabel(entity.task), {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#e2e8f0",
      backgroundColor: "#0f172a",
      padding: { x: 4, y: 2 }
    }).setOrigin(0.5, 0);
    const roomMarker = this.add.text(0, 44, taskRoomLabel(entity.task).replace(/^(Epic|Space|List): /, ""), {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#f8fafc",
      backgroundColor: "#334155",
      padding: { x: 4, y: 1 }
    }).setOrigin(0.5, 0);

    body.add([shadow, legs, legsRight, shoes, armLeft, armRight, torso, shirt, tie, head, face, ...hair, ...eyes, smile, ...accessory, label, roomMarker]);
    body.setScale(entity.sprite.scale);
    body.setSize(42, 68);
    body.setDepth(20);
    body.setInteractive(new Phaser.Geom.Rectangle(-21, -45, 42, 76), Phaser.Geom.Rectangle.Contains);
    body.on("pointerover", () => this.showBalloon(entity.id, true));
    body.on("pointerout", () => this.showBalloon(entity.id, false));
    body.on("pointerdown", () => this.onSelectTask(entity.id));

    const balloon = this.createBalloon(entity);
    balloon.setDepth(30);
    balloon.setVisible(false);

    if (entity.task.priority === "critical") {
      this.tweens.add({
        targets: head,
        alpha: 0.45,
        duration: 300,
        yoyo: true,
        repeat: -1
      });
    }

    return { entity, body, basePosition: new Phaser.Math.Vector2(entity.position.x, entity.position.y), head, label, roomMarker, balloon };
  }

  private createFallbackNpc(entity: TaskEntity): NpcRender {
    const body = this.add.container(entity.position.x, entity.position.y);
    const marker = this.add.circle(0, 0, 18, priorityTint[entity.task.priority]).setStrokeStyle(3, 0xffffff, 0.9);
    const label = this.add.text(0, 24, npcLabel(entity.task), {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#f8fafc",
      backgroundColor: "#0f172a",
      padding: { x: 4, y: 2 }
    }).setOrigin(0.5, 0);
    const roomMarker = this.add.text(0, 38, taskRoomLabel(entity.task).replace(/^(Epic|Space|List): /, ""), {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#f8fafc",
      backgroundColor: "#334155",
      padding: { x: 4, y: 1 }
    }).setOrigin(0.5, 0);

    body.add([marker, label, roomMarker]);
    body.setSize(42, 68);
    body.setDepth(20);
    body.setInteractive(new Phaser.Geom.Rectangle(-21, -24, 42, 68), Phaser.Geom.Rectangle.Contains);
    body.on("pointerover", () => this.showBalloon(entity.id, true));
    body.on("pointerout", () => this.showBalloon(entity.id, false));
    body.on("pointerdown", () => this.onSelectTask(entity.id));

    const balloon = this.createBalloon(entity);
    balloon.setDepth(30);
    balloon.setVisible(false);

    return { entity, body, basePosition: new Phaser.Math.Vector2(entity.position.x, entity.position.y), head: marker, label, roomMarker, balloon };
  }

  private createHair(appearance: AvatarAppearance): Phaser.GameObjects.GameObject[] {
    if (appearance.hairStyle === "bob") {
      return [
        this.add.rectangle(0, -39, 27, 9, appearance.hair),
        this.add.rectangle(-12, -32, 7, 15, appearance.hair),
        this.add.rectangle(12, -32, 7, 15, appearance.hair)
      ];
    }
    if (appearance.hairStyle === "bun") {
      return [
        this.add.rectangle(0, -40, 28, 8, appearance.hair),
        this.add.circle(15, -42, 6, appearance.hair)
      ];
    }
    if (appearance.hairStyle === "side") {
      return [
        this.add.rectangle(0, -40, 28, 8, appearance.hair),
        this.add.rectangle(-12, -32, 7, 18, appearance.hair)
      ];
    }
    return [this.add.rectangle(0, -40, 28, 8, appearance.hair)];
  }

  private createAccessory(appearance: AvatarAppearance): Phaser.GameObjects.GameObject[] {
    if (appearance.accessory === "glasses") {
      return [
        this.add.rectangle(-5, -32, 8, 5).setStrokeStyle(1, 0x111827),
        this.add.rectangle(5, -32, 8, 5).setStrokeStyle(1, 0x111827),
        this.add.rectangle(0, -32, 3, 1, 0x111827)
      ];
    }
    if (appearance.accessory === "file") {
      return [
        this.add.rectangle(22, 4, 14, 20, 0xfacc15).setStrokeStyle(1, 0x92400e),
        this.add.rectangle(19, -6, 8, 4, 0xfef3c7)
      ];
    }
    if (appearance.accessory === "coffee") {
      return [
        this.add.rectangle(-22, 3, 10, 13, 0xf8fafc).setStrokeStyle(1, 0x334155),
        this.add.rectangle(-22, -5, 11, 3, 0x7c2d12)
      ];
    }
    return [this.add.rectangle(10, -6, 7, 9, 0xf8fafc).setStrokeStyle(1, appearance.accent)];
  }

  private createBalloon(entity: TaskEntity): Phaser.GameObjects.Container {
    const width = Math.min(300, Math.max(150, entity.task.title.length * 8 + 24));
    const box = this.add.rectangle(0, 0, width, 34, 0xfffbeb, 0.96).setStrokeStyle(3, priorityTint[entity.task.priority]);
    const text = this.add.text(0, 0, entity.task.title, {
      fontFamily: "monospace",
      fontSize: "13px",
      color: "#111827",
      wordWrap: { width: width - 20 }
    }).setOrigin(0.5);
    const tail = this.add.triangle(0, 24, -8, 0, 8, 0, 0, 10, 0xfffbeb, 0.96);

    return this.add.container(entity.position.x, entity.position.y - 54, [box, text, tail]);
  }

  private showBalloon(taskId: string, visible: boolean) {
    const render = this.npcs.get(taskId);
    if (!render) return;
    render.balloon.setVisible(visible);
    render.balloon.setAlpha(visible ? 0 : 1);
    this.tweens.add({
      targets: render.balloon,
      alpha: visible ? 1 : 0,
      y: render.entity.position.y - (visible ? 62 : 54),
      duration: 140,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (!visible) render.balloon.setVisible(false);
      }
    });
  }

  private advanceNpc(render: NpcRender, delta: number) {
    const entity = render.entity;
    void delta;
    if (entity.task.status === "blocked") {
      render.body.rotation = Math.sin(this.time.now / 180) * 0.025;
    } else if (entity.task.status === "done") {
      render.body.rotation = Math.sin(this.time.now / 1000) * 0.012;
    } else {
      render.body.rotation = Math.sin(this.time.now / 1200) * 0.01;
    }
  }

  private positionNearDesk(task: Task, index: number, zones = this.zones): Phaser.Math.Vector2 {
    const zone = zoneForTask(task, zones);
    const desks = deskPositions(zone);
    const seed = hashNumber(`${task.id}-${task.title}-${index}`);
    const desk = desks[seed % desks.length] ?? [zone.bounds.x + zone.bounds.width / 2, zone.bounds.y + zone.bounds.height / 2];
    const spots: Array<[number, number]> = [
      [-34, 43],
      [34, 43],
      [-34, -42],
      [34, -42],
      [0, 48]
    ];
    const spot = spots[Math.floor(seed / 7) % spots.length] ?? [0, 48];
    const jitterX = (seed % 9) - 4;
    const jitterY = (Math.floor(seed / 11) % 7) - 3;
    return new Phaser.Math.Vector2(desk[0] + spot[0] + jitterX, desk[1] + spot[1] + jitterY);
  }
}

function deskPositions(zone: OfficeZone): Array<[number, number]> {
  return [
    [zone.bounds.x + 74, zone.bounds.y + 86],
    [zone.bounds.x + 174, zone.bounds.y + 86],
    [zone.bounds.x + 74, zone.bounds.y + 160],
    [zone.bounds.x + 174, zone.bounds.y + 160]
  ];
}

function avatarAppearance(id: string): AvatarAppearance {
  const seed = hashNumber(id);
  const skins = [0xf2c6a0, 0xc98b5f, 0x8d5524, 0xffdbac, 0xb87852];
  const hairs = [0x111827, 0x3f2a1d, 0x7c2d12, 0xd6a24a, 0x4b5563];
  const outfits = [0x1e3a8a, 0x334155, 0x581c87, 0x0f766e, 0x7f1d1d, 0x374151];
  const accents = [0xef4444, 0x38bdf8, 0xfacc15, 0xa78bfa, 0x22c55e];
  const hairStyles: AvatarAppearance["hairStyle"][] = ["short", "bob", "bun", "side"];
  const accessories: AvatarAppearance["accessory"][] = ["glasses", "file", "badge", "coffee"];

  return {
    skin: skins[seed % skins.length]!,
    hair: hairs[Math.floor(seed / 3) % hairs.length]!,
    outfit: outfits[Math.floor(seed / 5) % outfits.length]!,
    accent: accents[Math.floor(seed / 7) % accents.length]!,
    hairStyle: hairStyles[Math.floor(seed / 11) % hairStyles.length]!,
    accessory: accessories[Math.floor(seed / 13) % accessories.length]!
  };
}

function hashNumber(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function npcLabel(task: Task): string {
  if (task.source === "jira") {
    return task.externalId ?? task.id;
  }

  const compactTitle = task.title.length > 18 ? `${task.title.slice(0, 16)}...` : task.title;
  return compactTitle;
}
