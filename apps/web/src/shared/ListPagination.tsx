import { Group, Pagination, Text } from '@mantine/core'
import { useState } from 'react'

const pageSize = 10

export function useSearchableList<T>(records: readonly T[] | undefined, searchFields: (record: T) => string[]) {
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const term = query.trim().toLowerCase()
  // Filter all loaded records before slicing so search also finds rows on later pages.
  const matches = term ? records?.filter((record) =>
    searchFields(record).some((field) => field.toLowerCase().includes(term))) : records
  const recordCount = matches?.length ?? 0
  const pageCount = Math.max(1, Math.ceil(recordCount / pageSize))
  const currentPage = Math.min(page, pageCount)

  // A loaded list can shrink after a delete or refresh. Save the last valid page
  // so later additions don't jump the user back to the page that disappeared.
  if (records && page !== currentPage) setPage(currentPage)

  function search(value: string) {
    setQuery(value)
    setPage(1)
  }

  const start = (currentPage - 1) * pageSize
  return {
    query, search,
    rows: matches?.slice(start, start + pageSize) ?? [],
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
