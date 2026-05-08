# Backend source location

Survive.fun runs the HTTP API from **`apps/api`** (Express, Prisma, Socket.IO, BullMQ).

- Application entry: `apps/api/src/index.ts`
- Prisma schema: `apps/api/prisma/schema.prisma`
- API documentation: **`backend.md`** at the repository root

This `backend/` directory is reserved for docs only so paths in specs (`backend/src/...`) resolve to **`apps/api/src/...`**.
