const axios = require("axios");
const sharp = require("sharp");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const path = require("path");

function createSpacesClient() {
    return new S3Client({
        endpoint: `https://${process.env.SPACES_REGION}.digitaloceanspaces.com`,
        region: process.env.SPACES_REGION,
        credentials: {
            accessKeyId: process.env.SPACES_KEY,
            secretAccessKey: process.env.SPACES_SECRET
        }
    });
}

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

        // 1. Download original image
        const response = await axios.get(imageUrl, {
            responseType: "arraybuffer"
        });

        const originalBuffer = Buffer.from(response.data);

        // 2. Resolve original filename
        const originalFilename = path.basename(
            new URL(imageUrl).pathname,
            path.extname(new URL(imageUrl).pathname)
        );

        const spacesClient = createSpacesClient();
        const bucket = process.env.SPACES_BUCKET;
        const region = process.env.SPACES_REGION;

        const sizes = [
            { name: "300", width: 300, height: 300 },
            { name: "150", width: 150, height: 150 },
            { name: "64", width: 64, height: 64 }
        ];

        const results = {};

        // 3. Generate and upload thumbnails
        for (const size of sizes) {
            const thumbnailBuffer = await sharp(originalBuffer)
                .resize({
                    width: size.width,
                    height: size.height,
                    fit: "cover",
                    withoutEnlargement: true
                })
                .webp({ quality: 75 })
                .toBuffer();

            const key = `thumbnails/${originalFilename}_${size.name}.webp`;

            await spacesClient.send(new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: thumbnailBuffer,
                ContentType: "image/webp",
                ACL: "public-read"
            }));

            results[size.name] = `https://${bucket}.${region}.digitaloceanspaces.com/${key}`;
        }

        return {
            statusCode: 200,
            body: {
                success: true,
                originalFilename,
                thumbnails: results
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
