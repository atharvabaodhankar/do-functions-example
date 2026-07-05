import React, { useState, useEffect } from "react";
import {
  Upload,
  Image as ImageIcon,
  LogOut,
  RefreshCw,
  Trash2,
  Lock,
  Mail,
  User as UserIcon,
  CheckCircle,
  AlertCircle,
  Copy,
  ExternalLink,
  ChevronRight,
  Maximize2
} from "lucide-react";

const API_BASE = "https://faas-blr1-8177d592.doserverless.co/api/v1/web/fn-f72bafd1-18fd-4e5b-9d68-721b5dc7cae6";

const parseResponse = async (res) => {
  const data = await res.json();
  if (data && data.body && typeof data.body === "object") {
    return data.body;
  }
  return data;
};

function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login"); // login | register
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [authError, setAuthError] = useState("");
  
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [activeTab, setActiveTab] = useState("gallery"); // gallery | uploads

  // Fetch current user and images on load
  useEffect(() => {
    if (token) {
      localStorage.setItem("token", token);
      fetchUser();
      fetchImages();
    } else {
      localStorage.removeItem("token");
      setUser(null);
      setImages([]);
    }
  }, [token]);

  const fetchUser = async () => {
    try {
      const res = await fetch(`${API_BASE}/user/profile.json`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await parseResponse(res);
      if (data.success) {
        setUser(data.user);
      } else {
        logout();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchImages = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/image/list.json`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await parseResponse(res);
      if (data.success) {
        setImages(data.images);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setToken("");
    localStorage.removeItem("token");
  };

  // Auth Handlers
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError("");
    const endpoint = authMode === "login" ? "/auth/login.json" : "/auth/register.json";
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authForm)
      });
      const data = await parseResponse(res);
      if (data.success) {
        setToken(data.token);
      } else {
        setAuthError(data.error || "Authentication failed");
      }
    } catch (err) {
      setAuthError("Server connection failed");
    }
  };

  // Upload Handler
  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress("Generating secure upload URL...");

    try {
      // 1. Get presigned URL
      const presignRes = await fetch(`${API_BASE}/image/presign.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type
        })
      });
      const presignData = await parseResponse(presignRes);
      if (!presignData.success) throw new Error(presignData.error);

      const { uploadUrl, key } = presignData;

      // 2. PUT directly to Spaces with CORS fallback
      setUploadProgress("Uploading image directly to cloud storage...");
      let directUploadSuccess = false;
      try {
        const s3Res = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type,
            "x-amz-acl": "public-read"
          },
          body: file
        });
        if (s3Res.ok) {
          directUploadSuccess = true;
        }
      } catch (corsErr) {
        console.warn("Direct upload blocked by CORS or network error, falling back to server-side proxy upload:", corsErr);
      }

      let completeBody = {
        key,
        originalSize: file.size,
        mimeType: file.type,
        extension: file.name.split(".").pop()
      };

      if (!directUploadSuccess) {
        setUploadProgress("CORS detected. Uploading securely through serverless proxy...");
        // Convert file to base64
        const base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.onerror = (e) => reject(e);
          reader.readAsDataURL(file);
        });
        completeBody.fileData = base64Data;
      }

      // 3. Trigger completion and start background processing
      setUploadProgress("Starting optimization pipelines...");
      const completeRes = await fetch(`${API_BASE}/image/complete.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(completeBody)
      });

      const completeData = await parseResponse(completeRes);
      if (!completeData.success) throw new Error(completeData.error);

      // Refresh images lists
      fetchImages();
      
      // Start polling for this image's status
      pollImageStatus(completeData.imageId);

    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
      setUploadProgress("");
    }
  };

  const pollImageStatus = async (imageId) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/image/list.json?id=${imageId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await parseResponse(res);
        if (data.success) {
          const status = data.image.status;
          if (status === "READY" || status === "FAILED") {
            clearInterval(interval);
            fetchImages();
            if (status === "READY") {
              // Optionally show detail modal for the ready image
              setSelectedImage(data.image);
            }
          }
        }
      } catch (err) {
        clearInterval(interval);
      }
    }, 2000);
  };

  const deleteImage = async (id, e) => {
    if (e) e.stopPropagation();
    if (!confirm("Are you sure you want to delete this image and all optimized variants?")) return;
    try {
      const res = await fetch(`${API_BASE}/image/delete.json?id=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await parseResponse(res);
      if (data.success) {
        setImages(images.filter((img) => img.id !== id));
        if (selectedImage && selectedImage.id === id) {
          setSelectedImage(null);
        }
      }
    } catch (err) {
      alert("Delete failed");
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert("URL copied to clipboard!");
  };

  // Helper size formatter
  const formatSize = (bytes) => {
    if (!bytes) return "0 B";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  if (!token) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", padding: "20px" }}>
        <div className="glass-card" style={{ width: "100%", maxWidth: "420px", padding: "40px 32px 32px 32px", boxSizing: "border-box" }}>
          {/* Tape strip at the top of the login pad */}
          <div className="tape-strip" />

          <div style={{ textAlign: "center", marginBottom: "32px" }}>
            <div style={{ border: "3px solid #2d2d2d", width: "56px", height: "56px", borderRadius: "12px 3px 15px 4px / 4px 15px 3px 12px", display: "inline-flex", justifyContent: "center", alignItems: "center", color: "#2d2d2d", background: "#fff9c4", marginBottom: "16px", transform: "rotate(-2deg)", boxShadow: "2px 2px 0px #2d2d2d" }}>
              <ImageIcon size={32} strokeWidth={2.5} />
            </div>
            <h2 style={{ margin: "0 0 8px 0", fontSize: "32px", fontWeight: "700" }}>Cloud Image Optimizer</h2>
            <p style={{ margin: "0", color: "#6b7280", fontSize: "18px", fontStyle: "italic" }}>Serverless image processing pipeline</p>
          </div>

          {authError && (
            <div style={{ background: "#ffcdd2", border: "2.5px solid #2d2d2d", borderRadius: "8px", padding: "12px", display: "flex", alignItems: "center", gap: "8px", color: "#b71c1c", fontSize: "16px", marginBottom: "20px" }}>
              <AlertCircle size={20} strokeWidth={2.5} />
              <span style={{ fontWeight: "600" }}>{authError}</span>
            </div>
          )}

          <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {authMode === "register" && (
              <div style={{ position: "relative" }}>
                <UserIcon size={20} style={{ position: "absolute", left: "16px", top: "15px", color: "#2d2d2d" }} strokeWidth={2.5} />
                <input
                  type="text"
                  placeholder="Full Name"
                  className="input-field"
                  style={{ paddingLeft: "46px" }}
                  value={authForm.name}
                  onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                  required
                />
              </div>
            )}

            <div style={{ position: "relative" }}>
              <Mail size={20} style={{ position: "absolute", left: "16px", top: "15px", color: "#2d2d2d" }} strokeWidth={2.5} />
              <input
                type="email"
                placeholder="Email Address"
                className="input-field"
                style={{ paddingLeft: "46px" }}
                value={authForm.email}
                onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                required
              />
            </div>

            <div style={{ position: "relative" }}>
              <Lock size={20} style={{ position: "absolute", left: "16px", top: "15px", color: "#2d2d2d" }} strokeWidth={2.5} />
              <input
                type="password"
                placeholder="Password"
                className="input-field"
                style={{ paddingLeft: "46px" }}
                value={authForm.password}
                onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                required
              />
            </div>

            <button type="submit" className="btn-primary" style={{ width: "100%", marginTop: "12px" }}>
              {authMode === "login" ? "Sign In ✍️" : "Create Account 📝"}
            </button>
          </form>

          <div style={{ textAlign: "center", marginTop: "24px", fontSize: "16px" }}>
            {authMode === "login" ? (
              <p style={{ color: "#2d2d2d", margin: "0" }}>
                New to the service?{" "}
                <span onClick={() => { setAuthMode("register"); setAuthError(""); }} style={{ color: "#2d5da1", cursor: "pointer", fontWeight: "700", textDecoration: "underline" }}>
                  Register here
                </span>
              </p>
            ) : (
              <p style={{ color: "#2d2d2d", margin: "0" }}>
                Already have an account?{" "}
                <span onClick={() => { setAuthMode("login"); setAuthError(""); }} style={{ color: "#2d5da1", cursor: "pointer", fontWeight: "700", textDecoration: "underline" }}>
                  Sign In
                </span>
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Header */}
      <header className="glass-card header-flex" style={{ padding: "20px 24px", marginBottom: "40px" }}>
        <div className="tack-pin" />
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ border: "2.5px solid #2d2d2d", width: "42px", height: "42px", borderRadius: "6px 12px 4px 10px / 10px 4px 12px 6px", display: "flex", justifyContent: "center", alignItems: "center", color: "#2d2d2d", background: "#fff9c4", transform: "rotate(-2deg)" }}>
            <ImageIcon size={22} strokeWidth={2.5} />
          </div>
          <div>
            <h1 style={{ margin: "0", fontSize: "24px", fontWeight: "700" }}>Cloud Image Optimizer</h1>
            <p style={{ margin: "0", fontSize: "14px", color: "#6b7280", fontStyle: "italic" }}>Spaces + Neon + Serverless</p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div style={{ textAlign: "right" }}>
            <p style={{ margin: "0", fontSize: "18px", fontWeight: "700" }}>{user?.name}</p>
            <p style={{ margin: "0", fontSize: "14px", color: "#6b7280" }}>{user?.email}</p>
          </div>
          <button onClick={logout} className="btn-secondary" style={{ padding: "8px 14px" }} title="Log Out">
            <LogOut size={18} strokeWidth={2.5} />
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <div className="grid-2">
        {/* Upload Column */}
        <div className="glass-card sticky-note" style={{ padding: "32px 24px 24px 24px", alignSelf: "start" }}>
          {/* Paper Tape Effect */}
          <div className="tape-strip" />
          
          <h3 style={{ margin: "0 0 16px 0", fontSize: "24px" }}>Upload Original Image</h3>
          <p style={{ fontSize: "16px", margin: "0 0 24px 0", lineHeight: "1.6" }}>
            Upload directly to DigitalOcean Spaces via S3 presigned URLs. Our serverless pipeline will automatically resize, convert to WebP, and generate thumbnails.
          </p>

          <label
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "220px",
              border: "3px dashed #2d2d2d",
              borderRadius: "15px 50px 20px 60px / 60px 20px 50px 15px",
              cursor: "pointer",
              transition: "all 0.15s ease",
              position: "relative",
              overflow: "hidden",
              background: "#ffffff"
            }}
            onDragOver={(e) => e.preventDefault()}
            className="jiggle-hover"
          >
            {uploading ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "20px", textAlign: "center" }}>
                <RefreshCw className="spin-slow" size={36} style={{ color: "#2d5da1" }} strokeWidth={2.5} />
                <span style={{ fontSize: "18px", fontWeight: "600" }}>{uploadProgress}</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", padding: "20px" }}>
                <Upload size={38} style={{ color: "#2d2d2d", marginBottom: "8px" }} strokeWidth={2.5} />
                <span style={{ fontSize: "18px", fontWeight: "700", color: "#2d2d2d" }}>Choose a file to upload</span>
                <span style={{ fontSize: "14px", color: "#6b7280" }}>Supports PNG, JPG, WEBP, TIFF</span>
              </div>
            )}
            <input type="file" style={{ display: "none" }} onChange={handleUpload} disabled={uploading} accept="image/*" />
          </label>
        </div>

        {/* Gallery Column */}
        <div className="glass-card" style={{ padding: "32px 24px 24px 24px", minHeight: "450px" }}>
          {/* Red Pin Tack */}
          <div className="tack-pin" />

          <div className="flex-between" style={{ marginBottom: "28px" }}>
            <h3 style={{ margin: "0", fontSize: "28px" }}>Optimized Gallery</h3>
            <button onClick={fetchImages} className="btn-secondary" style={{ padding: "8px 14px" }} disabled={loading}>
              <RefreshCw size={18} className={loading ? "spin-slow" : ""} strokeWidth={2.5} />
            </button>
          </div>

          {loading && images.length === 0 ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "250px" }}>
              <RefreshCw size={36} className="spin-slow" strokeWidth={2.5} />
            </div>
          ) : images.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 20px", color: "#6b7280" }}>
              <ImageIcon size={64} style={{ strokeWidth: 1.5, marginBottom: "16px", color: "#2d2d2d" }} />
              <p style={{ margin: "0", fontSize: "20px", fontFamily: "Kalam" }}>No sketches uploaded yet.</p>
            </div>
          ) : (
            <div className="grid-3">
              {images.map((img) => (
                <div
                  key={img.id}
                  className="glass-card jiggle-hover"
                  style={{ overflow: "hidden", cursor: "pointer", border: "2.5px solid #2d2d2d", background: "#ffffff", padding: "8px" }}
                  onClick={async () => {
                    try {
                      const res = await fetch(`${API_BASE}/image/list.json?id=${img.id}`, {
                        headers: { Authorization: `Bearer ${token}` }
                      });
                      const data = await parseResponse(res);
                      if (data.success) setSelectedImage(data.image);
                    } catch (e) {
                      alert("Error loading details");
                    }
                  }}
                >
                  {/* Status Indicator */}
                  <div style={{ position: "absolute", top: "12px", right: "12px", zIndex: 2 }}>
                    <span className={`badge badge-${img.status.toLowerCase()}`}>
                      {img.status}
                    </span>
                  </div>

                  {/* Thumbnail / Image Preview */}
                  <div className="gallery-image-frame" style={{ height: "180px", display: "flex", justifyContent: "center", alignItems: "center", position: "relative" }}>
                    {img.status === "READY" && img.urls.thumbnail ? (
                      <img
                        src={img.urls.thumbnail}
                        alt="Optimized thumbnail"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : img.status === "FAILED" ? (
                      <div style={{ color: "#ff4d4d", textAlign: "center" }}>
                        <AlertCircle size={32} strokeWidth={2.5} />
                        <p style={{ margin: "6px 0 0 0", fontSize: "16px", fontWeight: "700" }}>Failed</p>
                      </div>
                    ) : (
                      <div style={{ color: "#2d5da1", textAlign: "center" }}>
                        <RefreshCw size={32} className="spin-slow" strokeWidth={2.5} />
                        <p style={{ margin: "6px 0 0 0", fontSize: "16px", fontWeight: "700" }}>Processing</p>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ padding: "12px 6px 4px 6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <span style={{ fontSize: "14px", textTransform: "uppercase", fontWeight: "700", color: "#6b7280" }}>
                        {img.extension} File
                      </span>
                      {img.status === "READY" && img.originalSize && img.optimizedSize && (
                        <span style={{ fontSize: "15px", fontWeight: "700", color: "#2d5da1" }}>
                          -{((1 - img.optimizedSize / img.originalSize) * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <div className="flex-between">
                      <div>
                        <p style={{ margin: "0", fontSize: "15px", color: "#2d2d2d", fontWeight: "700" }}>
                          Size: {formatSize(img.optimizedSize || img.originalSize)}
                        </p>
                      </div>
                      <button
                        onClick={(e) => deleteImage(img.id, e)}
                        style={{ background: "none", border: "none", color: "#ff4d4d", cursor: "pointer", padding: "6px", display: "inline-flex", alignItems: "center" }}
                      >
                        <Trash2 size={16} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Image Detail Modal */}
      {selectedImage && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(45, 45, 45, 0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 10, padding: "20px" }}>
          <div className="glass-card" style={{ width: "100%", maxWidth: "800px", maxHeight: "90vh", overflowY: "auto", padding: "32px 24px 24px 24px", position: "relative" }}>
            {/* Tack pin decor */}
            <div className="tack-pin" />

            <button
              onClick={() => setSelectedImage(null)}
              style={{ position: "absolute", top: "16px", right: "16px", background: "#e5e0d8", border: "2.5px solid #2d2d2d", width: "32px", height: "32px", borderRadius: "50%", color: "#2d2d2d", cursor: "pointer", fontSize: "20px", fontWeight: "700", display: "flex", justifyContent: "center", alignItems: "center" }}
            >
              &times;
            </button>

            <h2 style={{ margin: "0 0 20px 0", fontSize: "28px" }}>Image Details & Variants</h2>

            {/* Compare Columns */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px", marginBottom: "24px" }}>
              <div>
                <p style={{ margin: "0 0 8px 0", fontSize: "16px", fontWeight: "700", color: "#6b7280" }}>Original Format ({selectedImage.extension})</p>
                <div className="gallery-image-frame" style={{ height: "220px", display: "flex", justifyContent: "center", alignItems: "center" }}>
                  <img src={selectedImage.urls.original} alt="Original" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                </div>
                <div style={{ marginTop: "10px", fontSize: "16px", fontWeight: "700" }}>
                  <p style={{ margin: "4px 0" }}>Width: {selectedImage.width || "N/A"} px</p>
                  <p style={{ margin: "4px 0" }}>Height: {selectedImage.height || "N/A"} px</p>
                  <p style={{ margin: "4px 0" }}>Size: {formatSize(selectedImage.originalSize)}</p>
                </div>
              </div>

              <div>
                <p style={{ margin: "0 0 8px 0", fontSize: "16px", fontWeight: "700", color: "#6b7280" }}>Optimized (WebP)</p>
                <div className="gallery-image-frame" style={{ height: "220px", display: "flex", justifyContent: "center", alignItems: "center" }}>
                  {selectedImage.urls.optimized ? (
                    <img src={selectedImage.urls.optimized} alt="Optimized" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  ) : (
                    <span style={{ color: "#6b7280" }}>Processing...</span>
                  )}
                </div>
                <div style={{ marginTop: "10px", fontSize: "16px", fontWeight: "700" }}>
                  <p style={{ margin: "4px 0" }}>Width: {selectedImage.width ? Math.min(selectedImage.width, 1280) : "N/A"} px</p>
                  <p style={{ margin: "4px 0" }}>Height: {selectedImage.height && selectedImage.width ? Math.round(selectedImage.height * (Math.min(selectedImage.width, 1280) / selectedImage.width)) : "N/A"} px</p>
                  <p style={{ margin: "4px 0" }}>Size: {formatSize(selectedImage.optimizedSize)}</p>
                </div>
              </div>
            </div>

            {/* Savings Banner */}
            {selectedImage.originalSize && selectedImage.optimizedSize && (
              <div style={{ background: "#c8e6c9", border: "2.5px solid #2d2d2d", borderRadius: "8px", padding: "12px", textAlign: "center", marginBottom: "24px", color: "#2d2d2d", fontWeight: "700", fontSize: "18px", transform: "rotate(0.5deg)" }}>
                🎉 Serverless pipeline saved {formatSize(selectedImage.originalSize - selectedImage.optimizedSize)} ({((1 - selectedImage.optimizedSize / selectedImage.originalSize) * 100).toFixed(1)}%) storage space!
              </div>
            )}

            {/* Links and Actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <h4 style={{ margin: "0", fontSize: "20px" }}>Deliverable Variants</h4>
              
              <div className="glass-card variant-row" style={{ padding: "14px 18px", boxShadow: "2px 2px 0px #2d2d2d" }}>
                <div className="variant-info">
                  <p style={{ margin: "0", fontSize: "16px", fontWeight: "700" }}>Optimized Image (WebP)</p>
                  <p style={{ margin: "2px 0 0 0", fontSize: "14px", color: "#6b7280" }}>{selectedImage.urls.optimized}</p>
                </div>
                <div className="variant-actions">
                  <button onClick={() => copyToClipboard(selectedImage.urls.optimized)} className="btn-secondary" style={{ padding: "6px 10px" }}><Copy size={16} strokeWidth={2.5} /></button>
                  <a href={selectedImage.urls.optimized} target="_blank" rel="noreferrer" className="btn-primary" style={{ padding: "6px 10px" }}><ExternalLink size={16} strokeWidth={2.5} /></a>
                </div>
              </div>

              {selectedImage.urls.thumbnail && (
                <div className="glass-card variant-row" style={{ padding: "14px 18px", boxShadow: "2px 2px 0px #2d2d2d" }}>
                  <div className="variant-info">
                    <p style={{ margin: "0", fontSize: "16px", fontWeight: "700" }}>Medium Thumbnail (300px)</p>
                    <p style={{ margin: "2px 0 0 0", fontSize: "14px", color: "#6b7280" }}>{selectedImage.urls.thumbnail}</p>
                  </div>
                  <div className="variant-actions">
                    <button onClick={() => copyToClipboard(selectedImage.urls.thumbnail)} className="btn-secondary" style={{ padding: "6px 10px" }}><Copy size={16} strokeWidth={2.5} /></button>
                    <a href={selectedImage.urls.thumbnail} target="_blank" rel="noreferrer" className="btn-primary" style={{ padding: "6px 10px" }}><ExternalLink size={16} strokeWidth={2.5} /></a>
                  </div>
                </div>
              )}

              {selectedImage.urls.thumbnail150 && (
                <div className="glass-card variant-row" style={{ padding: "14px 18px", boxShadow: "2px 2px 0px #2d2d2d" }}>
                  <div className="variant-info">
                    <p style={{ margin: "0", fontSize: "16px", fontWeight: "700" }}>Small Thumbnail (150px)</p>
                    <p style={{ margin: "2px 0 0 0", fontSize: "14px", color: "#6b7280" }}>{selectedImage.urls.thumbnail150}</p>
                  </div>
                  <div className="variant-actions">
                    <button onClick={() => copyToClipboard(selectedImage.urls.thumbnail150)} className="btn-secondary" style={{ padding: "6px 10px" }}><Copy size={16} strokeWidth={2.5} /></button>
                    <a href={selectedImage.urls.thumbnail150} target="_blank" rel="noreferrer" className="btn-primary" style={{ padding: "6px 10px" }}><ExternalLink size={16} strokeWidth={2.5} /></a>
                  </div>
                </div>
              )}

              {selectedImage.urls.thumbnail64 && (
                <div className="glass-card variant-row" style={{ padding: "14px 18px", boxShadow: "2px 2px 0px #2d2d2d" }}>
                  <div className="variant-info">
                    <p style={{ margin: "0", fontSize: "16px", fontWeight: "700" }}>Avatar Thumbnail (64px)</p>
                    <p style={{ margin: "2px 0 0 0", fontSize: "14px", color: "#6b7280" }}>{selectedImage.urls.thumbnail64}</p>
                  </div>
                  <div className="variant-actions">
                    <button onClick={() => copyToClipboard(selectedImage.urls.thumbnail64)} className="btn-secondary" style={{ padding: "6px 10px" }}><Copy size={16} strokeWidth={2.5} /></button>
                    <a href={selectedImage.urls.thumbnail64} target="_blank" rel="noreferrer" className="btn-primary" style={{ padding: "6px 10px" }}><ExternalLink size={16} strokeWidth={2.5} /></a>
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: "32px", display: "flex", justifyContent: "space-between", gap: "12px" }}>
              <button onClick={() => deleteImage(selectedImage.id)} className="btn-secondary" style={{ color: "#ff4d4d", borderColor: "#2d2d2d" }}>
                <Trash2 size={16} strokeWidth={2.5} /> Delete Image
              </button>
              <button onClick={() => setSelectedImage(null)} className="btn-primary" style={{ minHeight: "38px", fontSize: "18px", padding: "8px 20px" }}>Close Details</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
