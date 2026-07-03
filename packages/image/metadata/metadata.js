const axios = require("axios");
const sharp = require("sharp");

async function main(args) {
    try {
        const imageUrl = args.url;

        if (!imageUrl) {
            return {
                statusCode: 400,
                body: {
                    success: false,
                    error: "Missing 'url' parameter"
                }
            };
        }

        // Download image
        const response = await axios.get(imageUrl, {
            responseType: "arraybuffer"
        });

        const buffer = Buffer.from(response.data);

        // Read metadata
        const metadata = await sharp(buffer).metadata();

        return {
            statusCode: 200,
            body: {
                success: true,
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
