import type { NextRequest } from "next/server";
import { taskErrorResponse } from "@/lib/task-responses";
import { createTask, getTaskStats, listTasks, parseTaskFilter } from "@/lib/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("search") ?? "";
  const filter = parseTaskFilter(request.nextUrl.searchParams.get("filter"));
  const [tasks, stats] = await Promise.all([
    listTasks({ search, filter }),
    getTaskStats(),
  ]);

  return Response.json({
    tasks,
    stats,
    resultCount: tasks.length,
  });
}

export async function POST(request: Request) {
  try {
    const task = await createTask(await request.json());
    return Response.json({ task }, { status: 201 });
  } catch (error) {
    return taskErrorResponse(error);
  }
}
