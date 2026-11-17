import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { CachePolicy, OriginRequestPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { test } from 'node:test';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { DemoWebStack } from './web-stack.ts';

// Inspect the synthesized CloudFormation template without contacting AWS.
const template = Template.fromStack(new DemoWebStack(new App(), 'TestWeb', {
  apiOrigin: 'https://example.execute-api.ap-southeast-2.amazonaws.com',
}));

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

test('API requests retain methods and authentication without caching or SPA error fallback', () => {
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: {
      CustomErrorResponses: Match.absent(),
      CacheBehaviors: [Match.objectLike({
        PathPattern: '/api/*',
        AllowedMethods: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'POST', 'DELETE'],
        CachePolicyId: CachePolicy.CACHING_DISABLED.cachePolicyId,
        OriginRequestPolicyId: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER.originRequestPolicyId,
        ViewerProtocolPolicy: 'https-only',
        FunctionAssociations: Match.absent(),
      })],
      Origins: Match.arrayWith([Match.objectLike({
        DomainName: 'example.execute-api.ap-southeast-2.amazonaws.com',
        OriginPath: Match.absent(),
        CustomOriginConfig: Match.objectLike({ OriginProtocolPolicy: 'https-only' }),
      })]),
    },
  });
});

test('browser routes serve the shell while preserving OAuth query parameters and missing assets', () => {
  const functions = template.findResources('AWS::CloudFront::Function');
  const code = Object.values(functions)[0].Properties.FunctionCode;
  // Execute the actual synthesized edge function with representative CloudFront requests.
  for (const uri of ['/', '/auth/callback', '/organisations/synthetic']) {
    const request = { uri, querystring: { code: { value: 'synthetic' }, state: { value: 'fixture' } } };
    const result = runInNewContext(`${code}; handler(event)`, { event: { request } });
    assert.equal(result.uri, '/index.html');
    assert.equal(result.querystring, request.querystring);
  }
  for (const uri of ['/assets/missing.js', '/missing', '/api/me']) {
    const result = runInNewContext(`${code}; handler(event)`, { event: { request: { uri } } });
    assert.equal(result.uri, uri);
  }
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: {
      DefaultCacheBehavior: {
        CachePolicyId: CachePolicy.CACHING_DISABLED.cachePolicyId,
        FunctionAssociations: [Match.objectLike({ EventType: 'viewer-request' })],
      },
    },
  });
});

test('rejects API origins that would alter the forwarding contract', () => {
  for (const apiOrigin of ['http://example.com', 'https://example.com/api', 'https://user:pass@example.com',
    'https://example.com?query=1', 'https://example.com#fragment', 'https://example.com:8443']) {
    assert.throws(() => new DemoWebStack(new App(), 'InvalidWeb', { apiOrigin }), /HTTPS origin/);
  }
});
