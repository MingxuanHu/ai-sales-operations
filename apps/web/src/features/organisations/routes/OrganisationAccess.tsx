import { Alert, Button, Stack, Text } from '@mantine/core'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { ApiError, type Membership, type OrganisationsApi } from '../api/organisations'
import { Loading, type LoadResult } from '../components/Loading'

type OrganisationAccessProps = {
  api: OrganisationsApi
  onDenied: () => void
  children: (membership: Membership) => ReactNode
}

export function OrganisationAccess(props: OrganisationAccessProps) {
  const { organisationId = '' } = useParams()
  // A new key unmounts the old tenant's page, including its form and pending requests.
  return <OrganisationAccessCheck key={organisationId} id={organisationId} {...props} />
}

function OrganisationAccessCheck({ id, api, onDenied, children }: OrganisationAccessProps & { id: string }) {
  // Start with a loading screen while the API checks access to this specific organisation.
  const [result, setResult] = useState<LoadResult<Membership>>({ status: 'loading' })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const request = new AbortController()
    // Ignore a response after cleanup so a previous organisation cannot update this view.
    void api.overview(id, request.signal).then((data) => {
      if (!request.signal.aborted) setResult({ status: 'ready', data })
    }).catch((error: unknown) => {
      if (!request.signal.aborted) setResult({ status: 'failed', error })
    })
    return () => request.abort()
  }, [api, id, revision])

  if (result.status === 'loading') return <Loading>Checking organisation access…</Loading>
  if (result.status === 'failed') {
    const denied = result.error instanceof ApiError && [403, 404].includes(result.error.status)
    return (
      <Alert color="red" role="alert" title={denied ? 'Access denied' : 'Could not load the organisation'}>
        {denied ? (
          <Stack align="start">
            <Text size="sm">Your account does not have access to this organisation.</Text>
            <Button component={Link} to="/" variant="light" onClick={onDenied}>Back to organisations</Button>
          </Stack>
        ) : <Button variant="light" onClick={() => {
          setResult({ status: 'loading' })
          setRevision((value) => value + 1)
        }}>Try again</Button>}
      </Alert>
    )
  }
  // Route content receives the membership only once the API confirms access.
  return children(result.data)
}
