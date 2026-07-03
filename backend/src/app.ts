import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

import authRoutes from "./routes/auth";
import uploadRoutes from "./routes/uploads";
import imageRoutes from "./routes/images";

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/images", imageRoutes);

// Health Check
app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Express Backend running on port ${PORT} 🚀`);
});
