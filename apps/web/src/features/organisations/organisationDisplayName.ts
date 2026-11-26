import type { Membership } from './api/organisations'

export function organisationDisplayName({ name, organisationId, isDemo }: Pick<Membership, 'name' | 'organisationId' | 'isDemo'>) {
  const suffix = ` · ${organisationId}`
  // Older responses without a demo flag can still display the original generated name.
  const generatedDemo = isDemo ?? name === `Demo · Fern & Finch Supply${suffix}`
  if (!generatedDemo || !name.startsWith('Demo · ') || !name.endsWith(suffix)) {
    return { name, heading: name, demoCode: '' }
  }

  // Strip the stored ID before adding the short code used throughout the picker.
  const title = name.slice(0, -suffix.length)
  const code = organisationId.slice(0, 8)
  return { name: title, heading: `${title} · ${code}`, demoCode: code }
}
