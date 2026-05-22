import { create } from "zustand";
import type { Task } from "@jiratown/shared";

type TaskStore = {
  tasks: Task[];
  selectedTaskId: string | undefined;
  tableOpen: boolean;
  setTasks: (tasks: Task[]) => void;
  upsertTask: (task: Task) => void;
  selectTask: (taskId?: string) => void;
  setTableOpen: (open: boolean) => void;
};

export const useTaskStore = create<TaskStore>((set) => ({
  tasks: [],
  selectedTaskId: undefined,
  tableOpen: false,
  setTasks: (tasks) => set({ tasks }),
  upsertTask: (task) =>
    set((state) => ({
      tasks: state.tasks.some((existing) => existing.id === task.id)
        ? state.tasks.map((existing) => (existing.id === task.id ? task : existing))
        : [...state.tasks, task]
    })),
  selectTask: (taskId) => set({ selectedTaskId: taskId }),
  setTableOpen: (tableOpen) => set({ tableOpen })
}));
