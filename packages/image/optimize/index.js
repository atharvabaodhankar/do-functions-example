const axios = require("axios");
const sharp = require("sharp");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const path = require("path");
const prisma = require("./lib/db/prisma");
const { s3Client } = require("./lib/spaces");
const { send } = require("./lib/response");

function getPublicUrl(key) {
  const bucket = process.env.SPACES_BUCKET;
  const region = process.env.SPACES_REGION;
  return `https://${bucket}.${region}.digitaloceanspaces.com/${key}`;
}

async function main(args) {
  const { imageId, jobId } = args;

  if (!imageId || !jobId) {
    return send(400, { success: false, error: "Missing imageId or jobId" });
  }

  try {
    // 1. Update status to PROCESSING
    await prisma.processingJob.update({
      where: { id: jobId },
      data: { status: "PROCESSING" }
    });

    await prisma.image.update({
      where: { id: imageId },
      data: { status: "PROCESSING" }
    });

    // 2. Fetch image record
    const image = await prisma.image.findUnique({ where: { id: imageId } });
    if (!image) throw new Error("Image record not found");

    const originalUrl = getPublicUrl(image.originalKey);

    // 3. Download image buffer
    const downloadRes = await axios.get(originalUrl, { responseType: "arraybuffer" });
    const buffer = Buffer.from(downloadRes.data);

    // 4. Extract metadata & resize using Sharp
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width;
    const height = metadata.height;

    const maxWidth = 1280;
    const optimizedBuffer = await sharp(buffer)
      .resize({
        width: Math.min(width, maxWidth),
        withoutEnlargement: true
      })
      .webp({ quality: 80 })
      .toBuffer();

    const optimizedMeta = await sharp(optimizedBuffer).metadata();

    // 5. Upload Optimized WebP to Spaces
    const originalFilename = path.basename(
      image.originalKey,
      path.extname(image.originalKey)
    );
    const optimizedKey = `optimized/${originalFilename}.webp`;
    
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.SPACES_BUCKET,
      Key: optimizedKey,
      Body: optimizedBuffer,
      ContentType: "image/webp",
      ACL: "public-read"
    }));

    // 6. Invoke Thumbnail Function
    const functionBaseUrl = process.env.FUNCTION_BASE_URL || `https://faas-blr1-8177d592.doserverless.co/api/v1/web/fn-f72bafd1-18fd-4e5b-9d68-721b5dc7cae6/image`;
    
    const thumbnailRes = await axios.post(`${functionBaseUrl}/thumbnail.json`, {
      url: originalUrl
    });

    if (!thumbnailRes.data || !thumbnailRes.data.success) {
      throw new Error(`Thumbnail generation failed: ${thumbnailRes.data?.error || "Unknown error"}`);
    }

    const thumbnail300Url = thumbnailRes.data.thumbnails["300"];
    const thumbnailKey = thumbnail300Url.replace(
      `https://${process.env.SPACES_BUCKET}.${process.env.SPACES_REGION}.digitaloceanspaces.com/`,
      ""
    );

    // 7. Update Database with details
    await prisma.image.update({
      where: { id: imageId },
      data: {
        width,
        height,
        optimizedKey,
        thumbnailKey,
        optimizedSize: optimizedBuffer.length,
        status: "READY"
      }
    });

    // 8. Complete job status
    await prisma.processingJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        completedAt: new Date()
      }
    });

    return send(200, {
      success: true,
      message: "Image optimized successfully",
      urls: {
        original: originalUrl,
        optimized: getPublicUrl(optimizedKey),
        thumbnail: thumbnail300Url
      }
    });

  } catch (error) {
    console.error(`Error in optimize function for image ${imageId}:`, error.message || error);

    // Update job and image status to FAILED
    await prisma.processingJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        errorMessage: error.message || String(error),
        completedAt: new Date()
      }
    }).catch(err => console.error("Prisma update failed:", err));

    await prisma.image.update({
      where: { id: imageId },
      data: { status: "FAILED" }
    }).catch(err => console.error("Prisma update failed:", err));

    return send(500, { success: false, error: error.message || String(error) });
  }
}

exports.main = main;

