import axios from "axios";
import prisma from "../prisma";

const FUNCTION_BASE_URL = process.env.FUNCTION_BASE_URL || "";
const SPACES_BUCKET = process.env.SPACES_BUCKET || "";
const SPACES_REGION = process.env.SPACES_REGION || "";

function getPublicUrl(key: string): string {
  return `https://${SPACES_BUCKET}.${SPACES_REGION}.digitaloceanspaces.com/${key}`;
}

export async function triggerImageProcessing(imageId: string, jobId: string) {
  console.log(`Starting processing job ${jobId} for image ${imageId}...`);

  try {
    // 1. Update job status to PROCESSING
    await prisma.processingJob.update({
      where: { id: jobId },
      data: { status: "PROCESSING" },
    });

    await prisma.image.update({
      where: { id: imageId },
      data: { status: "PROCESSING" },
    });

    // Get image record details
    const image = await prisma.image.findUnique({ where: { id: imageId } });
    if (!image) throw new Error("Image record not found");

    const originalUrl = getPublicUrl(image.originalKey);

    // 2. Call Metadata Function
    console.log(`Calling metadata function for image ${imageId}...`);
    const metadataRes = await axios.post(`${FUNCTION_BASE_URL}/metadata`, {
      url: originalUrl,
    });

    if (!metadataRes.data || !metadataRes.data.success) {
      throw new Error(`Metadata extraction failed: ${metadataRes.data?.error || "Unknown error"}`);
    }

    const { width, height } = metadataRes.data.metadata;

    await prisma.image.update({
      where: { id: imageId },
      data: { width, height },
    });

    // 3. Call Optimize Function
    console.log(`Calling optimize function for image ${imageId}...`);
    const optimizeRes = await axios.post(`${FUNCTION_BASE_URL}/optimize`, {
      url: originalUrl,
    });

    if (!optimizeRes.data || !optimizeRes.data.success) {
      throw new Error(`Optimization failed: ${optimizeRes.data?.error || "Unknown error"}`);
    }

    const optimizedData = optimizeRes.data;
    const optimizedKey = optimizedData.url.replace(
      `https://${SPACES_BUCKET}.${SPACES_REGION}.digitaloceanspaces.com/`,
      ""
    );

    // 4. Call Thumbnail Function
    console.log(`Calling thumbnail function for image ${imageId}...`);
    const thumbnailRes = await axios.post(`${FUNCTION_BASE_URL}/thumbnail`, {
      url: originalUrl,
    });

    if (!thumbnailRes.data || !thumbnailRes.data.success) {
      throw new Error(`Thumbnail generation failed: ${thumbnailRes.data?.error || "Unknown error"}`);
    }

    const thumbnailData = thumbnailRes.data;
    // We will save the 300px thumbnail key as our primary thumbnailKey
    const thumbnail300Url = thumbnailData.thumbnails["300"];
    const thumbnailKey = thumbnail300Url.replace(
      `https://${SPACES_BUCKET}.${SPACES_REGION}.digitaloceanspaces.com/`,
      ""
    );

    // 5. Update image record to READY
    await prisma.image.update({
      where: { id: imageId },
      data: {
        optimizedKey,
        thumbnailKey,
        optimizedSize: optimizedData.optimized.size,
        status: "READY",
      },
    });

    // 6. Complete processing job
    await prisma.processingJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    console.log(`Successfully completed processing job ${jobId} for image ${imageId}!`);
  } catch (error: any) {
    console.error(`Error processing image ${imageId}:`, error.message || error);

    // Fail the job
    await prisma.processingJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        errorMessage: error.message || String(error),
        completedAt: new Date(),
      },
    });

    // Fail the image
    await prisma.image.update({
      where: { id: imageId },
      data: { status: "FAILED" },
    });
  }
}
