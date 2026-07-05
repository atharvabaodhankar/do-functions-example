# Hand-Drawn Cloud Image Optimizer 🎨✏️

A 100% serverless, production-ready image processing and optimization platform (similar to Cloudinary or ImageKit). Built using **DigitalOcean Functions**, **DigitalOcean Spaces** (S3 compatible), and **Neon Serverless PostgreSQL**.

The frontend features a custom, playful **Hand-Drawn / Sketchbook** user interface built with React & Vite.

---

## 🚀 Key Features

*   **100% Serverless Architecture**: No background processes, VM droplets, or Docker containers. Every endpoint is a stateless DigitalOcean Function.
*   **Secure Direct Browser Uploads**: Frontend uploads files directly to DO Spaces using temporary S3 presigned URLs, keeping master API credentials secure on the backend.
*   **CORS Fallback Proxy**: Automatic fallback to a base64 server-side upload proxy if the browser gets blocked by storage CORS policies.
*   **Serverless Optimization Pipeline**: Scalable background processing that automatically converts uploads to optimized WebP formats.
*   **Multi-size Thumbnail Generation**: Generates 300px (Medium), 150px (Small), and 64px (Avatar) thumbnails.
*   **Metadata Extraction**: Gathers dimensions (width, height), formats, and sizes automatically.
*   **Neon Serverless DB Integration**: Fast database queries with auto-scaling connection pooling enabled.
*   **Playful Hand-Drawn UI**: Custom wobbly borders, marker-style typography, thumbtacks, paper tape effects, and hard offset shadows.

---

## 🛠️ Tech Stack

*   **Compute**: DigitalOcean Functions (Node.js 22, OpenWhisk)
*   **Storage**: DigitalOcean Spaces (S3 compatible)
*   **Database**: Neon Serverless PostgreSQL (with connection pooling)
*   **ORM**: Prisma (local engine generation & pruning) + pg (raw client fallback)
*   **Image Processing**: Sharp
*   **Frontend**: React (Vite, Lucide Icons, Custom handwritten CSS)
*   **Auth**: JWT + bcryptjs

---

## 📂 Project Structure

```text
├── packages/
│   ├── auth/
│   │   ├── login/         # User authentication & token signing
│   │   └── register/      # New account creation
│   ├── image/
│   │   ├── health/        # Liveness checks
│   │   ├── presign/       # Secure S3 upload URL generator
│   │   ├── complete/      # Triggers background pipeline (Raw pg client)
│   │   ├── optimize/      # Resizes & converts to WebP (S3 secure download)
│   │   ├── thumbnail/     # Creates multiple wobbly WebP thumbnails
│   │   ├── list/          # Fetches image lists & details
│   │   └── delete/        # Wipes original and variants from storage & DB
│   └── user/
│       └── profile/       # Profile info endpoint
├── frontend/              # React + Vite client application
├── project.yml            # DigitalOcean serverless configuration
├── deploy_serverless.ps1  # Automated deployment script with engine pruning
├── build_local.ps1        # Local Prisma build utility
└── copy_lib.ps1           # Internal package dependency synchronization
```

---

## ⚙️ Environment Configuration

Create a `.env` file in the root of the project with the following parameters:

```env
SPACES_ENDPOINT=https://<region>.digitaloceanspaces.com
SPACES_REGION=<region>
SPACES_BUCKET=<bucket-name>
SPACES_KEY=<spaces-access-key>
SPACES_SECRET=<spaces-secret-key>
DATABASE_URL=postgresql://<user>:<password>@<neon-pooler-host>/neondb?sslmode=require
JWT_SECRET=<your-super-secure-key>
```

---

## 📦 Deployment Workflow

DigitalOcean Functions enforce a **48MB ZIP payload limit** for remote builds. To deploy heavy dependency frameworks (like Prisma), this repository uses a custom deployment script that builds and prunes the environment locally:

1.  **Generate Engine**: Generates Prisma Client targeting the DigitalOcean function platform runtime (`debian-openssl-3.0.x`).
2.  **Prune Bloat**: Strips the heavy Prisma CLI, cached binaries, and Windows-specific engines to reduce the payload to <10MB.
3.  **Bypass Remote Install**: Temporarily renames `package.json` to `.bak` during deploy, forcing the DigitalOcean builder to upload our pre-built local `node_modules` instead of downloading heavy packages remotely.

To deploy all functions, run the PowerShell script:

```powershell
.\deploy_serverless.ps1
```

---

## 💻 Local Development

To run the Hand-Drawn frontend locally:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser. All API requests are routed directly to the active DigitalOcean Functions gateway.
