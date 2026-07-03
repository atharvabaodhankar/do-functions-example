const axios = require("axios");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const prisma = require("./lib/db/prisma");
const { getAuthUser } = require("./lib/jwt");
const { send } = require("./lib/response");
const { s3Client } = require("./lib/spaces");

async function main(args) {
  try {
    const user = getAuthUser(args);
    if (!user) {
      return send(401, { success: false, error: "Unauthorized access" });
    }

    const { key, originalSize, mimeType, extension, fileData } = args;
    if (!key || !originalSize || !mimeType || !extension) {
      return send(400, { success: false, error: "Missing required fields (key, originalSize, mimeType, extension)" });
    }

    // If fileData is provided (fallback for CORS environments), upload directly to Spaces
    if (fileData) {
      try {
        await s3Client.send(new PutObjectCommand({
          Bucket: process.env.SPACES_BUCKET,
          Key: key,
          Body: Buffer.from(fileData, "base64"),
          ContentType: mimeType,
          ACL: "public-read"
        }));
      } catch (uploadError) {
        console.error("Server-side upload failed:", uploadError);
        return send(500, { success: false, error: `Failed to upload file to storage: ${uploadError.message}` });
      }
    }

    // 1. Create the image record in the database
    const image = await prisma.image.create({
      data: {
        userId: user.id,
        originalKey: key,
        mimeType,
        extension,
        originalSize,
        status: "UPLOADED"
      }
    });

    // 2. Create the processing job record
    const job = await prisma.processingJob.create({
      data: {
        imageId: image.id,
        status: "PENDING"
      }
    });

    // 3. Invoke the optimize function asynchronously (fire-and-forget)
    const functionBaseUrl = process.env.FUNCTION_BASE_URL || `https://faas-blr1-8177d592.doserverless.co/api/v1/web/fn-f72bafd1-18fd-4e5b-9d68-721b5dc7cae6/image`;
    
    // We pass imageId and jobId to the optimize function
    axios.post(`${functionBaseUrl}/optimize.json`, {
      imageId: image.id,
      jobId: job.id
    }).catch(err => {
      console.error("Failed to trigger optimize function asynchronously:", err.message);
    });

    return send(200, {
      success: true,
      imageId: image.id,
      status: "PROCESSING"
    });
  } catch (error) {
    return send(500, { success: false, error: error.message || String(error) });
  }
}

exports.main = main;

