#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { SampleCdkStack } from '../lib/sample-cdk-stack';
import { Route53Stack } from '../lib/route53-stack';
import { Region, AvailabilityZone } from '../lib/constant';

const app = new cdk.App();

{
  const region = Region.AP_NORTHEAST_1;
  const az = AvailabilityZone.AP_NORTHEAST_1A;

  const route53Stack = new Route53Stack(app, 'Route53Stack', { customProps: {} });
  const sampleCdkStack = new SampleCdkStack(app, 'SampleCdkStack', {
  customProps: {
      hostedZone: route53Stack.CustomOutProps.hostedZone,
      region,
      availabilityZone: az,
    }
  });
}
