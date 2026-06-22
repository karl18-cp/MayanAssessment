import { taskErrorResponse } from "@/lib/task-responses";
import { deleteTask, getTask, updateTask } from "@/lib/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TaskRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: TaskRouteContext) {
  const { id } = await params;
  const task = await getTask(id);

  if (!task) {
    return Response.json({ error: "Task not found." }, { status: 404 });
  }

  return Response.json({ task });
}

export async function PATCH(request: Request, { params }: TaskRouteContext) {
  try {
    const { id } = await params;
    const task = await updateTask(id, await request.json());

    if (!task) {
      return Response.json({ error: "Task not found." }, { status: 404 });
    }

    return Response.json({ task });
  } catch (error) {
    return taskErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: TaskRouteContext) {
  const { id } = await params;
  const deleted = await deleteTask(id);

  if (!deleted) {
    return Response.json({ error: "Task not found." }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
