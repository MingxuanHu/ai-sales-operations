import type { Membership } from '../api/organisations'

// Encode the identifier as a single URL segment when building navigation links.
export function organisationPath(id: string) {
  return `/organisations/${encodeURIComponent(id)}`
}

export function productsPath(id: string) {
  return organisationPath(id) + '/products'
}

export function customersPath(id: string) {
  return organisationPath(id) + '/customers'
}

export function ordersPath(id: string) {
  return organisationPath(id) + '/orders'
}

export function settingsPath(id: string) {
  return organisationPath(id) + '/settings'
}

// Pick the first page the organisation role can open.
export function organisationLandingPath({ organisationId, role }: Membership) {
  return role === 'admin' ? organisationPath(organisationId) : ordersPath(organisationId)
}
