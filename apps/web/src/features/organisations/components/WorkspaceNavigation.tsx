import { NavLink, Paper, Select, Stack } from '@mantine/core'
import { NavLink as RouterNavLink, useMatch, useNavigate } from 'react-router'
import type { Membership } from '../api/organisations'
import { organisationDisplayName } from '../organisationDisplayName'
import { customersPath, organisationLandingPath, organisationPath, ordersPath, productsPath, settingsPath } from '../routes/workspacePaths'
import styles from './WorkspaceNavigation.module.css'

const roleLabels = { admin: 'Administrator', manager: 'Manager', salesperson: 'Salesperson' }

export function WorkspaceNavigation({ memberships }: { memberships: Membership[] }) {
  const navigate = useNavigate()
  // Match the same paths as the routes so the links and organisation picker follow the URL.
  const productsRoute = useMatch('/organisations/:organisationId/products')
  const customersRoute = useMatch('/organisations/:organisationId/customers')
  const ordersRoute = useMatch('/organisations/:organisationId/orders')
  const settingsRoute = useMatch('/organisations/:organisationId/settings')
  const overviewRoute = useMatch('/organisations/:organisationId')
  const selectedId = (productsRoute ?? customersRoute ?? ordersRoute ?? settingsRoute ?? overviewRoute)?.params.organisationId
  const selected = memberships.find(({ organisationId }) => organisationId === selectedId)
  const options = new Map(memberships.map((membership) => {
    const { organisationId, name, role } = membership
    const display = organisationDisplayName(membership)
    return [organisationId, {
      value: organisationId,
      // Select displays the compact label in its closed field.
      label: display.demoCode ? `Demo · ${display.demoCode}` : name,
      name: display.name,
      detail: display.demoCode,
      role: roleLabels[role],
      fullName: name,
    }]
  }))

  return (
    <Paper withBorder p="md" className={styles.sidebar}>
      <Stack gap="md">
        {memberships.length > 0 && (
          <Select
            label="Organisation"
            placeholder="Choose an organisation"
            data={[...options.values()]}
            title={selected?.name}
            classNames={{ input: styles.pickerInput, dropdown: styles.pickerDropdown, option: styles.pickerOption }}
            renderOption={({ option, checked }) => {
              const entry = options.get(option.value)
              if (!entry) return option.label
              // Select supplies the keyboard interaction and selected state for each custom row.
              return (
                <div className={styles.optionRow} title={entry.fullName}>
                  <div className={styles.optionText}>
                    <span className={styles.optionName}>{entry.name}</span>
                    {entry.detail && <span className={styles.optionDetail}>{entry.detail}</span>}
                    <span className={styles.optionRole}>{entry.role}</span>
                  </div>
                  {checked && <span className={styles.optionCheck} aria-hidden="true">✓</span>}
                </div>
              )
            }}
            allowDeselect={false}
            maxDropdownHeight={240}
            value={selected?.organisationId ?? null}
            onChange={(id) => {
              if (!id) return
              // Keep the current directory or catalogue open when the next organisation also grants admin access.
              const next = memberships.find(({ organisationId }) => organisationId === id)
              if (productsRoute && next?.role === 'admin') void navigate(productsPath(id))
              else if (customersRoute && next?.role === 'admin') void navigate(customersPath(id))
              else if (settingsRoute && next?.role === 'admin') void navigate(settingsPath(id))
              else if (ordersRoute && next) void navigate(ordersPath(id))
              else if (next) void navigate(organisationLandingPath(next))
            }}
          />
        )}
        {/* renderRoot forwards Mantine's link styles to React Router, which sets aria-current. */}
        {selected && (
          <nav aria-label="Selected organisation" className={`${styles.navigation} ${styles.organisationNavigation}`}>
            {selected.role === 'admin' && (
              <>
                <NavLink label="Overview" renderRoot={(props) => (
                  <RouterNavLink {...props} to={organisationPath(selected.organisationId)} end />
                )} />
                <NavLink label="Products" renderRoot={(props) => (
                  <RouterNavLink {...props} to={productsPath(selected.organisationId)} end />
                )} />
                <NavLink label="Customers" renderRoot={(props) => (
                  <RouterNavLink {...props} to={customersPath(selected.organisationId)} end />
                )} />
              </>
            )}
            <NavLink label="Orders" renderRoot={(props) => (
              <RouterNavLink {...props} to={ordersPath(selected.organisationId)} end />
            )} />
            {selected.role === 'admin' && (
              <NavLink label="Settings" renderRoot={(props) => (
                <RouterNavLink {...props} to={settingsPath(selected.organisationId)} end />
              )} />
            )}
          </nav>
        )}
        <nav aria-label="Workspace" className={styles.navigation}>
          <NavLink label="Create organisation" renderRoot={(props) => (
            <RouterNavLink {...props} to="/onboarding" end />
          )} />
        </nav>
      </Stack>
    </Paper>
  )
}
