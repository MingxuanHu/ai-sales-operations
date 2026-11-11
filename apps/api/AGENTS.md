# API agent instructions

Follow the root agent instructions. Keep the NestJS HTTP entrypoint thin so future entrypoints can reuse application modules. Keep `GET /api/health` independent of external services. Enforce authorisation in the API when protected routes are introduced.
