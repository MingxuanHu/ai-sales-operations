import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { App, CfnOutput, RemovalPolicy, SecretValue, Stack } from 'aws-cdk-lib';
import {
  CfnManagedLoginBranding,
  CfnUserPool,
  CfnUserPoolClient,
  CfnUserPoolDomain,
  CfnUserPoolIdentityProvider,
  CfnUserPoolResourceServer,
} from 'aws-cdk-lib/aws-cognito';

// Resolve the root setup file relative to this source file so CDK can run from its package.
const settings = parseEnv(readFileSync(new URL('../../.env.aws', import.meta.url), 'utf8'));
const {
  AWS_ACCOUNT_ID: account,
  AWS_REGION: region,
  COGNITO_STACK_NAME: stackName,
  COGNITO_DOMAIN_PREFIX: prefix,
  GOOGLE_OAUTH_CLIENT_ID: googleClientId,
  GOOGLE_OAUTH_CLIENT_SECRET_REF: googleSecretRef,
} = settings;

if (!account || !region || !stackName || !prefix) {
  throw new Error('Set AWS_ACCOUNT_ID, AWS_REGION, COGNITO_STACK_NAME and COGNITO_DOMAIN_PREFIX in .env.aws.');
}

if (Boolean(googleClientId) !== Boolean(googleSecretRef)) {
  throw new Error('Set both GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET_REF to enable Google.');
}

// The browser, API and Cognito use the same environment-specific audience.
const appSettings = parseEnv(readFileSync(new URL('../../.env', import.meta.url), 'utf8'));
const apiAudience = appSettings.VITE_COGNITO_API_RESOURCE_URL;
if (!apiAudience) {
  throw new Error('Set VITE_COGNITO_API_RESOURCE_URL in the root .env.');
}

// The explicit environment keeps the stack tied to the development account and Region.
const app = new App();
const stack = new Stack(app, stackName, { env: { account, region } });

const pool = new CfnUserPool(stack, 'DevelopmentUserPool', {
  userPoolTier: 'ESSENTIALS',
  adminCreateUserConfig: { allowAdminCreateUserOnly: false },
  autoVerifiedAttributes: ['email'],
  schema: [{ name: 'email', required: true, mutable: true }],
  deletionProtection: 'ACTIVE',
});
// Retain the user directory if the stack is removed or the resource is replaced.
pool.applyRemovalPolicy(RemovalPolicy.RETAIN);

// This registers the API audience in Cognito. NestJS still serves the API locally.
new CfnUserPoolResourceServer(stack, 'DevelopmentApiResourceServer', {
  userPoolId: pool.ref,
  identifier: apiAudience,
  name: 'Sales Operations Development API',
});

const domain = new CfnUserPoolDomain(stack, 'ManagedLoginDomain', {
  userPoolId: pool.ref,
  domain: prefix,
  managedLoginVersion: 2,
});

// Google is optional so a fresh development stack can publish its domain before OAuth registration.
const google = googleClientId && googleSecretRef
  ? new CfnUserPoolIdentityProvider(stack, 'GoogleIdentityProvider', {
    userPoolId: pool.ref,
    providerName: 'Google',
    providerType: 'Google',
    providerDetails: {
      client_id: googleClientId,
      // CloudFormation resolves this reference at deployment. The template contains no secret value.
      client_secret: SecretValue.secretsManager(googleSecretRef, { jsonField: 'client_secret' }).unsafeUnwrap(),
      authorize_scopes: 'openid email profile',
    },
    attributeMapping: { email: 'email', email_verified: 'email_verified' },
  })
  : undefined;

const client = new CfnUserPoolClient(stack, 'PublicAppClient', {
  userPoolId: pool.ref,
  generateSecret: false,
  supportedIdentityProviders: google ? ['COGNITO', 'Google'] : ['COGNITO'],
  allowedOAuthFlowsUserPoolClient: true,
  allowedOAuthFlows: ['code'],
  allowedOAuthScopes: ['openid'],
  callbackUrLs: ['http://localhost:5173/auth/callback'],
  logoutUrLs: ['http://localhost:5173/'],
  explicitAuthFlows: [],
  accessTokenValidity: 10,
  idTokenValidity: 10,
  refreshTokenValidity: 8,
  tokenValidityUnits: { accessToken: 'minutes', idToken: 'minutes', refreshToken: 'hours' },
  refreshTokenRotation: { feature: 'ENABLED', retryGracePeriodSeconds: 5 },
  enableTokenRevocation: true,
});

// Cognito requires the provider to exist before the app client can enable it.
if (google) client.addResourceDependency(google);

// A programmatically created client needs a branding resource to use Managed Login.
const branding = new CfnManagedLoginBranding(stack, 'ManagedLoginBranding', {
  userPoolId: pool.ref,
  clientId: client.ref,
  useCognitoProvidedValues: true,
});
branding.addResourceDependency(domain);

// Output public identifiers for the root application environment file after deployment.
new CfnOutput(stack, 'UserPoolId', { value: pool.ref });
new CfnOutput(stack, 'Issuer', { value: `https://cognito-idp.${region}.amazonaws.com/${pool.ref}` });
new CfnOutput(stack, 'ManagedLoginUrl', { value: `https://${domain.ref}.auth.${region}.amazoncognito.com` });
new CfnOutput(stack, 'AppClientId', { value: client.ref });
