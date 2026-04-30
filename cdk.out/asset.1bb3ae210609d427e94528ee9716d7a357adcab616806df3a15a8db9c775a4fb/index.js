const AWS = require('aws-sdk');
const ssm = new AWS.SSM();

exports.handler = async (event) => {
    console.log("Lambda triggered with event:", JSON.stringify(event, null, 2));

    // Retrieve value from SSM Parameter Store
    const params = {
        Name: '/app/config/greeting',
        WithDecryption: false
    };

    try {
        const result = await ssm.getParameter(params).promise();
        const greeting = result.Parameter.Value;

        console.log("Retrieved from SSM:", greeting);

        return {
            status: "Success",
            greeting: greeting,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error("Error retrieving SSM parameter:", error);
        throw error; // Re-throw so Step Functions can handle retries/catch
    }
};
