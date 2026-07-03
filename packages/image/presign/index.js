const { PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { v4: uuidv4 } = require("uuid");
const { s3Client } = require("../lib/spaces");
const { getAuthUser } = require("../lib/jwt");
const { send } = require("../lib/response");

async function main(args) {
  try {
    const user = getAuthUser(args);
    if (!user) {
      return send(401, { success: false, error: "Unauthorized access" });
    }

    const { filename, contentType } = args;
    if (!filename || !contentType) {
      return send(400, { success: false, error: "Missing required fields (filename, contentType)" });
    }

    const fileId = uuidv4();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
    const key = `uploads/${fileId}_${sanitizedFilename}`;

    const command = new PutObjectCommand({
      Bucket: process.env.SPACES_BUCKET,
      Key: key,
      ContentType: contentType,
      ACL: "public-read"
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    return send(200, {
      success: true,
      uploadUrl,
      key
    });
  } catch (error) {
    return send(500, { success: false, error: error.message || String(error) });
  }
}

exports.main = main;
