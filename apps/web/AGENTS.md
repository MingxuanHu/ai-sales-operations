# Web agent instructions

Follow the root agent instructions. Use relative `/api/` URLs for backend requests so the same paths work through Vite and the deployed frontend. Keep secrets out of browser code and Vite client environment variables.

Use short beginner comments to explain JSX, React state and effects, browser requests, and Vite configuration where they appear. Connect each concept to what the user sees or what the browser does.

## Project structure

- Keep the static HTML document in `index.html`. It supplies the page metadata and the element where React mounts. Keep `src/main.tsx` focused on mounting the app, and put React-rendered markup in named `.tsx` component files.
- Use `src/app/` for app-wide composition, global styles, and routing or providers when introduced. Put capability-specific code under `src/features/<feature>/`.
- Within a feature, put UI in `components/` and HTTP requests in `api/`. Add folders such as `hooks/` when the feature needs them. Name components in PascalCase and keep unit tests next to the code they exercise.
- Keep code with its owning feature. Move it to `src/shared/` when multiple features genuinely reuse it. Shared code should have no dependency on individual features.
