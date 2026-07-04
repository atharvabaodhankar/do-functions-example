const axios = require("axios");
const sharp = require("sharp");
const { PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const path = require("path");
const { s3Client } = require("./lib/spaces");
const { send } = require("./lib/response");

async function main(args) {
  try {
    const key = args.key;
    const imageUrl = args.url;

    let originalBuffer;

    if (key) {
      const getObjectRes = await s3Client.send(new GetObjectCommand({
        Bucket: process.env.SPACES_BUCKET,
        Key: key
      }));

      const streamToBuffer = (stream) =>
        new Promise((resolve, reject) => {
          const chunks = [];
          stream.on("data", (chunk) => chunks.push(chunk));
          stream.on("error", reject);
          stream.on("end", () => resolve(Buffer.concat(chunks)));
        });

      originalBuffer = await streamToBuffer(getObjectRes.Body);
    } else if (imageUrl) {
      const response = await axios.get(imageUrl, { responseType: "arraybuffer" });
      originalBuffer = Buffer.from(response.data);
    } else {
      return send(400, { success: false, error: "Missing 'key' or 'url' parameter" });
    }

    const pathSource = key ? key : (imageUrl ? new URL(imageUrl).pathname : "image");
    const originalFilename = path.basename(
      pathSource,
      path.extname(pathSource)
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



