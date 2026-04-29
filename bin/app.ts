#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PipelineStack } from '../lib/pipeline-stack';

const app = new cdk.App();

new PipelineStack(app, 'Capstone4PipelineStack', {
  /**
   * CDK requires an explicit account + region for the pipeline stack itself.
   * Set these as environment variables before deploying:
   *   export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
   *   export CDK_DEFAULT_REGION=us-east-1
   */
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region:  process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  description: 'Capstone 4 – CI/CD pipeline deploying serverless workflow',
});
