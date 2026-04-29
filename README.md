# Capstone 4 – Multi-Account, Automated & Governed Cloud Platform

> **Week 4 Capstone** · AWS CDK · CodePipeline · Step Functions · Lambda · SSM Parameter Store

---

## Architecture Overview

```
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
```

### Services Used

| Service | Role |
|---|---|
| **AWS CDK (TypeScript)** | Declares all infrastructure as code |
| **AWS CodePipeline** | CI/CD orchestration – triggers on every push to `main` |
| **AWS CodeBuild** | Compiles TypeScript and runs `cdk synth` |
| **AWS Step Functions** | Multi-step workflow with error handling |
| **AWS Lambda** | Serverless compute – retrieves config from SSM |
| **AWS SSM Parameter Store** | Dynamic, centralised configuration storage |
| **Amazon CloudWatch Logs** | Lambda and Step Functions execution logs |

---

## Repository Structure

```
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
```

---

## Step-by-Step Deployment Guide

### Prerequisites

- AWS CLI configured (`aws configure`)
- Node.js 18+ and npm installed
- CDK CLI: `npm install -g aws-cdk`
- CDK bootstrapped in your account/region:
  ```bash
  export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
  export CDK_DEFAULT_REGION=us-east-1
  cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/$CDK_DEFAULT_REGION
  ```

---

### Step 1 – SSM Parameter Store

The SSM parameter is defined directly in the CDK stack (`lib/workflow-stack.ts`):

```typescript
const configParam = new ssm.StringParameter(this, 'AppGreeting', {
  parameterName: '/app/config/greeting',
  stringValue: 'Hello from CI/CD Automated Infrastructure!',
});
```

CDK also grants the Lambda **least-privilege** read access:

```typescript
configParam.grantRead(workflowLambda);
```

This auto-generates an IAM policy allowing only `ssm:GetParameter` on that specific ARN.

---

### Step 2 – Lambda Function

**`lambda/index.js`** uses the AWS SDK to read the parameter at runtime:

```javascript
const AWS = require('aws-sdk');
const ssm = new AWS.SSM();

exports.handler = async (event) => {
    const params = { Name: '/app/config/greeting', WithDecryption: false };
    const result = await ssm.getParameter(params).promise();
    const greeting = result.Parameter.Value;
    console.log("Retrieved from SSM:", greeting);
    return { status: "Success", greeting };
};
```

---

### Step 3 – Step Functions State Machine

The state machine chains three states:

```
PreProcessing (Pass) → InvokeWorkflowTask (Task) → WorkflowSucceeded (Succeed)
                                  └──────── on error ──→ WorkflowFailed (Fail)
```

**Retry config** on the Lambda Task state:

```typescript
invokeTask.addRetry({
  errors: ['Lambda.ServiceException', 'Lambda.AWSLambdaException', 'States.TaskFailed'],
  maxAttempts: 2,
  interval: cdk.Duration.seconds(2),
  backoffRate: 2,
});
```

**Catch** (fallback to Fail state after all retries exhausted):

```typescript
invokeTask.addCatch(failState, {
  errors: ['States.ALL'],
  resultPath: '$.error',
});
```

---

### Step 4 – CI/CD Pipeline Setup

#### 4a. Store your GitHub token in Secrets Manager

```bash
aws secretsmanager create-secret \
  --name github-token \
  --secret-string "ghp_YOUR_PERSONAL_ACCESS_TOKEN"
```

> The token needs **`repo`** scope so CodePipeline can clone your repository.

#### 4b. Update the pipeline stack with your repo details

In `lib/pipeline-stack.ts`, replace:

```typescript
const GITHUB_OWNER = 'YOUR_GITHUB_USERNAME';
const GITHUB_REPO  = 'YOUR_GITHUB_REPO_NAME';
```

#### 4c. Install dependencies and deploy the pipeline

```bash
npm ci
npm run build
cdk deploy Capstone4PipelineStack
```

> After this one-time manual deploy, every subsequent `git push` to `main` triggers the pipeline automatically.

#### 4d. Push your code to GitHub to trigger the pipeline

```bash
git init
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git add .
git commit -m "feat: capstone 4 initial deployment"
git push -u origin main
```

---

### Step 5 – Test the Step Functions Execution

Once the pipeline finishes deploying, manually start an execution:

```bash
aws stepfunctions start-execution \
  --state-machine-arn arn:aws:states:us-east-1:YOUR_ACCOUNT:stateMachine:capstone4-workflow-statemachine \
  --input '{}'
```

Or trigger it from the **AWS Console → Step Functions → capstone4-workflow-statemachine → Start execution**.

---

## Required Screenshots

### 1 – Successful CodePipeline Execution

> Navigate to **AWS Console → CodePipeline → capstone4-cicd-pipeline**

Expected view: all stages (Source, Build, UpdatePipeline, Deploy) showing **Succeeded** in green.

📸 _[Insert screenshot here]_

---

### 2 – Step Functions Visual Graph (Successful Execution)

> Navigate to **Step Functions → capstone4-workflow-statemachine → Executions → [latest]**

Expected view: the execution graph with all states highlighted green:
- `PreProcessing` → green
- `InvokeWorkflowTask` → green
- `WorkflowSucceeded` → green

📸 _[Insert screenshot here]_

---

### 3 – CloudWatch Logs: Lambda Retrieving SSM Value

> Navigate to **CloudWatch → Log Groups → /aws/lambda/capstone4-workflow-task → [latest log stream]**

Expected log output:

```
Lambda triggered with event: {}
Retrieved from SSM: Hello from CI/CD Automated Infrastructure!
```

📸 _[Insert screenshot here]_

---

## Key IAM Permissions

The CDK stack auto-generates minimal IAM policies:

| Principal | Permission | Resource |
|---|---|---|
| Lambda execution role | `ssm:GetParameter` | `/app/config/greeting` ARN only |
| Step Functions execution role | `lambda:InvokeFunction` | `capstone4-workflow-task` only |
| CodeBuild service role | `sts:AssumeRole` | CDK deploy roles |

---

## Cleanup

To tear down all resources and avoid ongoing charges:

```bash
# Destroy the application stack
cdk destroy WorkflowStack

# Destroy the pipeline stack
cdk destroy Capstone4PipelineStack

# Remove the GitHub token secret
aws secretsmanager delete-secret --secret-id github-token --force-delete-without-recovery
```

---

## Lessons Learned

- **CDK Pipelines** self-mutate — after the first deploy the pipeline updates itself from code changes.
- **Step Functions retries** are defined per-error type, allowing fine-grained resilience without code changes.
- **SSM Parameter Store** decouples configuration from code; updating a parameter value requires no Lambda redeployment.
- **`grantRead()`** in CDK auto-generates least-privilege IAM policies, reducing manual policy management.
