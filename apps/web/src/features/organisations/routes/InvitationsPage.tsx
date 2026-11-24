import { Stack, Text, Title } from '@mantine/core'
import type { Membership, OrganisationsApi } from '../api/organisations'
import { InvitationInbox } from '../components/invitations/InvitationInbox'
import { StaffInvitation } from '../components/invitations/StaffInvitation'
import styles from './InvitationsPage.module.css'

export function InvitationsPage({ api, userId, onJoined, membership }: {
  api: OrganisationsApi
  userId: string
  onJoined: (id: string) => void
  membership?: Membership
}) {
  return (
    <Stack gap="lg" className={styles.page}>
      <div>
        <Title order={1} size="h2">Invitations</Title>
        {membership && <Text c="dimmed" size="sm">{membership.name}</Text>}
      </div>
      <div className={styles.panels}>
        {/* The scoped route passes the current membership from the API. */}
        {membership?.role === 'admin' && <StaffInvitation api={api} organisationId={membership.organisationId} />}
        <InvitationInbox api={api} userId={userId} onJoined={onJoined} />
      </div>
    </Stack>
  )
}
