const bcrypt = require("bcryptjs");
const prisma = require("./lib/db/prisma");
const { signToken } = require("./lib/jwt");
const { send } = require("./lib/response");

async function main(args) {
  try {
    const { email, password } = args;

    if (!email || !password) {
      return send(400, { success: false, error: "Missing required fields (email, password)" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return send(400, { success: false, error: "Invalid email or password" });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return send(400, { success: false, error: "Invalid email or password" });
    }

    const token = signToken({ id: user.id, email: user.email });

    return send(200, {
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (error) {
    return send(500, { success: false, error: error.message || String(error) });
  }
}

exports.main = main;



