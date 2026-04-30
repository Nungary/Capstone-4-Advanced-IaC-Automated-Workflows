const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');

const client = new SSMClient({ region: process.env.AWS_REGION });

exports.handler = async (event) => {
    console.log("Lambda triggered with event:", JSON.stringify(event, null, 2));

    const command = new GetParameterCommand({
        Name: '/app/config/greeting',
        WithDecryption: false
    });

    try {
        const result = await client.send(command);
        const greeting = result.Parameter.Value;

        console.log("Retrieved from SSM:", greeting);

        return {
            status: "Success",
            greeting: greeting,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error("Error retrieving SSM parameter:", error);
        throw error;
    }
};