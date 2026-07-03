const bcrypt = require("bcryptjs");
const prisma = require("../lib/db/prisma");
const { signToken } = require("../lib/jwt");
const { send } = require("../lib/response");

async function main(args) {
  try {
    const { name, email, password } = args;

    if (!name || !email || !password) {
      return send(400, { success: false, error: "Missing required fields (name, email, password)" });
    }

    if (password.length < 6) {
      return send(400, { success: false, error: "Password must be at least 6 characters" });
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return send(400, { success: false, error: "Email is already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword }
    });

    const token = signToken({ id: user.id, email: user.email });

    return send(201, {
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (error) {
    return send(500, { success: false, error: error.message || String(error) });
  }
}

exports.main = main;
