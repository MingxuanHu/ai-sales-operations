import { Group, Pagination, Text } from '@mantine/core'
import { useState } from 'react'

const pageSize = 10

export function useListPagination<T>(records: readonly T[] | undefined) {
  const [page, setPage] = useState(1)
  const recordCount = records?.length ?? 0
  const pageCount = Math.max(1, Math.ceil(recordCount / pageSize))
  const currentPage = Math.min(page, pageCount)

  // A loaded list can shrink after a delete or refresh. Save the last valid page
  // so later additions don't jump the user back to the page that disappeared.
  if (records && page !== currentPage) setPage(currentPage)

  const start = (currentPage - 1) * pageSize
  return {
    rows: records?.slice(start, start + pageSize) ?? [],
    controls: { currentPage, pageCount, recordCount, start, setPage },
  }
}

export function ListPagination({ currentPage, pageCount, recordCount, start, setPage, label }: {
  currentPage: number
  pageCount: number
  recordCount: number
  start: number
  setPage: (page: number) => void
  label: string
}) {
  // An empty list still has a page indicator, but its range starts at zero.
  const firstRecord = recordCount === 0 ? 0 : start + 1

  return (
    <Group component="nav" aria-label={label} justify="space-between">
      <Text size="sm" c="dimmed" role="status">
        Showing {firstRecord}–{Math.min(start + pageSize, recordCount)} of {recordCount}
      </Text>
      {/* Mantine calls setPage with the chosen page, which makes React render its rows. */}
      <Pagination size="sm" siblings={0} total={pageCount} value={currentPage} onChange={setPage}
        getItemProps={(page) => ({ 'aria-label': 'Page ' + page })}
        getControlProps={(control) => ({ 'aria-label': control === 'previous' ? 'Previous page' : 'Next page' })} />
    </Group>
  )
}
