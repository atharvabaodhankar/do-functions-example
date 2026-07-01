function main(args) {
    return {
        statusCode: 200,
        headers: {
            "Content-Type": "application/json"
        },
        body: {
            service: "Image Optimizer",
            version: "1.0.0",
            language: "Node.js",
            runtime: "DigitalOcean Functions",
            uptime: "Serverless",
            status: "Ready",
            author: "Atharva",
            timestamp: new Date().toISOString()
        }
    };
}

exports.main = main;