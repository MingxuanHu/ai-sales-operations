import { NavLink, Paper, Select, Stack } from '@mantine/core'
import { NavLink as RouterNavLink, useMatch, useNavigate } from 'react-router'
import type { Membership } from '../api/organisations'
import { customersPath, invitationsPath, organisationPath, productsPath } from '../routes/workspacePaths'
import styles from './WorkspaceNavigation.module.css'

export function WorkspaceNavigation({ memberships }: { memberships: Membership[] }) {
  const navigate = useNavigate()
  // Match the same paths as the routes so the links and organisation picker follow the URL.
  const invitationRoute = useMatch('/organisations/:organisationId/invitations')
  const productsRoute = useMatch('/organisations/:organisationId/products')
  const customersRoute = useMatch('/organisations/:organisationId/customers')
  const overviewRoute = useMatch('/organisations/:organisationId')
  const inboxRoute = useMatch('/invitations')
  const selectedId = (invitationRoute ?? productsRoute ?? customersRoute ?? overviewRoute)?.params.organisationId
  const selected = memberships.find(({ organisationId }) => organisationId === selectedId)
  const isInvitations = Boolean(invitationRoute ?? inboxRoute)

  return (
    <Paper withBorder p="md" className={styles.sidebar}>
      <Stack gap="md">
        {memberships.length > 0 && (
          <Select
            label="Organisation"
            placeholder="Choose an organisation"
            data={memberships.map(({ organisationId, name }) => ({ value: organisationId, label: name }))}
            allowDeselect={false}
            maxDropdownHeight={240}
            value={selected?.organisationId ?? null}
            onChange={(id) => {
              if (!id) return
              // Keep the current directory or catalogue open when the next organisation also grants admin access.
              const next = memberships.find(({ organisationId }) => organisationId === id)
              if (productsRoute && next?.role === 'admin') void navigate(productsPath(id))
              else if (customersRoute && next?.role === 'admin') void navigate(customersPath(id))
              else void navigate(isInvitations ? invitationsPath(id) : organisationPath(id))
            }}
          />
        )}
        {/* renderRoot forwards Mantine's link styles to React Router, which sets aria-current. */}
        <nav aria-label="Workspace" className={styles.navigation}>
          {memberships.length > 0 && (
            <NavLink label="Overview" renderRoot={(props) => (
              <RouterNavLink {...props} to={selectedId ? organisationPath(selectedId) : '/'} end />
            )} />
          )}
          {selected?.role === 'admin' && (
            <NavLink label="Products" renderRoot={(props) => (
              <RouterNavLink {...props} to={productsPath(selected.organisationId)} end />
            )} />
          )}
          {selected?.role === 'admin' && (
            <NavLink label="Customers" renderRoot={(props) => (
              <RouterNavLink {...props} to={customersPath(selected.organisationId)} end />
            )} />
          )}
          <NavLink label="Invitations" renderRoot={(props) => (
            <RouterNavLink {...props} to={invitationsPath(selectedId)} end />
          )} />
          <NavLink label="Create organisation" renderRoot={(props) => (
            <RouterNavLink {...props} to="/onboarding" end />
          )} />
        </nav>
      </Stack>
    </Paper>
  )
}
