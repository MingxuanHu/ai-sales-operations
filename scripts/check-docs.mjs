import { existsSync, readFileSync } from 'node:fs';

const required = [
  'README.md', 'LICENSE', 'AGENTS.md', 'docs/README.md',
  'docs/product/vision.md', 'docs/planning/roadmap.md',
  'docs/milestones/TEMPLATE.md', 'docs/architecture/system.md',
  'docs/decisions/0001-technical-baseline.md',
  'docs/decisions/0002-delivery-strategy.md',
  'docs/decisions/0003-hosting.md',
  'docs/decisions/0004-identity.md',
  'docs/engineering/local-development.md',
  'docs/engineering/delivery.md', 'docs/engineering/security.md',
];
const missing = required.filter((p) => !existsSync(p) || !readFileSync(p, 'utf8').trim());
if (missing.length) {
  console.error(`Missing/empty files: ${missing.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(`Documentation scaffold OK (${required.length} files).`);
}
