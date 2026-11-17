import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { App } from 'aws-cdk-lib';
import { DemoWebStack } from './web-stack.ts';

// Resolve the setup file from this module so synthesis works from the package directory.
const settings = parseEnv(readFileSync(new URL('../../.env.aws', import.meta.url), 'utf8'));
const { AWS_ACCOUNT_ID: account, AWS_REGION: region } = settings;
if (!account || !region) {
  throw new Error('Set AWS_ACCOUNT_ID and AWS_REGION in the root .env.aws.');
}

new DemoWebStack(new App(), 'SalesOperationsDemoWeb', { env: { account, region } });
