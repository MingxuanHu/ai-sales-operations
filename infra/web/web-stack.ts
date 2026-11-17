import { CfnOutput, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import {
  AllowedMethods, CachePolicy, Distribution, Function as CloudFrontFunction,
  FunctionCode, FunctionEventType, OriginProtocolPolicy, OriginRequestPolicy,
  ResponseHeadersPolicy, ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin, S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { BlockPublicAccess, Bucket, BucketEncryption, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

export interface DemoWebStackProps extends StackProps {
  apiOrigin: string;
}

export class DemoWebStack extends Stack {
  constructor(scope: Construct, id: string, props: DemoWebStackProps) {
    super(scope, id, props);

    // Accept an origin only: adding a path here would change every forwarded API URL.
    const api = new URL(props.apiOrigin);
    if (api.protocol !== 'https:' || api.username || api.password || api.port ||
        api.pathname !== '/' || api.search || api.hash) {
      throw new Error('apiOrigin must be an HTTPS origin without a path or credentials.');
    }

    // CloudFront reads objects from the S3 API. The bucket blocks public access.
    const bucket = new Bucket(this, 'WebAssets', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Only browser routes receive the SPA shell. Missing assets and API errors keep their status.
    const spaRoutes = new CloudFrontFunction(this, 'SpaRoutes', {
      code: FunctionCode.fromInline(`function handler(event) {
  var request = event.request;
  if (request.uri === '/' || request.uri === '/auth/callback' ||
      request.uri.indexOf('/organisations/') === 0) {
    request.uri = '/index.html';
  }
  return request;
}`),
    });

    // OAC signs CloudFront's requests and grants read access to this distribution.
    // CDK uses the assigned CloudFront hostname and its default certificate.
    const distribution = new Distribution(this, 'WebDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: ResponseHeadersPolicy.SECURITY_HEADERS,
        // Revalidate HTML so a release can point to new hashed JavaScript assets immediately.
        cachePolicy: CachePolicy.CACHING_DISABLED,
        functionAssociations: [{ function: spaRoutes, eventType: FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new HttpOrigin(api.hostname, { protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY }),
          viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          // Forward bearer tokens, query strings and cookies, but let API Gateway supply Host.
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: ResponseHeadersPolicy.SECURITY_HEADERS,
        },
      },
    });

    // CloudFormation resolves the assigned hostname when it creates the distribution.
    new CfnOutput(this, 'DemoWebOrigin', {
      value: `https://${distribution.distributionDomainName}`,
    });
    new CfnOutput(this, 'WebAssetsBucketName', { value: bucket.bucketName });
    new CfnOutput(this, 'WebAssetsBucketRegionalDomain', { value: bucket.bucketRegionalDomainName });
  }
}
