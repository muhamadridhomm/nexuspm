# NexusPM — Project, Resource & Document Workspace

A local-first project workspace for organizing issues, cycles, resources, and project documents. The portfolio copy seeds a small synthetic workspace in the browser so the main interaction can be explored without an employer account or employer data. Optional AI features accept user-supplied provider details; none are bundled.

## Stack

Next.js, React, TypeScript, Dexie/IndexedDB for local data, Prisma with SQLite for optional server sync, and a FastAPI helper for scheduling, triage, and document exports.

## Local setup

1. Install Node.js 20 or later.
2. In `frontend`, install dependencies. The install generates the Prisma client used by the optional sync routes. Copy `.env.example` to `.env.local` only if you want to configure those routes.
3. From `frontend`, run `npx prisma db push --schema prisma/schema.prisma` to prepare the optional local SQLite sync database.
4. Start the frontend with `npm run dev`.
5. To use the scheduling and document-export helper, create a Python environment in `backend`, install `backend/requirements.txt`, then run `uvicorn main:app --reload --host 127.0.0.1 --port 8000` from that directory.

The main workspace is stored in browser IndexedDB. The seeded sample records are fictional and can be cleared from the browser storage. The optional AI settings belong to the user and should not be committed.
