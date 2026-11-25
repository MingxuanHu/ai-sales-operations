import { Alert, Button, NavLink, Paper, Select, Stack } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import { NavLink as RouterNavLink, useMatch, useNavigate } from 'react-router'
import type { Membership, OrganisationsApi } from '../api/organisations'
import { customersPath, invitationsPath, organisationPath, ordersPath, productsPath } from '../routes/workspacePaths'
import styles from './WorkspaceNavigation.module.css'

export function WorkspaceNavigation({ memberships, api, onDemoCreated }: {
  memberships: Membership[]
  api: OrganisationsApi
  onDemoCreated: (membership: Membership) => void
}) {
  const navigate = useNavigate()
  // Match the same paths as the routes so the links and organisation picker follow the URL.
  const invitationRoute = useMatch('/organisations/:organisationId/invitations')
  const productsRoute = useMatch('/organisations/:organisationId/products')
  const customersRoute = useMatch('/organisations/:organisationId/customers')
  const ordersRoute = useMatch('/organisations/:organisationId/orders')
  const overviewRoute = useMatch('/organisations/:organisationId')
  const inboxRoute = useMatch('/invitations')
  const selectedId = (invitationRoute ?? productsRoute ?? customersRoute ?? ordersRoute ?? overviewRoute)?.params.organisationId
  const selected = memberships.find(({ organisationId }) => organisationId === selectedId)
  const isInvitations = Boolean(invitationRoute ?? inboxRoute)

  const requestId = useRef<string | undefined>(undefined)
  const pending = useRef<AbortController | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  useEffect(() => () => pending.current?.abort(), [])

  async function createDemo() {
    if (pending.current) return
    const request = new AbortController()
    pending.current = request
    // Keep the same ID after a failed response. A successful creation clears it for the next click.
    const id = requestId.current ??= crypto.randomUUID()
    setState('loading')
    try {
      const membership = await api.createDemo(id, request.signal)
      if (request.signal.aborted) return
      requestId.current = undefined
      onDemoCreated(membership)
      setState('success')
    } catch {
      if (!request.signal.aborted) setState('error')
    } finally {
      pending.current = null
    }
  }

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
              else if (ordersRoute && next && next.role !== 'admin') void navigate(ordersPath(id))
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
          {(selected?.role === 'salesperson' || selected?.role === 'manager') && (
            <NavLink label="Orders" renderRoot={(props) => (
              <RouterNavLink {...props} to={ordersPath(selected.organisationId)} end />
            )} />
          )}
          <NavLink label="Invitations" renderRoot={(props) => (
            <RouterNavLink {...props} to={invitationsPath(selectedId)} end />
          )} />
          <NavLink label="Create organisation" renderRoot={(props) => (
            <RouterNavLink {...props} to="/onboarding" end />
          )} />
        </nav>
        <Button variant="light" loading={state === 'loading'} onClick={() => void createDemo()}>
          Create demo organisation
        </Button>
        {state === 'success' && <Alert role="status">Demo ready. Choose it from the organisation picker.</Alert>}
        {state === 'error' && <Alert role="alert" color="red">Could not create the demo. Try again.</Alert>}
      </Stack>
    </Paper>
  )
}
