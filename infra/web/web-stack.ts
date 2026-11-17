import { CfnOutput, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { Distribution, ResponseHeadersPolicy, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { BlockPublicAccess, Bucket, BucketEncryption, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

export class DemoWebStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    // CloudFront reads objects from the S3 API. The bucket blocks public access.
    const bucket = new Bucket(this, 'WebAssets', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // OAC signs CloudFront's requests and grants read access to this distribution.
    // CDK uses the assigned CloudFront hostname and its default certificate.
    const distribution = new Distribution(this, 'WebDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: ResponseHeadersPolicy.SECURITY_HEADERS,
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
