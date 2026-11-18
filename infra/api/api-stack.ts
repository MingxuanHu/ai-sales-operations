import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib'
import { CfnStage, HttpApi } from 'aws-cdk-lib/aws-apigatewayv2'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import { PolicyStatement } from 'aws-cdk-lib/aws-iam'
import { Architecture, Code, Function, Runtime, RuntimeFamily } from 'aws-cdk-lib/aws-lambda'
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs'
import type { Construct } from 'constructs'

interface DemoApiStackProps extends StackProps {
  artifactPath: string
  userPoolId: string
  issuer: string
  appClientId: string
  resourceUrl: string
  databaseParameterName: string
}

export class DemoApiStack extends Stack {
  constructor(scope: Construct, id: string, props: DemoApiStackProps) {
    super(scope, id, props)

    // Validate the name before using it to construct a permission resource.
    if (!/^\/[\w.-]+(?:\/[\w.-]+)*$/.test(props.databaseParameterName)) {
      throw new Error('Expected an absolute SSM parameter name')
    }

    const logGroup = new LogGroup(this, 'ApiLogs', {
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    })
    const backend = new Function(this, 'ApiFunction', {
      // The workspace already builds and tests on Node 26. The pinned CDK
      // predates the named Runtime constant, so use the AWS runtime identifier.
      runtime: new Runtime('nodejs26.x', RuntimeFamily.NODEJS),
      architecture: Architecture.ARM_64,
      code: Code.fromAsset(props.artifactPath),
      handler: 'dist/lambda.handler',
      memorySize: 512,
      // Leave room for Neon to wake while staying below the HTTP API’s 30-second limit.
      timeout: Duration.seconds(28),
      logGroup,
      environment: {
        // Lambda disables the ESM interop that the CommonJS build uses for Nest imports.
        NODE_OPTIONS: '--experimental-require-module',
        DATABASE_URL_PARAMETER: props.databaseParameterName,
        COGNITO_USER_POOL_ID: props.userPoolId,
        COGNITO_ISSUER: props.issuer,
        COGNITO_APP_CLIENT_ID: props.appClientId,
        COGNITO_API_RESOURCE_URL: props.resourceUrl,
      },
    })

    // A same-account SecureString encrypted with aws/ssm uses this exact
    // parameter permission. The role has no parameter write or list access.
    backend.addToRolePolicy(new PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [this.formatArn({
        service: 'ssm',
        resource: 'parameter',
        resourceName: props.databaseParameterName.slice(1),
      })],
    }))

    // The default stage keeps /api/... intact. Nest guards enforce Cognito
    // and membership on protected routes while allowing the readiness check.
    const api = new HttpApi(this, 'HttpApi', {
      defaultIntegration: new HttpLambdaIntegration('NestIntegration', backend),
    })
    const stage = api.defaultStage?.node.defaultChild as CfnStage
    stage.defaultRouteSettings = { throttlingRateLimit: 5, throttlingBurstLimit: 10 }
    new CfnOutput(this, 'ApiOrigin', { value: api.apiEndpoint })
  }
}
