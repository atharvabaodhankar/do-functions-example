async function main() {
    return {
        statusCode: 200,
        body: {
            status: "ok",
            timestamp: new Date().toISOString(),
            runtime: "nodejs:22",
            service: "image-optimizer"
        }
    };
}

exports.main = main;
