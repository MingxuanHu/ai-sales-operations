import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { App } from 'aws-cdk-lib';
import { CognitoStack } from './cognito-stack.ts';

// Resolve the root setup file relative to this source file so CDK can run from its package.
const settings = parseEnv(readFileSync(new URL('../../.env.aws', import.meta.url), 'utf8'));
const { AWS_ACCOUNT_ID: account, AWS_REGION: region } = settings;
if (!account || !region) {
  throw new Error('Set AWS_ACCOUNT_ID and AWS_REGION in .env.aws.');
}

const app = new App();
// CDK context is passed with -c. Omit it to use the existing development workflow.
const target: unknown = app.node.tryGetContext('target') ?? 'development';
const env = { account, region };
const demoStackName = 'SalesOperationsDemoCognito';

switch (target) {
  case 'development': {
    const {
      COGNITO_STACK_NAME: stackName,
      COGNITO_DOMAIN_PREFIX: prefix,
      GOOGLE_OAUTH_CLIENT_ID: clientId,
      GOOGLE_OAUTH_CLIENT_SECRET_REF: secretRef,
    } = settings;
    if (!stackName || !prefix || stackName === demoStackName) {
      throw new Error('Set a separate development COGNITO_STACK_NAME and COGNITO_DOMAIN_PREFIX in .env.aws.');
    }
    if (Boolean(clientId) !== Boolean(secretRef)) {
      throw new Error('Set both GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET_REF to enable Google.');
    }

    const appSettings = parseEnv(readFileSync(new URL('../../.env', import.meta.url), 'utf8'));
    const apiAudience = appSettings.VITE_COGNITO_API_RESOURCE_URL;
    if (!apiAudience) {
      throw new Error('Set VITE_COGNITO_API_RESOURCE_URL in the root .env.');
    }

    new CognitoStack(app, stackName, {
      env,
      environment: target,
      prefix,
      apiAudience,
      callbackUrl: 'http://localhost:5173/auth/callback',
      logoutUrl: 'http://localhost:5173/',
      google: clientId && secretRef ? { clientId, secretRef } : undefined,
    });
    break;
  }
  case 'demo': {
    const {
      DEMO_COGNITO_DOMAIN_PREFIX: prefix,
      DEMO_WEB_ORIGIN: webOrigin,
      DEMO_GOOGLE_OAUTH_CLIENT_ID: clientId,
      DEMO_GOOGLE_OAUTH_CLIENT_SECRET_REF: secretRef,
    } = settings;
    if (Boolean(clientId) !== Boolean(secretRef)) {
      throw new Error('Set both DEMO_GOOGLE_OAUTH_CLIENT_ID and DEMO_GOOGLE_OAUTH_CLIENT_SECRET_REF to register the demo Google provider.');
    }
    if (!prefix || prefix === settings.COGNITO_DOMAIN_PREFIX) {
      throw new Error('Set a separate DEMO_COGNITO_DOMAIN_PREFIX in .env.aws.');
    }

    // Match the AWS-assigned CloudFront origin before deriving the three demo URLs.
    const origin = webOrigin?.replace(/\/$/, '');
    if (!origin || !/^https:\/\/[a-z0-9]+\.cloudfront\.net$/.test(origin)) {
      throw new Error('Set DEMO_WEB_ORIGIN to the HTTPS CloudFront origin in .env.aws.');
    }

    new CognitoStack(app, demoStackName, {
      env,
      environment: target,
      prefix,
      apiAudience: `${origin}/api`,
      callbackUrl: `${origin}/auth/callback`,
      logoutUrl: `${origin}/`,
      google: clientId && secretRef ? { clientId, secretRef } : undefined,
    });
    break;
  }
  default:
    throw new Error('Use -c target=development or -c target=demo.');
}
