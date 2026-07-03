const axios = require("axios");
const sharp = require("sharp");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const path = require("path");
const { s3Client } = require("./lib/spaces");
const { send } = require("./lib/response");

async function main(args) {
  try {
    const imageUrl = args.url;

    if (!imageUrl) {
      return send(400, { success: false, error: "Missing 'url' parameter" });
    }

    const response = await axios.get(imageUrl, { responseType: "arraybuffer" });
    const originalBuffer = Buffer.from(response.data);

    const originalFilename = path.basename(
      new URL(imageUrl).pathname,
      path.extname(new URL(imageUrl).pathname)
    );

    const bucket = process.env.SPACES_BUCKET;
    const region = process.env.SPACES_REGION;

    const sizes = [
      { name: "300", width: 300, height: 300 },
      { name: "150", width: 150, height: 150 },
      { name: "64", width: 64, height: 64 }
    ];

    const results = {};

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

      await s3Client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: thumbnailBuffer,
        ContentType: "image/webp",
        ACL: "public-read"
      }));

      results[size.name] = `https://${bucket}.${region}.digitaloceanspaces.com/${key}`;
    }

    return send(200, {
      success: true,
      originalFilename,
      thumbnails: results
    });
  } catch (error) {
    return send(500, { success: false, error: error.message || String(error) });
  }
}

exports.main = main;

