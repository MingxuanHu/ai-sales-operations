import { App, CfnOutput, RemovalPolicy, SecretValue, Stack, type StackProps } from 'aws-cdk-lib';
import {
  CfnManagedLoginBranding,
  CfnUserPool,
  CfnUserPoolClient,
  CfnUserPoolDomain,
  CfnUserPoolIdentityProvider,
  CfnUserPoolResourceServer,
} from 'aws-cdk-lib/aws-cognito';

type CognitoStackProps = StackProps & {
  environment: 'development' | 'demo';
  prefix: string;
  apiAudience: string;
  callbackUrl: string;
  logoutUrl: string;
  // Optional provider settings let the domain be deployed before Google registration.
  google?: { clientId: string; secretRef: string };
};

// A Stack subclass groups the resources CDK will synthesize into one template.
export class CognitoStack extends Stack {
  constructor(scope: App, id: string, props: CognitoStackProps) {
    super(scope, id, props);
    const { environment, prefix, apiAudience, callbackUrl, logoutUrl } = props;
    const region = this.region;
    const isDemo = environment === 'demo';

    const pool = new CfnUserPool(this, isDemo ? 'DemoUserPool' : 'DevelopmentUserPool', {
      userPoolTier: 'ESSENTIALS',
      adminCreateUserConfig: { allowAdminCreateUserOnly: false },
      autoVerifiedAttributes: ['email'],
      schema: [{ name: 'email', required: true, mutable: true }],
      deletionProtection: 'ACTIVE',
    });
    // Retain the user directory if the stack is removed or the resource is replaced.
    pool.applyRemovalPolicy(RemovalPolicy.RETAIN);

    // This registers the API audience in Cognito. The app requests this value as its token audience.
    new CfnUserPoolResourceServer(this, isDemo ? 'DemoApiResourceServer' : 'DevelopmentApiResourceServer', {
      userPoolId: pool.ref,
      identifier: apiAudience,
      name: isDemo ? 'Sales Operations Demo API' : 'Sales Operations Development API',
    });

    const domain = new CfnUserPoolDomain(this, 'ManagedLoginDomain', {
      userPoolId: pool.ref,
      domain: prefix,
      managedLoginVersion: 2,
    });

    // Both environments can publish their domain before Google OAuth registration.
    const google = props.google
      ? new CfnUserPoolIdentityProvider(this, 'GoogleIdentityProvider', {
        userPoolId: pool.ref,
        providerName: 'Google',
        providerType: 'Google',
        providerDetails: {
          client_id: props.google.clientId,
          // CloudFormation resolves this reference at deployment. The template contains no secret value.
          client_secret: SecretValue.secretsManager(props.google.secretRef, { jsonField: 'client_secret' }).unsafeUnwrap(),
          authorize_scopes: 'openid email profile',
        },
        attributeMapping: { email: 'email', email_verified: 'email_verified' },
      })
      : undefined;

    const client = new CfnUserPoolClient(this, 'PublicAppClient', {
      userPoolId: pool.ref,
      generateSecret: false,
      supportedIdentityProviders: google ? ['COGNITO', 'Google'] : ['COGNITO'],
      allowedOAuthFlowsUserPoolClient: true,
      allowedOAuthFlows: ['code'],
      allowedOAuthScopes: ['openid'],
      callbackUrLs: [callbackUrl],
      logoutUrLs: [logoutUrl],
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
    const branding = new CfnManagedLoginBranding(this, 'ManagedLoginBranding', {
      userPoolId: pool.ref,
      clientId: client.ref,
      useCognitoProvidedValues: true,
    });
    branding.addResourceDependency(domain);

    // Output public identifiers for web and API configuration after deployment.
    new CfnOutput(this, 'UserPoolId', { value: pool.ref });
    new CfnOutput(this, 'Issuer', { value: `https://cognito-idp.${region}.amazonaws.com/${pool.ref}` });
    new CfnOutput(this, 'ManagedLoginUrl', { value: `https://${domain.ref}.auth.${region}.amazoncognito.com` });
    new CfnOutput(this, 'AppClientId', { value: client.ref });
  }
}
