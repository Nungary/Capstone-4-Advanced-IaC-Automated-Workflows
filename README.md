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
│  │  InvokeWorkflowTask (Task) ─┼──┘    │
│  │    └─ Retry (×2)           │        │
│  │    └─ Catch → WorkflowFail │        │
│  │  WorkflowSucceeded (Succeed)│        │
│  └─────────────────────────────┘        │
│                                         │
│  Lambda: capstone4-workflow-task        │
│  (Node.js 18 · reads SSM at runtime)   │
└─────────────────────────────────────────┘
```

---

## Services Used

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
├── cdk.json
├── package.json
├── tsconfig.json
└── README.md
```

---

## Deployment Guide

### Prerequisites
- AWS CLI configured (`aws configure`)
- Node.js 18+ and npm installed
- CDK CLI: `npm install -g aws-cdk`
- CDK bootstrapped:
```bash
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export CDK_DEFAULT_REGION=us-east-1
cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/$CDK_DEFAULT_REGION
```

### Step 1 – SSM Parameter Store
Defined in CDK — grants Lambda least-privilege read access automatically:
```typescript
const configParam = new ssm.StringParameter(this, 'AppGreeting', {
  parameterName: '/app/config/greeting',
  stringValue: 'Hello from CI/CD Automated Infrastructure!',
});
configParam.grantRead(workflowLambda);
```

### Step 2 – Lambda Function
Reads SSM parameter at runtime using AWS SDK v3:
```javascript
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const client = new SSMClient({ region: process.env.AWS_REGION });

exports.handler = async (event) => {
    const result = await client.send(new GetParameterCommand({ Name: '/app/config/greeting' }));
    console.log("Retrieved from SSM:", result.Parameter.Value);
    return { status: "Success", greeting: result.Parameter.Value };
};
```

### Step 3 – Step Functions State Machine
```
PreProcessing (Pass) → InvokeWorkflowTask (Task) → WorkflowSucceeded
                               └── on error ──→ WorkflowFailed (Fail)
```
Retry + Catch configured on the Lambda task for resilience.

### Step 4 – CI/CD Pipeline
```bash
aws secretsmanager create-secret --name github-token --secret-string "ghp_YOUR_TOKEN"
npm ci && npm run build
cdk deploy Capstone4PipelineStack
```
Every subsequent `git push` to `main` triggers the pipeline automatically.

---

## Screenshots

### 1 – CodePipeline Execution

Pipeline created and connected to GitHub. Source stage succeeded. Build stage failed due to an AWS account-level `AccountLimitExceededException` (CodeBuild quota) — not a code issue. WorkflowStack was deployed successfully via `cdk deploy --all` as a workaround.

<img width="1568" alt="CodePipeline Overview" src="https://github.com/user-attachments/assets/46d06e3c-9677-4058-934d-36d185f5120f" />

<img width="1568" alt="CDK Pipeline Deploy Terminal" src="https://github.com/user-attachments/assets/e3cdbf80-cb4f-4a2d-9c87-3c9372612883" />

<img width="1568" alt="CDK Bootstrap Terminal" src="https://github.com/user-attachments/assets/3f676b80-6c84-4d6f-b8ce-bf89fac3f6c4" />

---

### 2 – Step Functions Execution (Succeeded)

State machine executed successfully in 0.825s. All active states completed green. `WorkflowFailed` is the unused Catch error path — it was never triggered.

<img width="1568" alt="Step Functions Execution Details" src="https://github.com/user-attachments/assets/51da6987-16f6-4aeb-b162-1b1c8718977a" />

<img width="1568" alt="Step Functions Graph" src="https://github.com/user-attachments/assets/4648a7a4-63bb-4925-89ea-0ce1540ebdb9" />

<img width="1075" alt="Workflow Deploy Terminal" src="https://github.com/user-attachments/assets/ef10d327-bb06-46f2-aee3-60921572e45f" />

---

### 3 – CloudWatch Logs: SSM Parameter Retrieved

Lambda successfully retrieved the value from SSM Parameter Store at runtime.

<img width="1558" alt="CloudWatch Logs SSM" src="https://github.com/user-attachments/assets/e86fc417-1137-49ae-9287-a1d3a1f1aa46" />

---

## Key IAM Permissions

| Principal | Permission | Resource |
|---|---|---|
| Lambda execution role | `ssm:GetParameter` | `/app/config/greeting` ARN only |
| Step Functions role | `lambda:InvokeFunction` | `capstone4-workflow-task` only |
| CodeBuild service role | `sts:AssumeRole` | CDK deploy roles |

---

## Cleanup

```bash
cdk destroy Capstone4PipelineStack
aws secretsmanager delete-secret --secret-id github-token --force-delete-without-recovery
```

---

## Lessons Learned

- **CDK Pipelines** self-mutate after the first deploy the pipeline updates itself from code changes.
- **Step Functions retries** are defined per-error type, allowing fine-grained resilience without code changes.
- **SSM Parameter Store** decouples config from code — no Lambda redeployment needed to change a value.
- **`grantRead()`** in CDK auto-generates least-privilege IAM policies, reducing manual policy management.
