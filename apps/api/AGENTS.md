# API agent instructions

Follow the root agent instructions. Keep the NestJS HTTP entrypoint thin so future entrypoints can reuse application modules. Keep `GET /api/health` backed by the shared PostgreSQL readiness check. Enforce authorisation in the API when protected routes are introduced.

Use short beginner comments to explain NestJS modules, decorators, route handling and dependency injection where they appear. Explain TypeScript types and Node.js startup or error handling where they help trace a request.

## Project structure

- Keep process startup and global HTTP setup in `src/main.ts`. Use `src/app.module.ts` to assemble feature modules.
- Organise capabilities under `src/modules/<feature>/`. Give each its own NestJS module and use descriptive names such as `orders.controller.ts` and `orders.service.ts`.
- Controllers handle HTTP routing and delegate business rules to services when those rules are needed. Keep request and response DTOs, data access, and other feature-specific code in the owning module. Introduce subfolders such as `dto/` when those files exist.
- Use module imports and explicitly exported providers for cross-feature dependencies. Keep reusable infrastructure independent of individual features, and mirror the source module layout under `test/`.
