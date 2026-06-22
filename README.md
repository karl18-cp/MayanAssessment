# Fullstack Task Management Assessment

A modern fullstack task management application built with Next.js for the frontend and Node.js route handlers for the backend. Tasks are persisted in a local JSON file at `data/tasks.json`.

## Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Features

- Add tasks with title and description.
- Mark tasks active or inactive.
- Edit task title and description.
- Delete tasks.
- Search tasks by title.
- Filter tasks by all, active, or inactive.
- Combine search and status filters.
- View collection stats and completion progress while filtering.
- Use optimistic interactions for status changes and deletes.
- Persist tasks in a local JSON data store.
- Validate input and return structured API errors.

## API

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/tasks?search=&filter=all` | List tasks with optional search/filter plus stats. |
| `POST` | `/api/tasks` | Create a task. |
| `GET` | `/api/tasks/:id` | Get one task. |
| `PATCH` | `/api/tasks/:id` | Update title, description, or status. |
| `DELETE` | `/api/tasks/:id` | Delete a task. |

## Scripts

```bash
npm run dev
npm run lint
npm run build
```

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS
- Node.js filesystem-backed persistence

## Implementation Notes

- `lib/tasks.ts` owns persistence, validation, filtering, and aggregate stats.
- `lib/task-api.ts` centralizes browser API calls so the UI component stays focused on state and rendering.
- `app/components/task-manager.tsx` uses derived state, transitions, and optimistic updates for a more responsive interface.

Inactive means the task has been completed. Active means it is still open.
