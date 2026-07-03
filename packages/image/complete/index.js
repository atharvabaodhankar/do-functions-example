const aws4 = require("aws4");
const axios = require("axios");
const prisma = require("./lib/db/prisma");
const { getAuthUser } = require("./lib/jwt");
const { send } = require("./lib/response");

async function uploadToSpaces(key, fileBuffer, mimeType) {
  const region = process.env.SPACES_REGION || "sgp1";
  const bucket = process.env.SPACES_BUCKET;
  const host = `${bucket}.${region}.digitaloceanspaces.com`;
  const path = `/${key}`;

  const opts = aws4.sign(
    {
      service: "s3",
      region,
      host,
      method: "PUT",
      path,
      headers: {
        "Content-Type": mimeType,
        "x-amz-acl": "public-read",
        "Content-Length": String(fileBuffer.length),
      },
      body: fileBuffer,
    },
    {
      accessKeyId: process.env.SPACES_KEY,
      secretAccessKey: process.env.SPACES_SECRET,
    }
  );

  await axios.put(`https://${host}${path}`, fileBuffer, {
    headers: opts.headers,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
}

async function main(args) {
  try {
    const user = getAuthUser(args);
    if (!user) {
      return send(401, { success: false, error: "Unauthorized access" });
    }

    const { key, originalSize, mimeType, extension, fileData } = args;
    if (!key || !originalSize || !mimeType || !extension) {
      return send(400, {
        success: false,
        error: "Missing required fields (key, originalSize, mimeType, extension)",
      });
    }

    // If fileData is provided (CORS fallback), upload directly to Spaces via signed request
    if (fileData) {
      try {
        const fileBuffer = Buffer.from(fileData, "base64");
        await uploadToSpaces(key, fileBuffer, mimeType);
      } catch (uploadError) {
        console.error("Server-side upload failed:", uploadError.message);
        return send(500, {
          success: false,
          error: `Failed to upload file to storage: ${uploadError.message}`,
        });
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
        status: "UPLOADED",
      },
    });

    // 2. Create the processing job record
    const job = await prisma.processingJob.create({
      data: {
        imageId: image.id,
        status: "PENDING",
      },
    });

    // 3. Invoke the optimize function asynchronously (fire-and-forget)
    const functionBaseUrl =
      process.env.FUNCTION_BASE_URL ||
      `https://faas-blr1-8177d592.doserverless.co/api/v1/web/fn-f72bafd1-18fd-4e5b-9d68-721b5dc7cae6/image`;

    axios
      .post(`${functionBaseUrl}/optimize.json`, {
        imageId: image.id,
        jobId: job.id,
      })
      .catch((err) => {
        console.error("Failed to trigger optimize function:", err.message);
      });

    return send(200, {
      success: true,
      imageId: image.id,
      status: "PROCESSING",
    });
  } catch (error) {
    return send(500, { success: false, error: error.message || String(error) });
  }
}

exports.main = main;
