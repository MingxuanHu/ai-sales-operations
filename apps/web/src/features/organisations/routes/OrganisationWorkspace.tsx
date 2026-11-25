import { Alert, Button, Paper, Text, Title } from '@mantine/core'
import { useEffect, useState } from 'react'
import { CustomersPage } from '../../customers/components/CustomersPage'
import { OrdersPage } from '../../orders/components/OrdersPage'
import { ProductsPage } from '../../products/components/ProductsPage'
import { Navigate, Route, Routes, useNavigate } from 'react-router'
import type { Membership, OrganisationsApi, Profile } from '../api/organisations'
import { Loading, type LoadResult } from '../components/Loading'
import { WorkspaceNavigation } from '../components/WorkspaceNavigation'
import { CreateOrganisationPage } from './CreateOrganisationPage'
import { InvitationsPage } from './InvitationsPage'
import { OrganisationAccess } from './OrganisationAccess'
import { OrganisationSettingsPage } from './OrganisationSettingsPage'
import { OrganisationOverviewPage } from './OrganisationOverviewPage'
import { organisationPath } from './workspacePaths'
import styles from './OrganisationWorkspace.module.css'

export function OrganisationWorkspace({ api }: { api: OrganisationsApi }) {
  const [profile, setProfile] = useState<LoadResult<Profile>>({ status: 'loading' })
  // Changing this counter asks the effect to fetch again, even when the API client is the same.
  const [revision, setRevision] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    const request = new AbortController()
    void api.profile(request.signal).then((data) => {
      if (!request.signal.aborted) setProfile({ status: 'ready', data })
    }).catch((error: unknown) => {
      if (!request.signal.aborted) setProfile({ status: 'failed', error })
    })
    // React runs this cleanup before fetching again and when the workspace leaves the screen.
    return () => request.abort()
  }, [api, revision])

  function reloadProfile() {
    // The updater function calculates the next counter from the previous state.
    setProfile({ status: 'loading' })
    setRevision((value) => value + 1)
  }

  function onJoined(id: string) {
    reloadProfile()
    void navigate(organisationPath(id))
  }

  function openDemo(membership: Membership) {
    // Add the demo before navigating so the route and picker resolve to the same organisation.
    setProfile((current) => {
      if (current.status !== 'ready' || current.data.memberships.some((item) => item.organisationId === membership.organisationId)) {
        return current
      }
      return { status: 'ready', data: { ...current.data, memberships: [...current.data.memberships, membership] } }
    })
    void navigate(organisationPath(membership.organisationId))
  }

  if (profile.status === 'loading') return <Loading>Loading your organisations…</Loading>
  if (profile.status === 'failed') {
    return <Alert role="alert" color="red" title="Could not load your organisations">
      <Button variant="light" onClick={reloadProfile}>Try again</Button>
    </Alert>
  }

  const { memberships, userId } = profile.data
  return (
    <div className={styles.workspace}>
      <WorkspaceNavigation memberships={memberships} />
      <div className={styles.content}>
        <Routes>
          <Route index element={memberships.every((membership) => membership.isDemo === true) ? (
            <Navigate replace to="/onboarding" />
          ) : memberships.length === 1 ? (
            <Navigate replace to={organisationPath(memberships[0].organisationId)} />
          ) : (
            <Paper withBorder p="lg">
              <Title order={1} size="h2">Choose an organisation</Title>
              <Text c="dimmed">Select an organisation to open its workspace.</Text>
            </Paper>
          )} />
          <Route path="/onboarding" element={<CreateOrganisationPage api={api} onJoined={onJoined} onDemoCreated={openDemo} />} />
          <Route path="/invitations" element={<InvitationsPage api={api} userId={userId} onJoined={onJoined} />} />
          <Route path="/organisations/:organisationId" element={
            <OrganisationAccess api={api} onDenied={reloadProfile}>
              {(membership) => <OrganisationOverviewPage membership={membership} />}
            </OrganisationAccess>
          } />
          <Route path="/organisations/:organisationId/settings" element={
            <OrganisationAccess api={api} onDenied={reloadProfile}>
              {(membership) => membership.role === 'admin' ? (
                <OrganisationSettingsPage membership={membership} api={api} onDeleted={() => {
                  reloadProfile()
                  void navigate('/', { replace: true })
                }} />
              ) : <Alert role="alert" color="red" title="Access denied">
                Only organisation administrators can manage settings.
              </Alert>}
            </OrganisationAccess>
          } />
          <Route path="/organisations/:organisationId/invitations" element={
            <OrganisationAccess api={api} onDenied={reloadProfile}>
              {(membership) => <InvitationsPage api={api} userId={userId} onJoined={onJoined} membership={membership} />}
            </OrganisationAccess>
          } />
          <Route path="/organisations/:organisationId/products" element={
            <OrganisationAccess api={api} onDenied={reloadProfile}>
              {(membership) => membership.role === 'admin'
                ? <ProductsPage api={api.products} organisationId={membership.organisationId} />
                : <Alert role="alert" color="red" title="Access denied">
                  Only organisation administrators can manage products.
                </Alert>}
            </OrganisationAccess>
          } />
          <Route path="/organisations/:organisationId/customers" element={
            <OrganisationAccess api={api} onDenied={reloadProfile}>
              {(membership) => membership.role === 'admin'
                ? <CustomersPage api={api.customers} organisationId={membership.organisationId} />
                : <Alert role="alert" color="red" title="Access denied">
                  Only organisation administrators can manage customers.
                </Alert>}
            </OrganisationAccess>
          } />
          <Route path="/organisations/:organisationId/orders" element={
            <OrganisationAccess api={api} onDenied={reloadProfile}>
              {(membership) => <OrdersPage api={api.orders} organisationId={membership.organisationId} role={membership.role} userId={userId} isDemo={membership.isDemo === true} />}
            </OrganisationAccess>
          } />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </div>
    </div>
  )
}
