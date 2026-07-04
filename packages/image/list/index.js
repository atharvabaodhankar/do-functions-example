const prisma = require("./lib/db/prisma");
const { getAuthUser } = require("./lib/jwt");
const { send } = require("./lib/response");

function getPublicUrl(key) {
  const bucket = process.env.SPACES_BUCKET;
  const region = process.env.SPACES_REGION;
  return `https://${bucket}.${region}.digitaloceanspaces.com/${key}`;
}

async function main(args) {
  try {
    const user = getAuthUser(args);
    if (!user) {
      return send(401, { success: false, error: "Unauthorized access" });
    }

    const id = args.id || args.imageId;

    if (id) {
      const image = await prisma.image.findFirst({
        where: { id, userId: user.id },
        include: { jobs: { orderBy: { startedAt: "desc" } } }
      });

      if (!image) {
        return send(404, { success: false, error: "Image not found" });
      }

      return send(200, {
        success: true,
        image: {
          id: image.id,
          status: image.status,
          mimeType: image.mimeType,
          extension: image.extension,
          width: image.width,
          height: image.height,
          originalSize: image.originalSize,
          optimizedSize: image.optimizedSize,
          createdAt: image.createdAt,
          jobs: image.jobs,
          urls: {
            original: getPublicUrl(image.originalKey),
            optimized: image.optimizedKey ? getPublicUrl(image.optimizedKey) : null,
            thumbnail: image.thumbnailKey ? getPublicUrl(image.thumbnailKey) : null,
            thumbnail150: image.thumbnailKey ? getPublicUrl(image.thumbnailKey.replace("_300.webp", "_150.webp")) : null,
            thumbnail64: image.thumbnailKey ? getPublicUrl(image.thumbnailKey.replace("_300.webp", "_64.webp")) : null
          }
        }
      });
    }

    const images = await prisma.image.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" }
    });

    const formattedImages = images.map((img) => ({
      id: img.id,
      status: img.status,
      mimeType: img.mimeType,
      extension: img.extension,
      width: img.width,
      height: img.height,
      originalSize: img.originalSize,
      optimizedSize: img.optimizedSize,
      createdAt: img.createdAt,
      urls: {
        original: getPublicUrl(img.originalKey),
        optimized: img.optimizedKey ? getPublicUrl(img.optimizedKey) : null,
        thumbnail: img.thumbnailKey ? getPublicUrl(img.thumbnailKey) : null
      }
    }));

    return send(200, { success: true, images: formattedImages });
  } catch (error) {
    return send(500, { success: false, error: error.message || String(error) });
  }
}

exports.main = main;



