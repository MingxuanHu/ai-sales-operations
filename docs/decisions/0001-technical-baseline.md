# ADR 0001 — Technical baseline

**Status:** Proposed; verify in M1.

Use a pnpm TypeScript monorepo: **Node.js 26 LTS, React 19, Vite 8, NestJS 12, TypeScript 6, PostgreSQL 18, and a compatible stable Prisma version**. Use Docker Compose locally and GitHub Actions for checks.

**Why:** A mainstream full-stack stack with relevant skills for the target roles; NestJS offers familiar modular backend patterns.

**Deferred:** Exact package patch versions, UI component library and AI orchestration library. Verify the actual dependency combination before pinning and committing `pnpm-lock.yaml`.
