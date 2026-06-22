import type { Task, TaskFilter, TaskStats } from "@/lib/tasks";

export type TaskDraft = {
  title: string;
  description: string;
};

export type TaskListResult = {
  tasks: Task[];
  stats: TaskStats;
  resultCount: number;
};

export async function fetchTasks({
  search,
  filter,
  signal,
}: {
  search: string;
  filter: TaskFilter;
  signal?: AbortSignal;
}): Promise<TaskListResult> {
  const params = new URLSearchParams();
  const trimmedSearch = search.trim();

  if (trimmedSearch) params.set("search", trimmedSearch);
  if (filter !== "all") params.set("filter", filter);

  return requestJson<TaskListResult>(`/api/tasks?${params.toString()}`, {
    signal,
  });
}

export async function createTask(draft: TaskDraft) {
  return requestJson<{ task: Task }>("/api/tasks", {
    method: "POST",
    body: JSON.stringify(draft),
  });
}

export async function updateTask(
  id: string,
  changes: Partial<TaskDraft> & { completed?: boolean },
) {
  return requestJson<{ task: Task }>(`/api/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
}

export async function deleteTask(id: string) {
  const response = await fetch(`/api/tasks/${id}`, { method: "DELETE" });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error ?? "Unable to delete task.");
  }
}

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Request failed.");
  }

  return data as T;
}
