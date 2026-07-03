import { Router, Response } from "express";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import prisma from "../prisma";
import { AuthenticatedRequest, authenticateToken } from "../middleware/auth";
import { triggerImageProcessing } from "../services/orchestrator";

const router = Router();

const s3Client = new S3Client({
  endpoint: process.env.SPACES_ENDPOINT,
  region: process.env.SPACES_REGION,
  credentials: {
    accessKeyId: process.env.SPACES_KEY || "",
    secretAccessKey: process.env.SPACES_SECRET || "",
  },
});

const presignSchema = z.object({
  filename: z.string(),
  contentType: z.string(),
});

const completeSchema = z.object({
  key: z.string(),
  originalSize: z.number(),
  mimeType: z.string(),
  extension: z.string(),
});

// 1. Generate Presigned URL
router.post("/presign", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { filename, contentType } = presignSchema.parse(req.body);
    
    // Create a unique key inside uploads/ directory
    const fileId = uuidv4();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
    const key = `uploads/${fileId}_${sanitizedFilename}`;

    const command = new PutObjectCommand({
      Bucket: process.env.SPACES_BUCKET,
      Key: key,
      ContentType: contentType,
      ACL: "public-read", // Allow public access so functions can download via http
    });

    // URL expires in 5 minutes (300 seconds)
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    return res.json({
      success: true,
      uploadUrl,
      key,
    });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message || error });
  }
});

// 2. Complete Upload
router.post("/complete", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { key, originalSize, mimeType, extension } = completeSchema.parse(req.body);

    // Create the image record in database
    const image = await prisma.image.create({
      data: {
        userId: req.user!.id,
        originalKey: key,
        mimeType,
        extension,
        originalSize,
        status: "UPLOADED",
      },
    });

    // Create a processing job record
    const job = await prisma.processingJob.create({
      data: {
        imageId: image.id,
        status: "PENDING",
      },
    });

    // Trigger processing asynchronously in background (avoid blocking client response)
    triggerImageProcessing(image.id, job.id).catch((err) => {
      console.error(`Background processing failed for image ${image.id}:`, err);
    });

    return res.json({
      success: true,
      imageId: image.id,
      status: "PROCESSING",
    });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message || error });
  }
});

export default router;
