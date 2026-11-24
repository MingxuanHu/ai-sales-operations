import { Badge, Group, Paper, Stack, Text, Title } from '@mantine/core'
import type { Membership } from '../api/organisations'

export function OrganisationOverviewPage({ membership }: { membership: Membership }) {
  return (
    <Paper withBorder p="lg">
      <Stack align="start" gap="sm">
        <Title order={1} size="h2">{membership.name}</Title>
        <Group gap="xs">
          <Text size="sm" c="dimmed">Your role</Text>
          <Badge variant="light" tt="capitalize">{membership.role}</Badge>
        </Group>
      </Stack>
    </Paper>
  )
}
