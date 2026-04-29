import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export class WorkflowStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── Step 1: SSM Parameter ───────────────────────────────────────────────
    const configParam = new ssm.StringParameter(this, 'AppGreeting', {
      parameterName: '/app/config/greeting',
      stringValue: 'Hello from CI/CD Automated Infrastructure!',
      description: 'Greeting message retrieved dynamically by Lambda',
    });

    // ─── Step 2: Lambda Function ─────────────────────────────────────────────
    const workflowLambda = new lambda.Function(this, 'WorkflowTaskFunction', {
      functionName: 'capstone4-workflow-task',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda'),
      timeout: cdk.Duration.seconds(30),
      description: 'Retrieves greeting from SSM Parameter Store',
      environment: {
        SSM_PARAM_NAME: configParam.parameterName,
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // Grant Lambda permission to read the SSM parameter
    configParam.grantRead(workflowLambda);

    // ─── Step 3: Step Functions State Machine ─────────────────────────────────

    // State 1: Pass state (simulates pre-processing / input validation)
    const passState = new stepfunctions.Pass(this, 'PreProcessing', {
      comment: 'Initialise workflow and pass input downstream',
      result: stepfunctions.Result.fromObject({
        stage: 'pre-processing',
        ready: true,
      }),
      resultPath: '$.preProcess',
    });

    // State 2: Task state - invokes Lambda with retry + catch
    const invokeTask = new tasks.LambdaInvoke(this, 'InvokeWorkflowTask', {
      lambdaFunction: workflowLambda,
      comment: 'Invoke Lambda to fetch SSM greeting',
      outputPath: '$.Payload',
    });

    // Retry on Lambda service exceptions (up to 2 retries, 2s backoff)
    invokeTask.addRetry({
      errors: ['Lambda.ServiceException', 'Lambda.AWSLambdaException', 'States.TaskFailed'],
      maxAttempts: 2,
      interval: cdk.Duration.seconds(2),
      backoffRate: 2,
    });

    // Catch any unhandled errors and route to a Fail state
    const failState = new stepfunctions.Fail(this, 'WorkflowFailed', {
      cause: 'Lambda invocation failed after retries',
      error: 'WorkflowError',
    });

    invokeTask.addCatch(failState, {
      errors: ['States.ALL'],
      resultPath: '$.error',
    });

    // Success terminal state
    const successState = new stepfunctions.Succeed(this, 'WorkflowSucceeded', {
      comment: 'Workflow completed successfully',
    });

    // Chain: Pass → LambdaInvoke → Succeed
    const definition = passState.next(invokeTask).next(successState);

    // Log group for Step Functions execution history
    const sfnLogGroup = new logs.LogGroup(this, 'StateMachineLogs', {
      logGroupName: '/aws/states/capstone4-workflow',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new stepfunctions.StateMachine(this, 'Capstone4StateMachine', {
      stateMachineName: 'capstone4-workflow-statemachine',
      definition,
      timeout: cdk.Duration.minutes(5),
      logs: {
        destination: sfnLogGroup,
        level: stepfunctions.LogLevel.ALL,
      },
      tracingEnabled: true,
    });

    // ─── Outputs ─────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'LambdaFunctionName', {
      value: workflowLambda.functionName,
      description: 'Lambda function name',
    });

    new cdk.CfnOutput(this, 'SSMParameterName', {
      value: configParam.parameterName,
      description: 'SSM Parameter storing the greeting',
    });
  }
}
