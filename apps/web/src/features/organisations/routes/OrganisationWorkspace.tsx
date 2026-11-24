import { Alert, Button, Paper, Text, Title } from '@mantine/core'
import { useEffect, useState } from 'react'
import { ProductsPage } from '../../products/components/ProductsPage'
import { Navigate, Route, Routes, useNavigate } from 'react-router'
import type { OrganisationsApi, Profile } from '../api/organisations'
import { Loading, type LoadResult } from '../components/Loading'
import { WorkspaceNavigation } from '../components/WorkspaceNavigation'
import { CreateOrganisationPage } from './CreateOrganisationPage'
import { InvitationsPage } from './InvitationsPage'
import { OrganisationAccess } from './OrganisationAccess'
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
          <Route index element={memberships.length === 1 ? (
            <Navigate replace to={organisationPath(memberships[0].organisationId)} />
          ) : memberships.length ? (
            <Paper withBorder p="lg">
              <Title order={1} size="h2">Choose an organisation</Title>
              <Text c="dimmed">Select an organisation to open its workspace.</Text>
            </Paper>
          ) : <Navigate replace to="/invitations" />} />
          <Route path="/onboarding" element={<CreateOrganisationPage api={api} onJoined={onJoined} />} />
          <Route path="/invitations" element={<InvitationsPage api={api} userId={userId} onJoined={onJoined} />} />
          <Route path="/organisations/:organisationId" element={
            <OrganisationAccess api={api} onDenied={reloadProfile}>
              {(membership) => <OrganisationOverviewPage membership={membership} />}
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
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </div>
    </div>
  )
}
