const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
const prisma = require("./lib/db/prisma");
const { s3Client } = require("./lib/spaces");
const { getAuthUser } = require("./lib/jwt");
const { send } = require("./lib/response");

async function main(args) {
  try {
    const user = getAuthUser(args);
    if (!user) {
      return send(401, { success: false, error: "Unauthorized access" });
    }

    const id = args.id || args.imageId;
    if (!id) {
      return send(400, { success: false, error: "Missing 'id' parameter" });
    }

    // 1. Fetch image
    const image = await prisma.image.findFirst({
      where: { id, userId: user.id }
    });

    if (!image) {
      return send(404, { success: false, error: "Image not found" });
    }

    const keysToDelete = [image.originalKey];
    if (image.optimizedKey) keysToDelete.push(image.optimizedKey);
    if (image.thumbnailKey) {
      keysToDelete.push(image.thumbnailKey);
      keysToDelete.push(image.thumbnailKey.replace("_300.webp", "_150.webp"));
      keysToDelete.push(image.thumbnailKey.replace("_300.webp", "_64.webp"));
    }

    // 2. Delete files from Spaces
    const bucket = process.env.SPACES_BUCKET;
    for (const key of keysToDelete) {
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: bucket,
          Key: key
        }));
      } catch (err) {
        console.error(`Failed to delete S3 file ${key}:`, err);
      }
    }

    // 3. Delete from DB (will cascade delete jobs)
    await prisma.image.delete({ where: { id: image.id } });

    return send(200, { success: true, message: "Image and associated variants deleted successfully" });
  } catch (error) {
    return send(500, { success: false, error: error.message || String(error) });
  }
}

exports.main = main;

