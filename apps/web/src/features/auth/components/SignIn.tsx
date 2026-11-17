import { Alert, Button, Paper, Stack, Text, Title } from '@mantine/core'

// Props are inputs from the parent. Destructuring here gives each input its own name.
export function SignIn({ configured, redirecting, error, onSignIn }: {
  configured: boolean
  redirecting: boolean
  error: string
  onSignIn: () => void
}) {
  return (
    <Paper withBorder shadow="sm" maw={480} mx="auto" p={{ base: 'lg', sm: 'xl' }}>
      <Stack>
        <Title order={1}>Sign in</Title>
        <Text c="dimmed">Open Managed Login to sign in, register a new account, or continue with Google. Google sign-in for the demo is limited to allowlisted test accounts.</Text>
        {/* In JSX, && shows the element only when its condition is true. */}
        {!configured && <Alert color="yellow">Configure Cognito in the repository’s root .env to enable sign-in.</Alert>}
        {error && <Alert color="red" role="alert">{error}</Alert>}
        {/* onClick receives a function to run when the user presses the button. */}
        <Button disabled={!configured} loading={redirecting} onClick={onSignIn}>
          Continue to sign in
        </Button>
      </Stack>
    </Paper>
  )
}
