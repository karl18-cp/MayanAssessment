import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type Task = {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TaskInput = {
  title?: unknown;
  description?: unknown;
  completed?: unknown;
};

export type TaskFilter = "all" | "active" | "inactive";

export type TaskStats = {
  total: number;
  active: number;
  inactive: number;
};

const dataDir = path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "tasks.json");

let writeQueue = Promise.resolve();

async function readTasksFile(): Promise<Task[]> {
  try {
    const content = await readFile(dataFile, "utf8");
    const parsed = JSON.parse(content);

    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeTasksFile(tasks: Task[]) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dataFile, `${JSON.stringify(tasks, null, 2)}\n`, "utf8");
}

async function withTaskWrite<T>(operation: () => Promise<T>) {
  const run = writeQueue.then(operation, operation);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function listTasks({
  search = "",
  filter = "all",
}: {
  search?: string;
  filter?: TaskFilter;
} = {}) {
  const normalizedSearch = search.trim().toLowerCase();
  const tasks = await readTasksFile();

  return tasks
    .filter((task) => {
      if (filter === "active" && task.completed) return false;
      if (filter === "inactive" && !task.completed) return false;

      if (!normalizedSearch) return true;

      return task.title.toLowerCase().includes(normalizedSearch);
    })
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
}

export async function getTaskStats(): Promise<TaskStats> {
  const tasks = await readTasksFile();
  const inactive = tasks.filter((task) => task.completed).length;

  return {
    total: tasks.length,
    active: tasks.length - inactive,
    inactive,
  };
}

export async function getTask(id: string) {
  const tasks = await readTasksFile();
  return tasks.find((task) => task.id === id) ?? null;
}

export async function createTask(input: TaskInput) {
  const title = parseTitle(input.title);
  const description = parseDescription(input.description);
  const now = new Date().toISOString();

  const task: Task = {
    id: crypto.randomUUID(),
    title,
    description,
    completed: false,
    createdAt: now,
    updatedAt: now,
  };

  await withTaskWrite(async () => {
    const tasks = await readTasksFile();
    tasks.push(task);
    await writeTasksFile(tasks);
  });

  return task;
}

export async function updateTask(id: string, input: TaskInput) {
  return withTaskWrite(async () => {
    const tasks = await readTasksFile();
    const taskIndex = tasks.findIndex((task) => task.id === id);

    if (taskIndex === -1) {
      return null;
    }

    const existingTask = tasks[taskIndex];
    const updatedTask: Task = {
      ...existingTask,
      title:
        input.title === undefined ? existingTask.title : parseTitle(input.title),
      description:
        input.description === undefined
          ? existingTask.description
          : parseDescription(input.description),
      completed:
        input.completed === undefined
          ? existingTask.completed
          : parseCompleted(input.completed),
      updatedAt: new Date().toISOString(),
    };

    tasks[taskIndex] = updatedTask;
    await writeTasksFile(tasks);

    return updatedTask;
  });
}

export async function deleteTask(id: string) {
  return withTaskWrite(async () => {
    const tasks = await readTasksFile();
    const nextTasks = tasks.filter((task) => task.id !== id);

    if (nextTasks.length === tasks.length) {
      return false;
    }

    await writeTasksFile(nextTasks);
    return true;
  });
}

export function parseTaskFilter(value: string | null): TaskFilter {
  if (value === "active" || value === "inactive") {
    return value;
  }

  return "all";
}

function parseTitle(value: unknown) {
  if (typeof value !== "string") {
    throw new TaskValidationError("Task title is required.");
  }

  const title = value.trim();

  if (!title) {
    throw new TaskValidationError("Task title is required.");
  }

  if (title.length > 120) {
    throw new TaskValidationError("Task title must be 120 characters or less.");
  }

  return title;
}

function parseDescription(value: unknown) {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value !== "string") {
    throw new TaskValidationError("Task description must be text.");
  }

  const description = value.trim();

  if (description.length > 500) {
    throw new TaskValidationError(
      "Task description must be 500 characters or less.",
    );
  }

  return description;
}

function parseCompleted(value: unknown) {
  if (typeof value !== "boolean") {
    throw new TaskValidationError("Task status must be true or false.");
  }

  return value;
}

export class TaskValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskValidationError";
  }
}
