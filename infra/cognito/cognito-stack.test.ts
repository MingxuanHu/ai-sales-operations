import assert from 'node:assert/strict';
import { test } from 'node:test';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CognitoStack } from './cognito-stack.ts';

const env = { account: '111111111111', region: 'ap-southeast-2' };

// CDK assertions inspect the template locally, without creating AWS resources.
test('development retains its resource IDs and Google provider dependency', () => {
  const template = Template.fromStack(new CognitoStack(new App(), 'SalesOperationsDevCognito', {
    env,
    environment: 'development',
    prefix: 'sales-ops-dev-test',
    apiAudience: 'http://localhost:5173/api',
    callbackUrl: 'http://localhost:5173/auth/callback',
    logoutUrl: 'http://localhost:5173/',
    google: { clientId: 'test-client.apps.googleusercontent.com', secretRef: 'sales-ops/test/google' },
  }));
  const resources = template.toJSON().Resources;
  assert.equal(resources.DevelopmentUserPool.DeletionPolicy, 'Retain');
  assert.equal(resources.DevelopmentApiResourceServer.Properties.Identifier, 'http://localhost:5173/api');
  assert.deepEqual(resources.PublicAppClient.DependsOn, ['GoogleIdentityProvider']);
  template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
    SupportedIdentityProviders: ['COGNITO', 'Google'],
    CallbackURLs: ['http://localhost:5173/auth/callback'],
    LogoutURLs: ['http://localhost:5173/'],
  });
});

test('demo uses a separate pool, code grant and HTTPS URLs with native login', () => {
  const origin = 'https://example.cloudfront.net';
  const template = Template.fromStack(new CognitoStack(new App(), 'SalesOperationsDemoCognito', {
    env,
    environment: 'demo',
    prefix: 'sales-ops-demo-test',
    apiAudience: `${origin}/api`,
    callbackUrl: `${origin}/auth/callback`,
    logoutUrl: `${origin}/`,
  }));
  template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
    Domain: 'sales-ops-demo-test',
    ManagedLoginVersion: 2,
    UserPoolId: { Ref: 'DemoUserPool' },
  });
  template.hasResourceProperties('AWS::Cognito::UserPoolResourceServer', {
    Identifier: `${origin}/api`,
  });
  template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
    UserPoolId: { Ref: 'DemoUserPool' },
    CallbackURLs: [`${origin}/auth/callback`],
    LogoutURLs: [`${origin}/`],
    GenerateSecret: false,
    AllowedOAuthFlows: ['code'],
    SupportedIdentityProviders: ['COGNITO'],
  });
  template.resourceCountIs('AWS::Cognito::UserPoolIdentityProvider', 0);
});

test('demo enables Google with the existing client secret reference', () => {
  const template = Template.fromStack(new CognitoStack(new App(), 'SalesOperationsDemoCognito', {
    env,
    environment: 'demo',
    prefix: 'sales-ops-demo-test',
    apiAudience: 'https://example.cloudfront.net/api',
    callbackUrl: 'https://example.cloudfront.net/auth/callback',
    logoutUrl: 'https://example.cloudfront.net/',
    google: { clientId: 'test-client.apps.googleusercontent.com', secretRef: 'sales-ops/demo/google' },
  }));
  template.resourceCountIs('AWS::Lambda::Function', 0);
  template.resourceCountIs('AWS::IAM::Role', 0);
  template.hasResourceProperties('AWS::Cognito::UserPoolIdentityProvider', {
    ProviderDetails: {
      client_secret: '{{resolve:secretsmanager:sales-ops/demo/google:SecretString:client_secret::}}',
    },
  });
  const resources = template.toJSON().Resources;
  assert.deepEqual(resources.PublicAppClient.DependsOn, ['GoogleIdentityProvider']);
  template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
    SupportedIdentityProviders: ['COGNITO', 'Google'],
  });
});
