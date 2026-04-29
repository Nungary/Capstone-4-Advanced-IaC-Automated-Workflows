import * as cdk from 'aws-cdk-lib';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { WorkflowStack } from './workflow-stack';
import { Construct } from 'constructs';

/**
 * CDK Pipeline Stack
 * Connects to GitHub and auto-deploys WorkflowStack on every push to `main`.
 *
 * Prerequisites:
 *   1. Create a GitHub personal access token (PAT) with repo scope.
 *   2. Store it in AWS Secrets Manager under the name: github-token
 *      aws secretsmanager create-secret \
 *        --name github-token \
 *        --secret-string "ghp_YOUR_TOKEN_HERE"
 */
export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── Source: GitHub via CodeStar Connection ────────────────────────────────
    // Replace these two values with your own GitHub username and repo name.
    const GITHUB_OWNER = 'YOUR_GITHUB_USERNAME';
    const GITHUB_REPO  = 'YOUR_GITHUB_REPO_NAME';

    const pipeline = new pipelines.CodePipeline(this, 'Capstone4Pipeline', {
      pipelineName: 'capstone4-cicd-pipeline',

      // Synth step: install deps → build CDK app → cdk synth
      synth: new pipelines.ShellStep('Synth', {
        input: pipelines.CodePipelineSource.gitHub(
          `${GITHUB_OWNER}/${GITHUB_REPO}`,
          'main',
          {
            authentication: cdk.SecretValue.secretsManager('github-token'),
          }
        ),
        commands: [
          'npm ci',           // install root CDK deps
          'npm run build',    // compile TypeScript
          'npx cdk synth',    // synthesise CloudFormation
        ],
      }),

      // Enable Docker for asset bundling (Lambda zip)
      dockerEnabledForSynth: true,
    });

    // ── Deploy Stage: WorkflowStack ──────────────────────────────────────────
    pipeline.addStage(
      new WorkflowDeployStage(this, 'Deploy', {
        env: {
          account: process.env.CDK_DEFAULT_ACCOUNT,
          region:  process.env.CDK_DEFAULT_REGION,
        },
      })
    );
  }
}

/** Thin CDK Stage wrapper that instantiates WorkflowStack */
class WorkflowDeployStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);
    new WorkflowStack(this, 'WorkflowStack');
  }
}
