import { ArnFormat, CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib'
import { OidcProviderNative, PolicyDocument, PolicyStatement, Role, WebIdentityPrincipal } from 'aws-cdk-lib/aws-iam'
import type { Construct } from 'constructs'

// These are public resource identifiers read from the existing demo stacks.
// Keeping them explicit prevents a wildcard from granting access to another app.
export const demoTargets = {
  functionName: 'SalesOperationsDemoApi-ApiFunctionCE271BD4-04BpZE8CXvGS',
  bucketName: 'salesoperationsdemoweb-webassets27872646-ngmiddvdzwdm',
  distributionId: 'E1NWV6DKPQ0SSF',
} as const
export const demoSubject = 'repo:MingxuanHu@20830158/ai-sales-operations@1452171772:environment:demo'

interface DeliveryStackProps extends StackProps {
  // Import the account-wide provider when it already exists; never create a duplicate.
  reuseProvider: boolean
}

export class DemoDeliveryStack extends Stack {
  constructor(scope: Construct, id: string, props: DeliveryStackProps) {
    super(scope, id, props)

    const providerArn = this.formatArn({
      service: 'iam', region: '', resource: 'oidc-provider',
      resourceName: 'token.actions.githubusercontent.com',
    })
    const provider = props.reuseProvider
      ? OidcProviderNative.fromOidcProviderArn(this, 'GitHubProvider', providerArn)
      : new OidcProviderNative(this, 'GitHubProvider', {
        url: 'https://token.actions.githubusercontent.com',
        clientIds: ['sts.amazonaws.com'],
        // The provider can be shared by other roles after setup; retain it on deletion.
        removalPolicy: RemovalPolicy.RETAIN,
      })

    const role = new Role(this, 'DemoReleaseRole', {
      roleName: 'SalesOperationsDemoRelease',
      maxSessionDuration: Duration.hours(1),
      // The environment subject replaces the branch subject. GitHub's demo
      // environment restriction to main is the other half of this trust boundary.
      assumedBy: new WebIdentityPrincipal(provider.oidcProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': demoSubject,
        },
      }),
      inlinePolicies: {
        // Inline policies are reviewed with the role in the same change set.
        PublishDemo: new PolicyDocument({ statements: [
          new PolicyStatement({
            actions: ['lambda:UpdateFunctionCode', 'lambda:GetFunctionConfiguration'],
            resources: [this.formatArn({
              service: 'lambda', resource: 'function', resourceName: demoTargets.functionName,
              arnFormat: ArnFormat.COLON_RESOURCE_NAME,
            })],
          }),
          new PolicyStatement({
            actions: ['s3:ListBucket', 's3:GetBucketLocation'],
            resources: [`arn:${this.partition}:s3:::${demoTargets.bucketName}`],
          }),
          new PolicyStatement({
            // Old hashed assets stay available for open tabs and rollback; no delete grant.
            actions: ['s3:PutObject', 's3:GetObject'],
            resources: [`arn:${this.partition}:s3:::${demoTargets.bucketName}/*`],
          }),
          new PolicyStatement({
            actions: ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'],
            resources: [this.formatArn({
              service: 'cloudfront', region: '', resource: 'distribution',
              resourceName: demoTargets.distributionId,
            })],
          }),
        ] }),
      },
    })
    new CfnOutput(this, 'DemoReleaseRoleArn', { value: role.roleArn })
  }
}
