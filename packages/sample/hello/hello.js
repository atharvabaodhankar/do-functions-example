const sharp = require("sharp");

async function main(args) {
    try {
        // Create a simple 200x200 red image in memory
        const image = sharp({
            create: {
                width: 200,
                height: 200,
                channels: 3,
                background: {
                    r: 255,
                    g: 0,
                    b: 0
                }
            }
        });

        const metadata = await image.metadata();

        return {
            statusCode: 200,
            body: {
                success: true,
                message: "Sharp is working! 🚀",
                metadata
            }
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: {
                success: false,
                error: error.message
            }
        };
    }
}

exports.main = main;