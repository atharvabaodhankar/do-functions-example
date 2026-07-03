const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const images = await prisma.image.findMany({
    include: { jobs: true }
  });
  console.log("Images and Jobs in DB:", JSON.stringify(images, null, 2));
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
