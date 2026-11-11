# ADR 0001 — Technical baseline

**Status:** Proposed; verify in M1.

Use a pnpm TypeScript monorepo: **Node.js 26 LTS, React 19, Vite 8, NestJS 12, TypeScript 6, PostgreSQL 18, and a compatible stable Prisma version**. Use Docker Compose locally and GitHub Actions for checks.

**Why:** A mainstream full-stack stack with relevant skills for the target roles; NestJS offers familiar modular backend patterns.

**Deferred:** Exact package patch versions, UI component library and AI orchestration library. Verify the actual dependency combination before pinning and committing `pnpm-lock.yaml`.

## Workspace versions for M1 Issue #4

The health shell pins Node.js 26.13.0 and pnpm 11.25.0. The workspace and app manifests pin React and React DOM 19.2.9, Vite 8.1.7, NestJS 12.4.2 and TypeScript 6.0.3. The lockfile records the resolved dependency graph.

Vite handles the web build and proxies the development API requests. The API uses the TypeScript compiler for NestJS decorator metadata and Node's built-in test runner for its controller unit test. Vitest runs the web unit tests. ESLint and typescript-eslint check the workspace sources. These tools run locally without cloud services.

## PostgreSQL access for M1 Issue #5

The API pins Prisma CLI, Prisma Client and the Prisma PostgreSQL adapter to 7.10.1. This stable release supports the pinned Node version and [PostgreSQL 18](https://www.prisma.io/docs/orm/v7/reference/supported-databases). The build generates a CommonJS-compatible client from a schema with no models. The readiness endpoint uses that client to check PostgreSQL connectivity without creating tables.
