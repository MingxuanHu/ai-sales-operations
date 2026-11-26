import { Badge, Group, Paper, Stack, Text, Title } from '@mantine/core'
import type { SalesReportApi } from '../../dashboard/api/salesReport'
import { SalesDashboard } from '../../dashboard/components/SalesDashboard'
import type { Membership } from '../api/organisations'
import { organisationDisplayName } from '../organisationDisplayName'

export function OrganisationOverviewPage({ membership, salesReport }: { membership: Membership; salesReport: SalesReportApi }) {
  return (
    <Stack gap="lg">
      <Paper withBorder p="lg">
        <Stack align="start" gap="sm">
          <Title order={1} size="h2" style={{ overflowWrap: 'anywhere' }}>{organisationDisplayName(membership).heading}</Title>
          <Group gap="xs">
            <Text size="sm" c="dimmed">Your role</Text>
            <Badge variant="light" tt="capitalize">{membership.role}</Badge>
          </Group>
        </Stack>
      </Paper>
      <SalesDashboard api={salesReport} organisationId={membership.organisationId} />
    </Stack>
  )
}
