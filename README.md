Capstone 4 – Multi-Account, Automated & Governed Cloud Platform

Week 4 Capstone · AWS CDK · CodePipeline · Step Functions · Lambda · SSM Parameter Store


Architecture Overview
GitHub (main branch)
        │  push
        ▼
┌─────────────────────────────────────────┐
│         AWS CodePipeline                │
│  Source → Build (CodeBuild) → Deploy    │
└────────────────────┬────────────────────┘
                     │ cdk deploy
                     ▼
┌─────────────────────────────────────────┐
│           WorkflowStack                 │
│                                         │
│  SSM Parameter Store                    │
│  /app/config/greeting  ←──────────┐    │
│                                   │    │
│  Step Functions State Machine     │    │
│  ┌─────────────────────────────┐  │    │
│  │  PreProcessing (Pass)       │  │    │
│  │        │                    │  │    │
│  │  InvokeWorkflowTask (Task) ─┼──┘    │
│  │    └─ Retry (×2)           │        │
│  │    └─ Catch → WorkflowFail │        │
│  │        │                   │        │
│  │  WorkflowSucceeded (Succeed)│        │
│  └─────────────────────────────┘        │
│                                         │
│  Lambda: capstone4-workflow-task        │
│  (Node.js 18 · reads SSM at runtime)   │
└─────────────────────────────────────────┘

Services Used
ServiceRoleAWS CDK (TypeScript)Declares all infrastructure as codeAWS CodePipelineCI/CD orchestration – triggers on every push to mainAWS CodeBuildCompiles TypeScript and runs cdk synthAWS Step FunctionsMulti-step workflow with error handlingAWS LambdaServerless compute – retrieves config from SSMAWS SSM Parameter StoreDynamic, centralised configuration storageAmazon CloudWatch LogsLambda and Step Functions execution logs

Repository Structure
capstone4/
├── bin/
│   └── app.ts                    # CDK entry point
├── lib/
│   ├── pipeline-stack.ts         # CDK Pipeline (CI/CD)
│   └── workflow-stack.ts         # SSM + Lambda + Step Functions
├── lambda/
│   └── index.js                  # Lambda handler (Node.js 18)
├── statemachine/
│   └── workflow.asl.json         # State machine definition (ASL)
├── cdk.json
├── package.json
├── tsconfig.json
└── README.md

Step-by-Step Deployment Guide
Prerequisites

AWS CLI configured (aws configure)
Node.js 18+ and npm installed
CDK CLI: npm install -g aws-cdk
CDK bootstrapped in your account/region:

bash  export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
  export CDK_DEFAULT_REGION=us-east-1
  cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/$CDK_DEFAULT_REGION

Step 1 – SSM Parameter Store
The SSM parameter is defined directly in the CDK stack (lib/workflow-stack.ts):
typescriptconst configParam = new ssm.StringParameter(this, 'AppGreeting', {
  parameterName: '/app/config/greeting',
  stringValue: 'Hello from CI/CD Automated Infrastructure!',
});
CDK also grants the Lambda least-privilege read access:
typescriptconfigParam.grantRead(workflowLambda);
This auto-generates an IAM policy allowing only ssm:GetParameter on that specific ARN.

Step 2 – Lambda Function
lambda/index.js uses the AWS SDK to read the parameter at runtime:
javascriptconst AWS = require('aws-sdk');
const ssm = new AWS.SSM();

exports.handler = async (event) => {
    const params = { Name: '/app/config/greeting', WithDecryption: false };
    const result = await ssm.getParameter(params).promise();
    const greeting = result.Parameter.Value;
    console.log("Retrieved from SSM:", greeting);
    return { status: "Success", greeting };
};

Step 3 – Step Functions State Machine
The state machine chains three states:
PreProcessing (Pass) → InvokeWorkflowTask (Task) → WorkflowSucceeded (Succeed)
                                  └──────── on error ──→ WorkflowFailed (Fail)
Retry config on the Lambda Task state:
typescriptinvokeTask.addRetry({
  errors: ['Lambda.ServiceException', 'Lambda.AWSLambdaException', 'States.TaskFailed'],
  maxAttempts: 2,
  interval: cdk.Duration.seconds(2),
  backoffRate: 2,
});
Catch (fallback to Fail state after all retries exhausted):
typescriptinvokeTask.addCatch(failState, {
  errors: ['States.ALL'],
  resultPath: '$.error',
});

Step 4 – CI/CD Pipeline Setup
4a. Store your GitHub token in Secrets Manager
bashaws secretsmanager create-secret \
  --name github-token \
  --secret-string "ghp_YOUR_PERSONAL_ACCESS_TOKEN"

The token needs repo scope so CodePipeline can clone your repository.

4b. Update the pipeline stack with your repo details
In lib/pipeline-stack.ts, replace:
typescriptconst GITHUB_OWNER = 'YOUR_GITHUB_USERNAME';
const GITHUB_REPO  = 'YOUR_GITHUB_REPO_NAME';
4c. Install dependencies and deploy the pipeline
bashnpm ci
npm run build
cdk deploy Capstone4PipelineStack

After this one-time manual deploy, every subsequent git push to main triggers the pipeline automatically.

4d. Push your code to GitHub to trigger the pipeline
bashgit init
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git add .
git commit -m "feat: capstone 4 initial deployment"
git push -u origin main

Step 5 – Test the Step Functions Execution
Once the pipeline finishes deploying, manually start an execution:

trigger it from the AWS Console → Step Functions → capstone4-workflow-statemachine → Start execution.

Screenshots
1 – CodePipeline Execution
Pipeline created and connected to GitHub. Source stage succeeded. Build stage failed due to an AWS account-level AccountLimitExceededException (CodeBuild quota) — not a code issue. WorkflowStack was deployed successfully via cdk deploy --all as a workaround.
<img width="1568" height="538" alt="image" src="https://github.com/user-attachments/assets/46d06e3c-9677-4058-934d-36d185f5120f" />

<img width="1568" height="687" alt="image" src="https://github.com/user-attachments/assets/e3cdbf80-cb4f-4a2d-9c87-3c9372612883" />

<img width="1568" height="780" alt="image" src="https://github.com/user-attachments/assets/3f676b80-6c84-4d6f-b8ce-bf89fac3f6c4" />


2 – Step Functions Execution (Succeeded)
State machine executed successfully in 0.825s. All active states completed green. WorkflowFailed is the unused Catch error path — it was never triggered.

<img width="1568" height="537" alt="image" src="https://github.com/user-attachments/assets/51da6987-16f6-4aeb-b162-1b1c8718977a" />

<img width="1568" height="782" alt="image" src="https://github.com/user-attachments/assets/4648a7a4-63bb-4925-89ea-0ce1540ebdb9" />

<img width="1075" height="728" alt="image" src="https://github.com/user-attachments/assets/ef10d327-bb06-46f2-aee3-60921572e45f" />



3 – CloudWatch Logs: SSM Parameter Retrieved
Lambda successfully retrieved the value from SSM Parameter Store at runtime.

<img width="1558" height="784" alt="image" src="https://github.com/user-attachments/assets/e86fc417-1137-49ae-9287-a1d3a1f1aa46" />

Key IAM Permissions
The CDK stack auto-generates minimal IAM policies:
PrincipalPermissionResourceLambda execution rolessm:GetParameter/app/config/greeting ARN onlyStep Functions execution rolelambda:InvokeFunctioncapstone4-workflow-task onlyCodeBuild service rolests:AssumeRoleCDK deploy roles

Cleanup
To tear down all resources and avoid ongoing charges:
bash# Destroy the application stack
cdk destroy WorkflowStack

# Destroy the pipeline stack
cdk destroy Capstone4PipelineStack

# Remove the GitHub token secret
aws secretsmanager delete-secret --secret-id github-token --force-delete-without-recovery

Lessons Learned

CDK Pipelines self-mutate — after the first deploy the pipeline updates itself from code changes.
Step Functions retries are defined per-error type, allowing fine-grained resilience without code changes.
SSM Parameter Store decouples configuration from code; updating a parameter value requires no Lambda redeployment.
grantRead() in CDK auto-generates least-privilege IAM policies, reducing manual policy management.
