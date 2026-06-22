"use client";

import {
  AnimationEvent,
  CSSProperties,
  Dispatch,
  FormEvent,
  MouseEvent,
  SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  createTask,
  deleteTask,
  fetchTasks,
  TaskDraft,
  updateTask,
} from "@/lib/task-api";
import type { Task, TaskFilter, TaskStats } from "@/lib/tasks";

const emptyDraft: TaskDraft = {
  title: "",
  description: "",
};

const emptyStats: TaskStats = {
  total: 0,
  active: 0,
  inactive: 0,
};

type ModalOrigin = {
  x: number;
  y: number;
};

type Confirmation =
  | { type: "create"; origin: ModalOrigin; title: string }
  | { type: "toggle"; origin: ModalOrigin; task: Task; nextCompleted: boolean }
  | { type: "delete"; origin: ModalOrigin; task: Task }
  | { type: "save-edit"; origin: ModalOrigin; task: Task };

export default function TaskManager() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<TaskStats>(emptyStats);
  const [resultCount, setResultCount] = useState(0);
  const [draft, setDraft] = useState<TaskDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<TaskDraft>(emptyDraft);
  const [isModalClosing, setIsModalClosing] = useState(false);
  const [modalOrigin, setModalOrigin] = useState<ModalOrigin>({ x: 0, y: 0 });
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [isConfirmationClosing, setIsConfirmationClosing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [error, setError] = useState("");
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, startSaving] = useTransition();
  const editingIdRef = useRef(editingId);
  const isModalClosingRef = useRef(isModalClosing);
  const confirmationRef = useRef(confirmation);
  const isConfirmationClosingRef = useRef(isConfirmationClosing);

  editingIdRef.current = editingId;
  isModalClosingRef.current = isModalClosing;
  confirmationRef.current = confirmation;
  isConfirmationClosingRef.current = isConfirmationClosing;

  const editingTask = useMemo(
    () => tasks.find((task) => task.id === editingId) ?? null,
    [editingId, tasks],
  );

  const completionRate = useMemo(() => {
    if (stats.total === 0) return 0;
    return Math.round((stats.inactive / stats.total) * 100);
  }, [stats]);

  const visibleActiveCount = useMemo(
    () => tasks.filter((task) => !task.completed).length,
    [tasks],
  );

  useEffect(() => {
    const controller = new AbortController();

    fetchTasks({ search, filter, signal: controller.signal })
      .then((result) => {
        setTasks(result.tasks);
        setStats(result.stats);
        setResultCount(result.resultCount);
        setError("");
      })
      .catch((loadError) => {
        if ((loadError as Error).name !== "AbortError") {
          setError((loadError as Error).message);
        }
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [filter, search]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      if (confirmationRef.current && !isConfirmationClosingRef.current) {
        setIsConfirmationClosing(true);
        return;
      }

      if (editingIdRef.current && !isModalClosingRef.current) {
        setIsModalClosing(true);
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  async function refreshBoard() {
    const result = await fetchTasks({ search, filter });
    setTasks(result.tasks);
    setStats(result.stats);
    setResultCount(result.resultCount);
  }

  function runTaskAction(action: () => Promise<void>) {
    startSaving(async () => {
      setError("");

      try {
        await action();
      } catch (actionError) {
        setError((actionError as Error).message);
        await refreshBoard();
      }
    });
  }

  function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLElement | null;

    openConfirmation({
      type: "create",
      origin: getModalOrigin(submitter),
      title: draft.title.trim(),
    });
  }

  function performCreateTask() {
    runTaskAction(async () => {
      await createTask(draft);
      setDraft(emptyDraft);
      closeConfirmation();
      await refreshBoard();
    });
  }

  function performUpdateTask(id: string) {
    runTaskAction(async () => {
      const { task } = await updateTask(id, editingDraft);

      setTasks((current) =>
        current.map((item) => (item.id === id ? task : item)),
      );
      closeConfirmation();
      closeEditing();
      await refreshBoard();
    });
  }

  function requestToggleTask(task: Task, origin: ModalOrigin) {
    openConfirmation({
      type: "toggle",
      origin,
      task,
      nextCompleted: !task.completed,
    });
  }

  function performToggleTask(task: Task, nextCompleted: boolean) {
    setBusyTaskId(task.id);
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id ? { ...item, completed: nextCompleted } : item,
      ),
    );

    runTaskAction(async () => {
      await updateTask(task.id, { completed: nextCompleted });
      setBusyTaskId(null);
      closeConfirmation();
      await refreshBoard();
    });
  }

  function requestDeleteTask(task: Task, origin: ModalOrigin) {
    openConfirmation({
      type: "delete",
      origin,
      task,
    });
  }

  function performDeleteTask(task: Task) {
    const previousTasks = tasks;

    setBusyTaskId(task.id);
    setTasks((current) => current.filter((item) => item.id !== task.id));

    runTaskAction(async () => {
      try {
        await deleteTask(task.id);
        setBusyTaskId(null);
        closeConfirmation();
        await refreshBoard();
      } catch (deleteError) {
        setTasks(previousTasks);
        throw deleteError;
      }
    });
  }

  function requestSaveEdit(task: Task, origin: ModalOrigin) {
    openConfirmation({
      type: "save-edit",
      origin,
      task,
    });
  }

  function startEditing(task: Task, origin: ModalOrigin) {
    setIsModalClosing(false);
    setModalOrigin(origin);
    setEditingId(task.id);
    setEditingDraft({
      title: task.title,
      description: task.description,
    });
  }

  function closeEditing() {
    if (!editingId || isModalClosing) return;
    setIsModalClosing(true);
  }

  function finishClosingModal() {
    setEditingId(null);
    setEditingDraft(emptyDraft);
    setIsModalClosing(false);
  }

  function openConfirmation(nextConfirmation: Confirmation) {
    setIsConfirmationClosing(false);
    setConfirmation(nextConfirmation);
  }

  function closeConfirmation() {
    if (!confirmation || isConfirmationClosing) return;
    setIsConfirmationClosing(true);
  }

  function finishClosingConfirmation() {
    setConfirmation(null);
    setIsConfirmationClosing(false);
  }

  function handleConfirmAction() {
    if (!confirmation) return;

    if (confirmation.type === "create") {
      performCreateTask();
      return;
    }

    if (confirmation.type === "toggle") {
      performToggleTask(confirmation.task, confirmation.nextCompleted);
      return;
    }

    if (confirmation.type === "delete") {
      performDeleteTask(confirmation.task);
      return;
    }

    performUpdateTask(confirmation.task.id);
  }

  return (
    <main className="min-h-screen bg-[#070a12] text-[#e5edf5]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="grid gap-4 border-b border-[#1c2636] pb-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#38bdf8]">
              Mayan Assessment
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-normal text-white">
              Task Ops
            </h1>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Metric label="All" value={stats.total} />
            <Metric label="Active" value={stats.active} />
            <Metric label="Done" value={stats.inactive} />
            <Metric label="Rate" value={`${completionRate}%`} />
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <form
            className="rounded-lg border border-[#1c2636] bg-[#0d1320] p-5 shadow-xl shadow-black/20"
            onSubmit={handleCreateTask}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Command</h2>
              <span className="rounded bg-[#172033] px-2 py-1 text-xs font-semibold text-[#93c5fd]">
                New
              </span>
            </div>
            <label className="mt-5 block text-sm font-medium text-[#cbd5e1]">
              Title
              <input
                className="mt-2 h-11 w-full rounded-md border border-[#263448] bg-[#080c16] px-3 text-base text-white outline-none transition placeholder:text-[#64748b] focus:border-[#38bdf8] focus:ring-2 focus:ring-[#38bdf8]/20"
                maxLength={120}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="Ship task board"
                required
                value={draft.title}
              />
            </label>
            <label className="mt-4 block text-sm font-medium text-[#cbd5e1]">
              Description
              <textarea
                className="mt-2 min-h-32 w-full resize-y rounded-md border border-[#263448] bg-[#080c16] px-3 py-2 text-base text-white outline-none transition placeholder:text-[#64748b] focus:border-[#38bdf8] focus:ring-2 focus:ring-[#38bdf8]/20"
                maxLength={500}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Add the important context"
                value={draft.description}
              />
            </label>
            <button
              className="mt-4 h-11 w-full rounded-md bg-[#38bdf8] px-4 text-sm font-semibold text-[#06111f] transition hover:bg-[#7dd3fc] disabled:cursor-not-allowed disabled:bg-[#334155] disabled:text-[#94a3b8]"
              disabled={isSaving}
              type="submit"
            >
              Create Task
            </button>
            <div className="mt-5 rounded-md border border-[#1c2636] bg-[#090e19] p-3">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-[#94a3b8]">
                <span>Completion</span>
                <span>{completionRate}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded bg-[#1c2636]">
                <div
                  className="h-full rounded bg-[#22c55e] transition-all"
                  style={{ width: `${completionRate}%` }}
                />
              </div>
            </div>
          </form>

          <section className="flex min-w-0 flex-col gap-5">
          <header className="rounded-lg border border-[#1c2636] bg-[#0d1320] p-4 shadow-xl shadow-black/20">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
              <label className="block text-sm font-medium text-[#cbd5e1]">
                Search
                <input
                  className="mt-2 h-11 w-full rounded-md border border-[#263448] bg-[#080c16] px-3 text-base text-white outline-none transition placeholder:text-[#64748b] focus:border-[#38bdf8] focus:ring-2 focus:ring-[#38bdf8]/20"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by task name"
                  value={search}
                />
              </label>
              <div className="grid h-11 grid-cols-3 overflow-hidden rounded-md border border-[#263448] bg-[#080c16]">
                {(["all", "active", "inactive"] as TaskFilter[]).map((value) => (
                  <button
                    className={`min-w-24 px-3 text-sm font-semibold transition ${
                      filter === value
                        ? "bg-[#38bdf8] text-[#06111f]"
                        : "text-[#94a3b8] hover:bg-[#172033] hover:text-white"
                    }`}
                    key={value}
                    onClick={() => setFilter(value)}
                    type="button"
                  >
                    {filterLabel(value)}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Signal label="Showing" value={resultCount} />
              <Signal label="Open Here" value={visibleActiveCount} />
              <Signal label="Mode" value={filterLabel(filter)} />
            </div>
          </header>

          {error ? (
            <div className="rounded-md border border-[#7f1d1d] bg-[#2a1014] px-4 py-3 text-sm font-medium text-[#fecaca]">
              {error}
            </div>
          ) : null}

          <section className="min-h-[560px] overflow-hidden rounded-lg border border-[#1c2636] bg-[#0d1320] shadow-xl shadow-black/20">
            <div className="flex items-center justify-between border-b border-[#1c2636] px-4 py-3">
              <h2 className="text-base font-semibold text-white">Queue</h2>
              <span
                className={`rounded px-2 py-1 text-xs font-semibold ${
                  isLoading
                    ? "bg-white/10 text-white"
                    : "live-glow"
                }`}
              >
                {isLoading ? "Syncing" : "Live"}
              </span>
            </div>

            {isLoading ? (
              <LoadingRows />
            ) : tasks.length === 0 ? (
              <EmptyState search={search} filter={filter} />
            ) : (
              <ul className="grid gap-3 p-3">
                {tasks.map((task) => (
                  <TaskRow
                    busy={busyTaskId === task.id}
                    key={task.id}
                    onDelete={(origin) => requestDeleteTask(task, origin)}
                    onEdit={(origin) => startEditing(task, origin)}
                    onToggle={(origin) => requestToggleTask(task, origin)}
                    task={task}
                  />
                ))}
              </ul>
            )}
          </section>
        </section>
        </section>
      </div>
      {editingTask ? (
        <EditTaskModal
          draft={editingDraft}
          isClosing={isModalClosing}
          isSaving={isSaving}
          origin={modalOrigin}
          onClose={closeEditing}
          onExited={finishClosingModal}
          onRequestSave={(origin) => requestSaveEdit(editingTask, origin)}
          setDraft={setEditingDraft}
          task={editingTask}
        />
      ) : null}
      {confirmation ? (
        <ConfirmationModal
          confirmation={confirmation}
          isClosing={isConfirmationClosing}
          isSaving={isSaving}
          onCancel={closeConfirmation}
          onConfirm={handleConfirmAction}
          onExited={finishClosingConfirmation}
        />
      ) : null}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-[#1c2636] bg-[#0d1320] px-4 py-3 shadow-sm">
      <div className="text-xl font-semibold text-white">{value}</div>
      <div className="text-xs font-medium text-[#94a3b8]">{label}</div>
    </div>
  );
}

function Signal({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-[#1c2636] bg-[#090e19] px-3 py-2">
      <div className="text-xs font-medium text-[#94a3b8]">{label}</div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function TaskRow({
  busy,
  onDelete,
  onEdit,
  onToggle,
  task,
}: {
  busy: boolean;
  onDelete: (origin: ModalOrigin) => void;
  onEdit: (origin: ModalOrigin) => void;
  onToggle: (origin: ModalOrigin) => void;
  task: Task;
}) {
  function handleEditClick(event: MouseEvent<HTMLButtonElement>) {
    onEdit(getModalOrigin(event.currentTarget));
  }

  function handleToggleClick(event: MouseEvent<HTMLButtonElement>) {
    onToggle(getModalOrigin(event.currentTarget));
  }

  function handleDeleteClick(event: MouseEvent<HTMLButtonElement>) {
    onDelete(getModalOrigin(event.currentTarget));
  }

  return (
    <li
      className={`grid gap-3 rounded-md border p-4 transition ${
        task.completed
          ? "border-[#1f3b4d] bg-[#0a101b]"
          : "border-[#263448] bg-[#111827]"
      } ${busy ? "opacity-70" : ""}`}
    >
      <div className="grid gap-3 md:grid-cols-[auto_1fr_auto] md:items-start">
        <button
          aria-label={`Mark ${task.title} as ${
            task.completed ? "active" : "inactive"
          }`}
          className={`mt-1 grid h-8 w-8 place-items-center rounded-md border text-sm font-bold transition ${
            task.completed
              ? "border-[#22c55e] bg-[#22c55e] text-[#04130a]"
              : "border-[#334155] bg-[#080c16] text-transparent hover:border-[#38bdf8]"
          }`}
          disabled={busy}
          onClick={handleToggleClick}
          type="button"
        >
          OK
        </button>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className={`break-words text-base font-semibold ${
                task.completed ? "text-[#64748b] line-through" : "text-white"
              }`}
            >
              {task.title}
            </h3>
            <span
              className={`rounded px-2 py-1 text-xs font-semibold ${
                task.completed
                  ? "bg-[#123524] text-[#86efac]"
                  : "bg-[#fde68a] text-[#451a03]"
              }`}
            >
              {task.completed ? "Inactive" : "Active"}
            </span>
          </div>
          {task.description ? (
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#94a3b8]">
              {task.description}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <button
            aria-label={`Edit ${task.title}`}
            className="grid h-9 w-9 place-items-center rounded-md border border-[#334155] text-[#cbd5e1] transition hover:bg-[#172033] hover:text-white"
            onClick={handleEditClick}
            title="Edit"
            type="button"
          >
            <PencilIcon />
          </button>
          <button
            aria-label={`Delete ${task.title}`}
            className="grid h-9 w-9 place-items-center rounded-md border border-[#7f1d1d] text-[#fecaca] transition hover:bg-[#2a1014] hover:text-white"
            disabled={busy}
            onClick={handleDeleteClick}
            title="Delete"
            type="button"
          >
            <TrashIcon />
          </button>
        </div>
      </div>
    </li>
  );
}

function EditTaskModal({
  draft,
  isClosing,
  isSaving,
  origin,
  onClose,
  onExited,
  onRequestSave,
  setDraft,
  task,
}: {
  draft: TaskDraft;
  isClosing: boolean;
  isSaving: boolean;
  origin: ModalOrigin;
  onClose: () => void;
  onExited: () => void;
  onRequestSave: (origin: ModalOrigin) => void;
  setDraft: Dispatch<SetStateAction<TaskDraft>>;
  task: Task;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLElement | null;

    onRequestSave(getModalOrigin(submitter));
  }

  function handleBackdropAnimationEnd(event: AnimationEvent<HTMLDivElement>) {
    if (event.currentTarget === event.target && isClosing) {
      onExited();
    }
  }

  const modalStyle = {
    "--modal-origin-x": `${origin.x}px`,
    "--modal-origin-y": `${origin.y}px`,
  } as CSSProperties;

  return (
    <div
      aria-labelledby="edit-task-title"
      aria-modal="true"
      className={`fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6 ${
        isClosing ? "modal-backdrop-out" : "modal-backdrop"
      }`}
      onAnimationEnd={handleBackdropAnimationEnd}
      onMouseDown={onClose}
      role="dialog"
    >
      <form
        className={`w-full max-w-lg rounded-lg border border-[#263448] bg-[#0d1320] p-5 shadow-2xl shadow-black/50 ${
          isClosing ? "modal-panel-out" : "modal-panel"
        }`}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        style={modalStyle}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#38bdf8]">
              Edit Task
            </p>
            <h2
              className="mt-2 break-words text-xl font-semibold text-white"
              id="edit-task-title"
            >
              {task.title}
            </h2>
          </div>
          <button
            aria-label="Close edit modal"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-[#334155] text-[#cbd5e1] transition hover:bg-[#172033] hover:text-white"
            onClick={onClose}
            title="Close"
            type="button"
          >
            X
          </button>
        </div>

        <label className="mt-5 block text-sm font-medium text-[#cbd5e1]">
          Title
          <input
            autoFocus
            className="mt-2 h-11 w-full rounded-md border border-[#263448] bg-[#080c16] px-3 text-base font-semibold text-white outline-none transition placeholder:text-[#64748b] focus:border-[#38bdf8] focus:ring-2 focus:ring-[#38bdf8]/20"
            maxLength={120}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                title: event.target.value,
              }))
            }
            required
            value={draft.title}
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-[#cbd5e1]">
          Description
          <textarea
            className="mt-2 min-h-36 w-full resize-y rounded-md border border-[#263448] bg-[#080c16] px-3 py-2 text-base text-white outline-none transition placeholder:text-[#64748b] focus:border-[#38bdf8] focus:ring-2 focus:ring-[#38bdf8]/20"
            maxLength={500}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
            value={draft.description}
          />
        </label>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            className="h-10 rounded-md border border-[#334155] px-4 text-sm font-semibold text-[#cbd5e1] transition hover:bg-[#172033] hover:text-white"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-10 rounded-md bg-[#38bdf8] px-4 text-sm font-semibold text-[#06111f] transition hover:bg-[#7dd3fc] disabled:bg-[#334155] disabled:text-[#94a3b8]"
            disabled={isSaving}
            type="submit"
          >
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}

function ConfirmationModal({
  confirmation,
  isClosing,
  isSaving,
  onCancel,
  onConfirm,
  onExited,
}: {
  confirmation: Confirmation;
  isClosing: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onExited: () => void;
}) {
  const copy = getConfirmationCopy(confirmation);

  function handleBackdropAnimationEnd(event: AnimationEvent<HTMLDivElement>) {
    if (event.currentTarget === event.target && isClosing) {
      onExited();
    }
  }

  const modalStyle = {
    "--modal-origin-x": `${confirmation.origin.x}px`,
    "--modal-origin-y": `${confirmation.origin.y}px`,
  } as CSSProperties;

  return (
    <div
      aria-labelledby="confirm-action-title"
      aria-modal="true"
      className={`fixed inset-0 z-[60] grid place-items-center bg-black/70 px-4 py-6 ${
        isClosing ? "modal-backdrop-out" : "modal-backdrop"
      }`}
      onAnimationEnd={handleBackdropAnimationEnd}
      onMouseDown={onCancel}
      role="dialog"
    >
      <section
        className={`w-full max-w-md rounded-lg border border-[#263448] bg-[#0d1320] p-5 shadow-2xl shadow-black/50 ${
          isClosing ? "modal-panel-out" : "modal-panel"
        }`}
        onMouseDown={(event) => event.stopPropagation()}
        style={modalStyle}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#38bdf8]">
          Confirm Action
        </p>
        <h2
          className="mt-2 break-words text-xl font-semibold text-white"
          id="confirm-action-title"
        >
          {copy.title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-[#94a3b8]">{copy.message}</p>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            className="h-10 rounded-md border border-[#334155] px-4 text-sm font-semibold text-[#cbd5e1] transition hover:bg-[#172033] hover:text-white"
            disabled={isSaving}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className={`h-10 rounded-md px-4 text-sm font-semibold transition disabled:bg-[#334155] disabled:text-[#94a3b8] ${
              copy.danger
                ? "bg-[#dc2626] text-white hover:bg-[#b91c1c]"
                : "bg-[#38bdf8] text-[#06111f] hover:bg-[#7dd3fc]"
            }`}
            disabled={isSaving}
            onClick={onConfirm}
            type="button"
          >
            {copy.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function getConfirmationCopy(confirmation: Confirmation) {
  if (confirmation.type === "create") {
    return {
      title: "Create this task?",
      message: `This will add "${confirmation.title}" to your task queue.`,
      confirmLabel: "Create Task",
      danger: false,
    };
  }

  if (confirmation.type === "toggle") {
    return {
      title: confirmation.nextCompleted
        ? "Mark task inactive?"
        : "Mark task active?",
      message: `This will update the status of "${confirmation.task.title}".`,
      confirmLabel: confirmation.nextCompleted ? "Mark Inactive" : "Mark Active",
      danger: false,
    };
  }

  if (confirmation.type === "delete") {
    return {
      title: "Delete this task?",
      message: `"${confirmation.task.title}" will be permanently removed from the queue.`,
      confirmLabel: "Delete Task",
      danger: true,
    };
  }

  return {
    title: "Save these changes?",
    message: `This will update "${confirmation.task.title}" with the edited details.`,
    confirmLabel: "Save Changes",
    danger: false,
  };
}

function LoadingRows() {
  return (
    <div className="grid gap-3 p-3">
      {[0, 1, 2].map((item) => (
        <div
          className="h-24 animate-pulse rounded-md border border-[#1c2636] bg-[#111827]"
          key={item}
        />
      ))}
    </div>
  );
}

function getModalOrigin(element: HTMLElement | null): ModalOrigin {
  if (!element) {
    return { x: 0, y: 0 };
  }

  const rect = element.getBoundingClientRect();

  return {
    x: rect.left + rect.width / 2 - window.innerWidth / 2,
    y: rect.top + rect.height / 2 - window.innerHeight / 2,
  };
}

function PencilIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

function EmptyState({
  filter,
  search,
}: {
  filter: TaskFilter;
  search: string;
}) {
  const hasQuery = search.trim() || filter !== "all";

  return (
    <div className="grid min-h-[440px] place-items-center px-4 text-center text-[#e5edf5]">
      <div>
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-md bg-[#172033] text-lg font-bold text-[#38bdf8]">
          +
        </div>
        <h3 className="mt-4 text-lg font-semibold">
          {hasQuery ? "No tasks match" : "No tasks yet"}
        </h3>
        <p className="mt-2 max-w-sm text-sm leading-6 text-[#94a3b8]">
          {hasQuery
            ? "Adjust the search or status filter to widen the queue."
            : "Create the first task and it will appear in this queue."}
        </p>
      </div>
    </div>
  );
}

function filterLabel(filter: TaskFilter) {
  if (filter === "active") return "Active";
  if (filter === "inactive") return "Inactive";
  return "All";
}
