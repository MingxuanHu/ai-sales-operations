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

export function dashboardPath(id: string) {
  return organisationPath(id) + '/dashboard'
}
