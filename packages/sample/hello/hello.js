function main(args) {

    return {
        statusCode: 200,
        body: {
            project: "Cloud Image Optimizer",
            author: "Atharva",
            message: "My first DigitalOcean Function 🚀",
            timestamp: new Date().toISOString()
        }
    };

}

exports.main = main;