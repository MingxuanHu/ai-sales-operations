import { Paper, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core'
import type { SalesReport } from '../api/salesReport'
import styles from './SalesReportSections.module.css'

export function SalesReportSections({ report }: { report: SalesReport }) {
  const peak = Math.max(1, ...report.daily.map(({ netSales }) => Number(netSales)))
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
          {/* Only the visual bar heights use numbers. The table displays the API's exact decimal strings. */}
          <div aria-hidden="true" className={styles.chart}>
            {report.daily.map(({ date, netSales }) => (
              <div key={date} className={styles.bar} style={{ height: `${Number(netSales) / peak * 100}%` }} />
            ))}
          </div>
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

function RankingTable({ title, nameColumn, rows, showCases = false }: {
  title: string
  nameColumn: string
  rows: (SalesReport['customers'][number] & { casesSold?: number })[]
  showCases?: boolean
}) {
  // The pie uses approximate visual proportions. The table keeps the exact decimal amounts.
  const total = rows.reduce((sum, row) => sum + Number(row.netSales), 0)
  let cumulativeSales = 0
  const segments = rows.map((row, index) => {
    // Spacing hues apart makes adjacent ranked entries easier to distinguish.
    const color = `hsl(${(index * 137.508 + 168) % 360} 65% 43%)`
    const start = total > 0 ? cumulativeSales / total * 100 : 0
    cumulativeSales += Number(row.netSales)
    const end = total > 0 ? cumulativeSales / total * 100 : 0
    return { color, stop: `${color} ${start}% ${end}%` }
  })
  const background = `conic-gradient(${segments.map(({ stop }) => stop).join(', ')})`
  return (
    <Paper withBorder p="md">
      <Title order={3} size="h3">{title}</Title>
      {total > 0 && (
        <div role="img" aria-label={`${nameColumn} share of net sales`} className={styles.pie} style={{ background }} />
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
