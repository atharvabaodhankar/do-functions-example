function main(args) {
    const name = args.name || "Guest";
    const project = args.project || "Image Optimizer";

    return {
        statusCode: 200,
        headers: {
            "Content-Type": "application/json"
        },
        body: {
            message: `Hello, ${name}! 👋`,
            project: project,
            runtime: "DigitalOcean Functions",
            status: "Ready",
            timestamp: new Date().toISOString()
        }
    };
}

exports.main = main;