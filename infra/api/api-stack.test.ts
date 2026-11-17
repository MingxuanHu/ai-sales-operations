import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { App } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { DemoApiStack } from './api-stack.ts'

const props = {
  env: { account: '123456789012', region: 'ap-southeast-2' },
  // Use a small fixture. Stack assertions run without a build.
  artifactPath: fileURLToPath(new URL('./test-fixtures/', import.meta.url)),
  userPoolId: 'ap-southeast-2_example',
  issuer: 'https://cognito-idp.ap-southeast-2.amazonaws.com/ap-southeast-2_example',
  appClientId: 'example',
  resourceUrl: 'https://example.com/api',
  databaseParameterName: '/sales-operations/demo/database-url',
}

test('the demo stack routes HTTP API v2 events and throttles the default stage', () => {
  const template = Template.fromStack(new DemoApiStack(new App(), 'TestApi', props))
  template.hasResourceProperties('AWS::ApiGatewayV2::Integration', {
    IntegrationType: 'AWS_PROXY',
    PayloadFormatVersion: '2.0',
  })
  template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
    StageName: '$default',
    DefaultRouteSettings: { ThrottlingBurstLimit: 10, ThrottlingRateLimit: 5 },
  })
  template.hasResourceProperties('AWS::Lambda::Function', {
    Handler: 'dist/lambda.handler',
    Runtime: 'nodejs26.x',
    Environment: {
      Variables: Match.objectEquals({
        NODE_OPTIONS: '--experimental-require-module',
        DATABASE_URL_PARAMETER: props.databaseParameterName,
        COGNITO_USER_POOL_ID: props.userPoolId,
        COGNITO_ISSUER: props.issuer,
        COGNITO_APP_CLIENT_ID: props.appClientId,
        COGNITO_API_RESOURCE_URL: props.resourceUrl,
      }),
    },
  })
  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([Match.objectEquals({
        Action: 'ssm:GetParameter',
        Effect: 'Allow',
        Resource: { 'Fn::Join': ['', [
          'arn:', { Ref: 'AWS::Partition' },
          ':ssm:ap-southeast-2:123456789012:parameter/sales-operations/demo/database-url',
        ]] },
      })]),
    },
  })
})

test('wildcards cannot expand the SSM grant', () => {
  assert.throws(() => new DemoApiStack(new App(), 'TestApi', {
    ...props, databaseParameterName: '/sales-operations/demo/*',
  }), /Expected an absolute SSM parameter name/)
})
