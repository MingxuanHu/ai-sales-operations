# API agent instructions

Follow the root agent instructions. Keep the NestJS HTTP entrypoint thin so future entrypoints can reuse application modules. Keep `GET /api/health` independent of external services. Enforce authorisation in the API when protected routes are introduced.

Use short beginner comments to explain NestJS modules, decorators, route handling and dependency injection where they appear. Explain TypeScript types and Node.js startup or error handling where they help trace a request.
