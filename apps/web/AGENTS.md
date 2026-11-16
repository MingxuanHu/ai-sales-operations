# Web agent instructions

Follow the root agent instructions. Use relative `/api/` URLs for backend requests so the same paths work through Vite and the deployed frontend. Keep secrets out of browser code and Vite client environment variables.

## Teaching comments

- When adding or changing React code, write short comments for a developer learning React. Introduce unfamiliar concepts where they appear, such as JSX, props, state, event handlers, effects and their cleanup, and keys in lists.
- Explain what the code does in that component and how it affects what the user sees or what the browser does. For example, explain why changing state updates the visible screen or why an effect cancels a request when the selected organisation changes.
- Explain browser requests and Vite or TypeScript configuration where the setting affects the app. Keep each comment focused on one idea and update it when the code changes.

## Project structure

- Keep the static HTML document in `index.html`. It supplies the page metadata and the element where React mounts. Keep `src/main.tsx` focused on mounting the app, and put React-rendered markup in named `.tsx` component files.
- Use `src/app/` for app-wide composition, global styles, and routing or providers when introduced. Put capability-specific code under `src/features/<feature>/`.
- Within a feature, put UI in `components/` and HTTP requests in `api/`. Add folders such as `hooks/` when the feature needs them. Name components in PascalCase and keep unit tests next to the code they exercise.
- Keep code with its owning feature. Move it to `src/shared/` when multiple features genuinely reuse it. Shared code should have no dependency on individual features.

## UI components

- Use Mantine components directly for common controls and layouts. Compose them into app or feature components when they represent a workflow or reusable UI behaviour.
- Put app-wide visual defaults in the Mantine theme. Keep styles specific to a feature with the component that uses them.
- Check the [Mantine v9 component documentation](https://mantine.dev/llms.txt) for props and examples. Mantine also publishes [agent skills](https://mantine.dev/guides/llms/#skills) for forms, custom comboboxes, and custom components.
