import { Router, Response } from "express";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import prisma from "../prisma";
import { AuthenticatedRequest, authenticateToken } from "../middleware/auth";

const router = Router();

const s3Client = new S3Client({
  endpoint: process.env.SPACES_ENDPOINT,
  region: process.env.SPACES_REGION,
  credentials: {
    accessKeyId: process.env.SPACES_KEY || "",
    secretAccessKey: process.env.SPACES_SECRET || "",
  },
});

const SPACES_BUCKET = process.env.SPACES_BUCKET || "";
const SPACES_REGION = process.env.SPACES_REGION || "";

function getPublicUrl(key: string): string {
  return `https://${SPACES_BUCKET}.${SPACES_REGION}.digitaloceanspaces.com/${key}`;
}

// 1. Get all images for the logged-in user
router.get("/", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const images = await prisma.image.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
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
        thumbnail: img.thumbnailKey ? getPublicUrl(img.thumbnailKey) : null,
      },
    }));

    return res.json({ success: true, images: formattedImages });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Get specific image details
router.get("/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const image = await prisma.image.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      include: { jobs: { orderBy: { startedAt: "desc" } } },
    });

    if (!image) {
      return res.status(404).json({ success: false, error: "Image not found" });
    }

    return res.json({
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
          thumbnail64: image.thumbnailKey ? getPublicUrl(image.thumbnailKey.replace("_300.webp", "_64.webp")) : null,
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Delete image (DB record + files in DigitalOcean Spaces)
router.delete("/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const image = await prisma.image.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });

    if (!image) {
      return res.status(404).json({ success: false, error: "Image not found" });
    }

    const keysToDelete = [image.originalKey];
    if (image.optimizedKey) keysToDelete.push(image.optimizedKey);
    if (image.thumbnailKey) {
      keysToDelete.push(image.thumbnailKey);
      // Delete 150 and 64 size thumbnails as well
      keysToDelete.push(image.thumbnailKey.replace("_300.webp", "_150.webp"));
      keysToDelete.push(image.thumbnailKey.replace("_300.webp", "_64.webp"));
    }

    // Delete files from Spaces
    for (const key of keysToDelete) {
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: SPACES_BUCKET,
          Key: key,
        }));
      } catch (err) {
        console.error(`Failed to delete S3 file ${key}:`, err);
      }
    }

    // Delete from DB (will cascade delete jobs)
    await prisma.image.delete({ where: { id: image.id } });

    return res.json({ success: true, message: "Image and associated files deleted successfully" });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
