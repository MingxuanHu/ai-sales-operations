import { Group, Loader } from '@mantine/core'

// The status discriminates the union so TypeScript exposes data only for a completed load.
export type LoadResult<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'failed'; error: unknown }

export function Loading({ children }: { children: string }) {
  return <Group role="status" gap="sm"><Loader size="sm" />{children}</Group>
}
