import { Paper, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core'
import { useState, type PointerEvent } from 'react'
import type { SalesReport } from '../api/salesReport'
import styles from './SalesReportSections.module.css'

export function SalesReportSections({ report }: { report: SalesReport }) {
  return (
    <Stack gap="lg">
      <Text size="sm">Reporting period {report.startDate} to {report.endDate}</Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Paper withBorder p="md">
          <Title order={3} size="h4">Fulfilled orders</Title>
          <Text size="xl">{report.fulfilledOrderCount}</Text>
        </Paper>
        <Paper withBorder p="md">
          <Title order={3} size="h4">Net sales</Title>
          <Text size="xl">{report.netSales}</Text>
        </Paper>
      </SimpleGrid>
      {report.fulfilledOrderCount === 0 && <Text role="status">No fulfilled orders in this date range.</Text>}
      <Paper withBorder p="md">
        <Stack gap="sm">
          <Title order={3} size="h3">Daily net sales</Title>
          <DailySalesChart daily={report.daily} />
          <div aria-hidden="true" className={styles.axis}>
            <span>{report.startDate}</span><span>{report.endDate}</span>
          </div>
          <details>
            <summary>View daily sales data</summary>
            <Table aria-label="Daily net sales" striped>
              <Table.Thead><Table.Tr><Table.Th scope="col">Date (UTC)</Table.Th><Table.Th scope="col">Net sales</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {report.daily.map(({ date, netSales }) => (
                  <Table.Tr key={date}><Table.Th scope="row">{date}</Table.Th><Table.Td>{netSales}</Table.Td></Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </details>
        </Stack>
      </Paper>
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <RankingTable title="Product ranking" nameColumn="Product" rows={report.products} showCases />
        <RankingTable title="Customer ranking" nameColumn="Customer" rows={report.customers} />
      </SimpleGrid>
    </Stack>
  )
}

function DailySalesChart({ daily }: { daily: SalesReport['daily'] }) {
  const peak = Math.max(1, ...daily.map(({ netSales }) => Number(netSales)))
  const [hover, setHover] = useState<{ index: number; x: number; y: number; left: boolean; above: boolean }>()
  const hoveredDay = hover && daily[hover.index]

  function followPointer(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    if (!bounds.width || !daily.length) return
    // Map the horizontal position to a day across the full chart, including zero-height bars.
    const x = event.clientX - bounds.left
    const y = event.clientY - bounds.top
    const index = Math.max(0, Math.min(daily.length - 1, Math.floor(x / bounds.width * daily.length)))
    setHover({ index, x, y, left: x > bounds.width / 2, above: y > bounds.height / 2 })
  }

  return (
    // Bar heights use numbers for display. The tooltip and table keep the exact decimal strings.
    <div aria-hidden="true" className={styles.chart} onPointerMove={followPointer}
      onPointerLeave={() => setHover(undefined)} onPointerCancel={() => setHover(undefined)}>
      {daily.map(({ date, netSales }) => (
        <div key={date} className={styles.bar} style={{ height: `${Number(netSales) / peak * 100}%` }} />
      ))}
      {hover && hoveredDay && (
        <>
          {/* Both hover elements share the pointer's horizontal position. */}
          <div className={styles.chartGuide} style={{ left: hover.x }} />
          <div className={styles.chartTooltip} data-left={hover.left} data-above={hover.above}
            style={{ left: hover.x, top: hover.y }}>
            <div>{hoveredDay.date} UTC</div>
            <strong>Net sales {hoveredDay.netSales}</strong>
          </div>
        </>
      )}
    </div>
  )
}

const rankingColors = [
  '#2b54a3', '#148584', '#ae7135', '#7552a1', '#b94e65',
  '#48785d', '#477da8', '#a34d80', '#747735', '#6550bd',
]

function RankingTable({ title, nameColumn, rows, showCases = false }: {
  title: string
  nameColumn: string
  rows: (SalesReport['customers'][number] & { casesSold?: number })[]
  showCases?: boolean
}) {
  const [hover, setHover] = useState<{ index: number; x: number; y: number; left: boolean; above: boolean }>()
  const activeRow = hover && rows[hover.index]
  // The pie uses approximate visual proportions. The table keeps the exact decimal amounts.
  const total = rows.reduce((sum, row) => sum + Number(row.netSales), 0)
  let cumulativeSales = 0
  const segments = rows.map((row, index) => {
    // Use additional hues when the ranking has more entries than the main palette.
    const color = rankingColors[index] ?? `hsl(${(index * 137.508) % 360} 45% 44%)`
    const start = total > 0 ? cumulativeSales / total * 100 : 0
    cumulativeSales += Number(row.netSales)
    const end = total > 0 ? cumulativeSales / total * 100 : 0
    return { color, start, end, stop: `${color} ${start}% ${end}%` }
  })
  const background = `conic-gradient(${segments.map(({ stop }) => stop).join(', ')})`

  function followSlice(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return
    const x = event.clientX - bounds.left
    const y = event.clientY - bounds.top
    const dx = x - bounds.width / 2
    const dy = y - bounds.height / 2
    // CSS conic gradients start at the top and increase clockwise.
    const angle = (Math.atan2(dx, -dy) / (2 * Math.PI) + 1) % 1 * 100
    const index = segments.findIndex(({ start, end }) => angle >= start && angle < end)
    setHover(index === -1 ? undefined : { index, x, y, left: dx > 0, above: dy > 0 })
  }

  return (
    <Paper withBorder p="md">
      <Title order={3} size="h3">{title}</Title>
      {total > 0 && (
        <div className={styles.pieFrame}>
          <div role="img" aria-label={`${nameColumn} share of net sales`} className={styles.pie} style={{ background }}
            onPointerMove={followSlice} onPointerLeave={() => setHover(undefined)} onPointerCancel={() => setHover(undefined)} />
          {hover && activeRow && (
            <div aria-hidden="true" className={`${styles.chartTooltip} ${styles.pieTooltip}`}
              data-left={hover.left} data-above={hover.above} style={{ left: hover.x, top: hover.y }}>
              <strong>{activeRow.name}</strong>
              <div>Net sales {activeRow.netSales}</div>
              <div>{(Number(activeRow.netSales) / total).toLocaleString(undefined, {
                style: 'percent', maximumFractionDigits: 1,
              })} of net sales</div>
              {showCases && <div>{activeRow.casesSold} cases sold</div>}
            </div>
          )}
        </div>
      )}
      {rows.length > 0 && total === 0 && <Text size="sm" mt="sm">No net sales to chart.</Text>}
      {rows.length === 0 ? <Text size="sm" mt="sm">{`No ranked ${nameColumn.toLowerCase()}s.`}</Text> : (
        <Table aria-label={title} striped mt="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th scope="col">{nameColumn}</Table.Th>
              <Table.Th scope="col">Net sales</Table.Th>
              {showCases && <Table.Th scope="col">Cases sold</Table.Th>}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {/* Stable record IDs keep rows distinct even when names match. */}
            {rows.map(({ id, name, netSales, casesSold }, index) => (
              <Table.Tr key={id}>
                <Table.Th scope="row">
                  {Number(netSales) > 0 && (
                    <span aria-hidden="true" className={styles.swatch} style={{ background: segments[index].color }} />
                  )}
                  {name}
                </Table.Th>
                <Table.Td>{netSales}</Table.Td>
                {showCases && <Table.Td>{casesSold}</Table.Td>}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Paper>
  )
}
