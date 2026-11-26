import type { Membership } from './api/organisations'

const demoName = 'Demo · Fern & Finch Supply'

export function organisationDisplayName({ name, organisationId }: Pick<Membership, 'name' | 'organisationId'>) {
  // Match the generated name to its own ID so custom names keep their original text.
  if (name !== `${demoName} · ${organisationId}`) {
    return { name, heading: name, demoCode: '' }
  }

  // Both the picker and Overview show the first eight characters of the same ID.
  const code = organisationId.slice(0, 8)
  return { name: demoName, heading: `${demoName} · ${code}`, demoCode: code }
}
