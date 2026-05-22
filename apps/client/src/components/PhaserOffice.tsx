"use client";

import { useEffect, useRef } from "react";
import type { Task } from "@jiratown/shared";
import type * as PhaserNamespace from "phaser";

type PhaserOfficeProps = {
  tasks: Task[];
  roomPage: number;
  roomsPerPage: number;
  onSelectTask: (taskId: string) => void;
};

export function PhaserOffice({ tasks, roomPage, roomsPerPage, onSelectTask }: PhaserOfficeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<PhaserNamespace.Game | null>(null);
  const sceneRef = useRef<OfficeSceneApi | null>(null);
  const onSelectRef = useRef(onSelectTask);
  const tasksRef = useRef(tasks);

  useEffect(() => {
    onSelectRef.current = onSelectTask;
  }, [onSelectTask]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (!containerRef.current || gameRef.current) return;
      const Phaser = await import("phaser");
      const { OfficeScene } = await import("../game/OfficeScene");
      if (cancelled || !containerRef.current) return;

      const scene = new OfficeScene((taskId) => onSelectRef.current(taskId), roomPage, roomsPerPage);
      sceneRef.current = scene;
      gameRef.current = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current,
        transparent: true,
        scale: {
          mode: Phaser.Scale.RESIZE,
          width: "100%",
          height: "100%"
        },
        pixelArt: true,
        scene: [scene]
      });
      scene.setRoomPage(roomPage, roomsPerPage);
      scene.setTasks(tasksRef.current);
    }

    boot();

    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    sceneRef.current?.setRoomPage(roomPage, roomsPerPage);
  }, [roomPage, roomsPerPage]);

  return <div ref={containerRef} className="h-full w-full" />;
}

type OfficeSceneApi = {
  setTasks: (tasks: Task[]) => void;
  setRoomPage: (roomPage: number, roomsPerPage: number) => void;
};
