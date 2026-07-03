const axios = require("axios");
const sharp = require("sharp");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const path = require("path");

// Initialize S3-compatible client for DigitalOcean Spaces
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

// Format bytes to human-readable string
function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

async function main(args) {
    try {
        const imageUrl = args.url;
        const maxWidth = args.maxWidth || 1280;
        const quality = args.quality || 80;

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

        // 2. Read original metadata
        const originalMeta = await sharp(originalBuffer).metadata();

        // 3. Resize and convert to WebP
        const optimizedBuffer = await sharp(originalBuffer)
            .resize({
                width: Math.min(originalMeta.width, maxWidth),
                withoutEnlargement: true
            })
            .webp({ quality })
            .toBuffer();

        // 4. Read optimized metadata
        const optimizedMeta = await sharp(optimizedBuffer).metadata();

        // 5. Upload to Spaces
        const originalFilename = path.basename(
            new URL(imageUrl).pathname,
            path.extname(new URL(imageUrl).pathname)
        );
        const optimizedKey = `optimized/${originalFilename}.webp`;

        const spacesClient = createSpacesClient();
        const bucket = process.env.SPACES_BUCKET;

        await spacesClient.send(new PutObjectCommand({
            Bucket: bucket,
            Key: optimizedKey,
            Body: optimizedBuffer,
            ContentType: "image/webp",
            ACL: "public-read"
        }));

        const optimizedUrl = `https://${bucket}.${process.env.SPACES_REGION}.digitaloceanspaces.com/${optimizedKey}`;

        // 6. Return comparison
        return {
            statusCode: 200,
            body: {
                success: true,
                original: {
                    format: originalMeta.format,
                    width: originalMeta.width,
                    height: originalMeta.height,
                    size: originalBuffer.length,
                    sizeFormatted: formatSize(originalBuffer.length)
                },
                optimized: {
                    format: "webp",
                    width: optimizedMeta.width,
                    height: optimizedMeta.height,
                    size: optimizedBuffer.length,
                    sizeFormatted: formatSize(optimizedBuffer.length)
                },
                savings: {
                    bytes: originalBuffer.length - optimizedBuffer.length,
                    percent: ((1 - optimizedBuffer.length / originalBuffer.length) * 100).toFixed(1) + "%"
                },
                url: optimizedUrl
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
