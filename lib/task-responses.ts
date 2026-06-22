import { TaskValidationError } from "@/lib/tasks";

export function taskErrorResponse(error: unknown) {
  if (error instanceof SyntaxError) {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (error instanceof TaskValidationError) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  return Response.json(
    { error: "Unable to process task request." },
    { status: 500 },
  );
}
