"use client";

import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { priorityLabels, priorityRank, statusLabels, taskAgeDays, taskRoomLabel, type Task, type TaskEvent } from "@jiratown/shared";
import { PhaserOffice } from "./PhaserOffice";
import { useTaskStore } from "../taskStore";

const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";
const roomsPerPage = 6;

export function GameShell() {
  const { tasks, selectedTaskId, tableOpen, setTasks, upsertTask, selectTask, setTableOpen } = useTaskStore();
  const [connected, setConnected] = useState(false);
  const [taskActionError, setTaskActionError] = useState<string | undefined>();
  const [roomPage, setRoomPage] = useState(0);

  useEffect(() => {
    fetch(`${serverUrl}/tasks`)
      .then((response) => response.json() as Promise<{ tasks: Task[] }>)
      .then((payload) => setTasks(payload.tasks))
      .catch(() => setTasks([]));

    // Trigger a full source sync on mount so the office is always up-to-date on refresh
    fetch(`${serverUrl}/sync`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => undefined);

    const socket = io(serverUrl, {
      transports: ["websocket", "polling"]
    });

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("task:event", (event: TaskEvent) => {
      if (event.type === "tasks.snapshot") setTasks(event.tasks);
      if (event.type === "task.created" || event.type === "task.updated") upsertTask(event.task);
    });

    return () => {
      socket.disconnect();
    };
  }, [setTasks, upsertTask]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Tab") {
        event.preventDefault();
        setTableOpen(true);
      }
      if (event.key === "Escape") {
        setTableOpen(false);
        selectTask(undefined);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectTask, setTableOpen]);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId),
    [selectedTaskId, tasks]
  );
  const roomCount = useMemo(() => new Set(tasks.map((task) => taskRoomLabel(task))).size || 1, [tasks]);
  const totalRoomPages = Math.max(1, Math.ceil(roomCount / roomsPerPage));

  useEffect(() => {
    if (roomPage >= totalRoomPages) {
      setRoomPage(totalRoomPages - 1);
    }
  }, [roomPage, totalRoomPages]);

  async function closeTask(task: Task) {
    setTaskActionError(undefined);
    try {
      const response = await fetch(`${serverUrl}/tasks/${encodeURIComponent(task.id)}/done`, {
        method: "POST"
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `Request failed with ${response.status}`);
      }
      const payload = (await response.json()) as { task: Task };
      upsertTask(payload.task);
      selectTask(undefined);
      // Resync all sources so the office reflects the latest state from Jira/Obsidian/Reminders
      fetch(`${serverUrl}/sync`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => undefined);
    } catch (error) {
      setTaskActionError(error instanceof Error ? error.message : "Could not close task.");
    }
  }

  return (
    <main className="relative h-screen w-screen bg-slate-950">
      <PhaserOffice tasks={tasks} roomPage={roomPage} roomsPerPage={roomsPerPage} onSelectTask={selectTask} />
      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-3 rounded-md border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 shadow-lg">
        <span className={connected ? "h-2.5 w-2.5 rounded-full bg-emerald-400" : "h-2.5 w-2.5 rounded-full bg-amber-400"} />
        <span>{connected ? "Live office" : "Offline seed view"}</span>
        <span className="text-slate-400">{tasks.length} NPCs</span>
      </div>
      <button
        type="button"
        className="absolute right-4 top-4 rounded-md border border-slate-600 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-900 shadow-lg transition hover:bg-white"
        onClick={() => setTableOpen(true)}
      >
        Task Table
      </button>
      {totalRoomPages > 1 ? (
        <div className="absolute bottom-4 right-4 flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950/80 px-2 py-2 text-sm text-slate-100 shadow-lg">
          <button
            aria-label="Previous room page"
            className="h-8 w-8 rounded border border-slate-600 bg-slate-100 font-bold text-slate-900 disabled:opacity-45"
            type="button"
            disabled={roomPage === 0}
            onClick={() => setRoomPage((page) => Math.max(0, page - 1))}
          >
            ‹
          </button>
          <span className="min-w-16 text-center">
            {roomPage + 1}/{totalRoomPages}
          </span>
          <button
            aria-label="Next room page"
            className="h-8 w-8 rounded border border-slate-600 bg-slate-100 font-bold text-slate-900 disabled:opacity-45"
            type="button"
            disabled={roomPage >= totalRoomPages - 1}
            onClick={() => setRoomPage((page) => Math.min(totalRoomPages - 1, page + 1))}
          >
            ›
          </button>
        </div>
      ) : null}
      {selectedTask ? (
        <TaskDialog
          task={selectedTask}
          error={taskActionError}
          onClose={() => {
            setTaskActionError(undefined);
            selectTask(undefined);
          }}
          onCloseTask={() => closeTask(selectedTask)}
          onOpenSource={() => {
            if (selectedTask.sourceUrl) {
              window.open(selectedTask.sourceUrl, "_blank", "noopener,noreferrer");
            }
          }}
        />
      ) : null}
      {tableOpen ? (
        <TaskTable
          tasks={tasks}
          onClose={() => setTableOpen(false)}
          onSelect={(taskId) => {
            setTableOpen(false);
            selectTask(taskId);
          }}
        />
      ) : null}
    </main>
  );
}

function TaskDialog({ task, error, onClose, onCloseTask, onOpenSource }: { task: Task; error: string | undefined; onClose: () => void; onCloseTask: () => void; onOpenSource: () => void }) {
  const canCloseTask = task.status === "in_progress";

  return (
    <section className="absolute bottom-5 left-1/2 z-30 flex w-[min(680px,calc(100vw-32px))] max-h-[80vh] -translate-x-1/2 flex-col rounded-md border-4 border-slate-900 bg-amber-50 font-mono text-slate-950 shadow-2xl">
      <div className="flex shrink-0 items-start justify-between gap-4 p-4 pb-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">[{priorityLabels[task.priority]}]</div>
          <h1 className="text-xl font-black leading-tight">{task.title}</h1>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {canCloseTask ? (
            <button
              aria-label="Mark task done"
              title="Mark task done"
              className="h-8 w-8 rounded border border-emerald-900 bg-emerald-700 text-sm font-bold text-white hover:bg-emerald-800"
              type="button"
              onClick={onCloseTask}
            >
              ✔
            </button>
          ) : null}
          {task.sourceUrl ? (
            <button
              aria-label="Open in source app"
              title="Open in source app"
              className="h-8 w-8 rounded border border-sky-900 bg-sky-600 text-sm font-bold text-white hover:bg-sky-700"
              type="button"
              onClick={onOpenSource}
            >
              🌐
            </button>
          ) : null}
          <button className="rounded border border-slate-900 px-2 py-1 text-sm font-bold hover:bg-amber-100" type="button" onClick={onClose}>
            Dismiss
          </button>
        </div>
      </div>
      <div className="overflow-y-auto px-4 pb-4">
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <Detail label="Status" value={statusLabels[task.status]} />
          <Detail label="Source" value={task.source} />
          <Detail label="Room" value={taskRoomLabel(task)} />
          <Detail label="Assignee" value={task.assignee ?? "Unassigned"} />
          <Detail label="Sprint" value={task.sprint ?? "None"} />
        </div>
        {task.description ? <p className="mt-4 leading-relaxed">{task.description}</p> : null}
        {error ? <p className="mt-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm font-bold text-red-800">{error}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {task.labels.map((label) => (
            <span key={label} className="rounded bg-slate-900 px-2 py-1 text-xs font-bold text-amber-50">
              {label}
            </span>
          ))}
        </div>
        {task.comments.length > 0 ? (
          <div className="mt-4 border-t border-slate-300 pt-3 text-sm">
            {task.comments.map((comment) => (
              <p key={comment.id}>
                <strong>{comment.author}:</strong> {comment.body}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="font-bold text-slate-500">{label}: </span>
      <span>{value}</span>
    </div>
  );
}

function TaskTable({ tasks, onClose, onSelect }: { tasks: Task[]; onClose: () => void; onSelect: (id: string) => void }) {
  const [groupBy, setGroupBy] = useState<"room" | "priority" | "sprint" | "assignee" | "source">("room");
  const sorted = [...tasks].sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority] || a.title.localeCompare(b.title));

  return (
    <div className="absolute inset-0 z-20 bg-slate-950/70 p-4 backdrop-blur-sm">
      <section className="mx-auto mt-10 max-h-[82vh] max-w-6xl overflow-hidden rounded-md border border-slate-700 bg-slate-100 shadow-2xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-300 px-4 py-3">
          <h2 className="text-lg font-black text-slate-950">Priority Table</h2>
          <div className="flex items-center gap-2">
            <select className="rounded border border-slate-400 bg-white px-2 py-1 text-sm" value={groupBy} onChange={(event) => setGroupBy(event.target.value as typeof groupBy)}>
              <option value="room">Room</option>
              <option value="priority">Priority</option>
              <option value="sprint">Sprint</option>
              <option value="assignee">Assignee</option>
              <option value="source">Source</option>
            </select>
            <button type="button" className="rounded border border-slate-900 px-3 py-1 text-sm font-bold" onClick={onClose}>
              Close
            </button>
          </div>
        </header>
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-slate-200 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-4 py-2">Group</th>
                <th className="px-4 py-2">Task Title</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Age</th>
                <th className="px-4 py-2">Priority</th>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Assignee</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((task) => (
                <tr key={task.id} className="cursor-pointer border-t border-slate-300 hover:bg-white" onClick={() => onSelect(task.id)}>
                  <td className="px-4 py-2 font-bold">{groupValue(task, groupBy)}</td>
                  <td className="px-4 py-2">{task.title}</td>
                  <td className="px-4 py-2">{statusLabels[task.status]}</td>
                  <td className="px-4 py-2">{taskAgeDays(task)}d</td>
                  <td className="px-4 py-2">{priorityLabels[task.priority]}</td>
                  <td className="px-4 py-2">{task.source}</td>
                  <td className="px-4 py-2">{task.assignee ?? "Unassigned"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function groupValue(task: Task, groupBy: "room" | "priority" | "sprint" | "assignee" | "source"): string {
  if (groupBy === "room") return taskRoomLabel(task);
  if (groupBy === "priority") return priorityLabels[task.priority];
  if (groupBy === "sprint") return task.sprint ?? "No Sprint";
  if (groupBy === "assignee") return task.assignee ?? "Unassigned";
  return task.source;
}
