import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../prisma";
import { z } from "zod";
import { AuthenticatedRequest, authenticateToken } from "../middleware/auth";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "atharva-cloud-image-service-secret-key-123!";

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post("/register", async (req, res: Response) => {
  try {
    const { name, email, password } = registerSchema.parse(req.body);

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ success: false, error: "Email is already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword },
    });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });

    return res.status(201).json({
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message || error });
  }
});

router.post("/login", async (req, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ success: false, error: "Invalid email or password" });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ success: false, error: "Invalid email or password" });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });

    return res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message || error });
  }
});

router.get("/me", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, name: true, email: true, createdAt: true },
    });
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    return res.json({ success: true, user });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
