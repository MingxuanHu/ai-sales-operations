// Encode the identifier as a single URL segment when building navigation links.
export function organisationPath(id: string) {
  return `/organisations/${encodeURIComponent(id)}`
}

export function invitationsPath(id?: string) {
  return id ? organisationPath(id) + '/invitations' : '/invitations'
}

export function productsPath(id: string) {
  return organisationPath(id) + '/products'
}
