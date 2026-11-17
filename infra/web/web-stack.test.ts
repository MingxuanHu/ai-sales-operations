import assert from 'node:assert/strict';
import { test } from 'node:test';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { DemoWebStack } from './web-stack.ts';

// Inspect the synthesized CloudFormation template without contacting AWS.
const template = Template.fromStack(new DemoWebStack(new App(), 'TestWeb', {}));

test('the origin bucket blocks public access and grants reads to the distribution', () => {
  template.hasResourceProperties('AWS::S3::Bucket', {
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
    WebsiteConfiguration: Match.absent(),
  });
  const distributionId = template.getResourceId('AWS::CloudFront::Distribution');
  template.hasResourceProperties('AWS::S3::BucketPolicy', {
    PolicyDocument: {
      Statement: Match.arrayWith([Match.objectLike({
        Action: 's3:GetObject',
        Effect: 'Allow',
        Principal: { Service: 'cloudfront.amazonaws.com' },
        Condition: {
          StringEquals: {
            'AWS:SourceArn': {
              'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':cloudfront::',
                { Ref: 'AWS::AccountId' }, ':distribution/', { Ref: distributionId }]],
            },
          },
        },
      })]),
    },
  });
});

test('CloudFront uses signed origin requests and exposes its HTTPS origin', () => {
  const accessControlId = template.getResourceId('AWS::CloudFront::OriginAccessControl', {
    Properties: {
      OriginAccessControlConfig: {
        OriginAccessControlOriginType: 's3',
        SigningBehavior: 'always',
        SigningProtocol: 'sigv4',
      },
    },
  });
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: {
      Aliases: Match.absent(),
      DefaultRootObject: 'index.html',
      DefaultCacheBehavior: { ViewerProtocolPolicy: 'redirect-to-https' },
      Origins: Match.arrayWith([Match.objectLike({ OriginAccessControlId: { 'Fn::GetAtt': [accessControlId, 'Id'] } })]),
    },
  });
  const distributionId = template.getResourceId('AWS::CloudFront::Distribution');
  assert.deepEqual(template.findOutputs('DemoWebOrigin').DemoWebOrigin.Value, {
    'Fn::Join': ['', ['https://', { 'Fn::GetAtt': [distributionId, 'DomainName'] }]],
  });
});
