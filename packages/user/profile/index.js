const prisma = require("./lib/db/prisma");
const { getAuthUser } = require("./lib/jwt");
const { send } = require("./lib/response");

async function main(args) {
  try {
    const user = getAuthUser(args);
    if (!user) {
      return send(401, { success: false, error: "Unauthorized access" });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, name: true, email: true, createdAt: true }
    });

    if (!dbUser) {
      return send(404, { success: false, error: "User not found" });
    }

    return send(200, { success: true, user: dbUser });
  } catch (error) {
    return send(500, { success: false, error: error.message || String(error) });
  }
}

exports.main = main;



