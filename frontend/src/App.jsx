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
            "Content-Type": file.type
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
        <div className="glass-card" style={{ width: "100%", maxWidth: "400px", padding: "32px", boxSizing: "border-box" }}>
          <div style={{ textAlign: "center", marginBottom: "24px" }}>
            <div style={{ background: "linear-gradient(135deg, #00f2fe, #4facfe)", width: "50px", height: "50px", borderRadius: "12px", display: "inline-flex", justifyContent: "center", alignItems: "center", color: "#090d16", marginBottom: "12px" }}>
              <ImageIcon size={28} />
            </div>
            <h2 style={{ margin: "0 0 8px 0", fontSize: "24px", fontWeight: "700" }}>Cloud Image Optimizer</h2>
            <p style={{ margin: "0", color: "#9ca3af", fontSize: "14px" }}>Serverless image processing pipeline</p>
          </div>

          {authError && (
            <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "8px", padding: "12px", display: "flex", alignItems: "center", gap: "8px", color: "#f87171", fontSize: "14px", marginBottom: "16px" }}>
              <AlertCircle size={18} />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {authMode === "register" && (
              <div style={{ position: "relative" }}>
                <UserIcon size={18} style={{ position: "absolute", left: "14px", top: "14px", color: "#6b7280" }} />
                <input
                  type="text"
                  placeholder="Full Name"
                  className="input-field"
                  style={{ paddingLeft: "42px" }}
                  value={authForm.name}
                  onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                  required
                />
              </div>
            )}

            <div style={{ position: "relative" }}>
              <Mail size={18} style={{ position: "absolute", left: "14px", top: "14px", color: "#6b7280" }} />
              <input
                type="email"
                placeholder="Email Address"
                className="input-field"
                style={{ paddingLeft: "42px" }}
                value={authForm.email}
                onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                required
              />
            </div>

            <div style={{ position: "relative" }}>
              <Lock size={18} style={{ position: "absolute", left: "14px", top: "14px", color: "#6b7280" }} />
              <input
                type="password"
                placeholder="Password"
                className="input-field"
                style={{ paddingLeft: "42px" }}
                value={authForm.password}
                onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                required
              />
            </div>

            <button type="submit" className="btn-primary" style={{ width: "100%", marginTop: "8px" }}>
              {authMode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <div style={{ textAlign: "center", marginTop: "20px", fontSize: "14px" }}>
            {authMode === "login" ? (
              <p style={{ color: "#9ca3af", margin: "0" }}>
                New to the service?{" "}
                <span onClick={() => { setAuthMode("register"); setAuthError(""); }} style={{ color: "#00f2fe", cursor: "pointer", fontWeight: "500" }}>
                  Register
                </span>
              </p>
            ) : (
              <p style={{ color: "#9ca3af", margin: "0" }}>
                Already have an account?{" "}
                <span onClick={() => { setAuthMode("login"); setAuthError(""); }} style={{ color: "#00f2fe", cursor: "pointer", fontWeight: "500" }}>
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
      <header className="glass-card" style={{ padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ background: "linear-gradient(135deg, #00f2fe, #4facfe)", width: "38px", height: "38px", borderRadius: "8px", display: "flex", justifyContent: "center", alignItems: "center", color: "#090d16" }}>
            <ImageIcon size={20} />
          </div>
          <div>
            <h1 style={{ margin: "0", fontSize: "18px", fontWeight: "700" }}>Cloud Image Optimizer</h1>
            <p style={{ margin: "0", fontSize: "12px", color: "#9ca3af" }}>Spaces + Neon + Serverless</p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ textAlign: "right" }}>
            <p style={{ margin: "0", fontSize: "14px", fontWeight: "600" }}>{user?.name}</p>
            <p style={{ margin: "0", fontSize: "12px", color: "#6b7280" }}>{user?.email}</p>
          </div>
          <button onClick={logout} className="btn-secondary" style={{ padding: "8px 12px" }}>
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <div className="grid-2" style={{ gridTemplateColumns: "1fr 2fr", alignItems: "start" }}>
        {/* Upload Column */}
        <div className="glass-card" style={{ padding: "24px" }}>
          <h3 style={{ margin: "0 0 16px 0", fontSize: "18px" }}>Upload Original Image</h3>
          <p style={{ color: "#9ca3af", fontSize: "14px", margin: "0 0 20px 0" }}>
            Upload directly to DigitalOcean Spaces via S3 presigned URLs. Our serverless pipeline will automatically resize, convert to WebP, and generate thumbnails.
          </p>

          <label
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "200px",
              border: "2px dashed rgba(255,255,255,0.1)",
              borderRadius: "12px",
              cursor: "pointer",
              transition: "all 0.2s ease",
              position: "relative",
              overflow: "hidden"
            }}
            onDragOver={(e) => e.preventDefault()}
            className="uploader-box"
          >
            {uploading ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", padding: "20px", textAlign: "center" }}>
                <RefreshCw className="spin" size={32} style={{ color: "#00f2fe" }} />
                <span style={{ fontSize: "14px", fontWeight: "500" }}>{uploadProgress}</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                <Upload size={32} style={{ color: "#9ca3af", marginBottom: "8px" }} />
                <span style={{ fontSize: "14px", fontWeight: "600", color: "#e5e7eb" }}>Choose a file to upload</span>
                <span style={{ fontSize: "12px", color: "#6b7280" }}>Supports PNG, JPG, WEBP, TIFF</span>
              </div>
            )}
            <input type="file" style={{ display: "none" }} onChange={handleUpload} disabled={uploading} accept="image/*" />
          </label>
        </div>

        {/* Gallery Column */}
        <div className="glass-card" style={{ padding: "24px", minHeight: "350px" }}>
          <div className="flex-between" style={{ marginBottom: "20px" }}>
            <h3 style={{ margin: "0", fontSize: "18px" }}>Optimized Gallery</h3>
            <button onClick={fetchImages} className="btn-secondary" style={{ padding: "8px 12px" }} disabled={loading}>
              <RefreshCw size={16} className={loading ? "spin" : ""} />
            </button>
          </div>

          {loading && images.length === 0 ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "200px" }}>
              <RefreshCw size={24} className="spin" />
            </div>
          ) : images.length === 0 ? (
            <div style={{ textAlign: "center", padding: "64px 20px", color: "#6b7280" }}>
              <ImageIcon size={48} style={{ strokeWidth: 1, marginBottom: "12px" }} />
              <p style={{ margin: "0" }}>No images uploaded yet.</p>
            </div>
          ) : (
            <div className="grid-3">
              {images.map((img) => (
                <div
                  key={img.id}
                  className="glass-card"
                  style={{ overflow: "hidden", position: "relative", cursor: "pointer", border: "1px solid rgba(255,255,255,0.05)" }}
                  onClick={async () => {
                    // Fetch full detail when clicked
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
                  <div style={{ position: "absolute", top: "8px", right: "8px", zIndex: 2 }}>
                    <span className={`badge badge-${img.status.toLowerCase()}`}>
                      {img.status}
                    </span>
                  </div>

                  {/* Thumbnail / Image Preview */}
                  <div style={{ height: "160px", background: "#111827", display: "flex", justifyContent: "center", alignItems: "center", position: "relative" }}>
                    {img.status === "READY" && img.urls.thumbnail ? (
                      <img
                        src={img.urls.thumbnail}
                        alt="Optimized thumbnail"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : img.status === "FAILED" ? (
                      <div style={{ color: "#ef4444", textAlign: "center" }}>
                        <AlertCircle size={24} />
                        <p style={{ margin: "4px 0 0 0", fontSize: "12px" }}>Failed</p>
                      </div>
                    ) : (
                      <div style={{ color: "#9ca3af", textAlign: "center" }}>
                        <RefreshCw size={24} className="spin" />
                        <p style={{ margin: "4px 0 0 0", fontSize: "12px" }}>Processing</p>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ padding: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <span style={{ fontSize: "12px", textTransform: "uppercase", fontWeight: "600", color: "#6b7280" }}>
                        {img.extension} File
                      </span>
                      {img.status === "READY" && img.originalSize && img.optimizedSize && (
                        <span style={{ fontSize: "12px", fontWeight: "700", color: "#22c55e" }}>
                          -{((1 - img.optimizedSize / img.originalSize) * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <div className="flex-between">
                      <div>
                        <p style={{ margin: "0", fontSize: "13px", color: "#e5e7eb" }}>
                          Size: {formatSize(img.optimizedSize || img.originalSize)}
                        </p>
                      </div>
                      <button
                        onClick={(e) => deleteImage(img.id, e)}
                        style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", padding: "4px" }}
                        className="delete-btn"
                      >
                        <Trash2 size={14} />
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
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.85)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 10, padding: "20px" }}>
          <div className="glass-card" style={{ width: "100%", maxWidth: "800px", maxHeight: "90vh", overflowY: "auto", padding: "24px", position: "relative" }}>
            <button
              onClick={() => setSelectedImage(null)}
              style={{ position: "absolute", top: "16px", right: "16px", background: "rgba(255,255,255,0.05)", border: "none", width: "32px", height: "32px", borderRadius: "50%", color: "#fff", cursor: "pointer" }}
            >
              &times;
            </button>

            <h2 style={{ margin: "0 0 16px 0", fontSize: "20px" }}>Image Details & Variants</h2>

            {/* Compare Columns */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "24px" }}>
              <div>
                <p style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: "600", color: "#9ca3af" }}>Original Format ({selectedImage.extension})</p>
                <div style={{ height: "200px", background: "#111827", borderRadius: "8px", overflow: "hidden", display: "flex", justifyContent: "center", alignItems: "center" }}>
                  <img src={selectedImage.urls.original} alt="Original" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                </div>
                <div style={{ marginTop: "8px", fontSize: "13px" }}>
                  <p style={{ margin: "4px 0" }}>Width: {selectedImage.width || "N/A"} px</p>
                  <p style={{ margin: "4px 0" }}>Height: {selectedImage.height || "N/A"} px</p>
                  <p style={{ margin: "4px 0" }}>Size: {formatSize(selectedImage.originalSize)}</p>
                </div>
              </div>

              <div>
                <p style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: "600", color: "#9ca3af" }}>Optimized (WebP)</p>
                <div style={{ height: "200px", background: "#111827", borderRadius: "8px", overflow: "hidden", display: "flex", justifyContent: "center", alignItems: "center" }}>
                  {selectedImage.urls.optimized ? (
                    <img src={selectedImage.urls.optimized} alt="Optimized" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  ) : (
                    <span style={{ color: "#6b7280" }}>Processing...</span>
                  )}
                </div>
                <div style={{ marginTop: "8px", fontSize: "13px" }}>
                  <p style={{ margin: "4px 0" }}>Width: {selectedImage.width ? Math.min(selectedImage.width, 1280) : "N/A"} px</p>
                  <p style={{ margin: "4px 0" }}>Height: {selectedImage.height && selectedImage.width ? Math.round(selectedImage.height * (Math.min(selectedImage.width, 1280) / selectedImage.width)) : "N/A"} px</p>
                  <p style={{ margin: "4px 0" }}>Size: {formatSize(selectedImage.optimizedSize)}</p>
                </div>
              </div>
            </div>

            {/* Savings Banner */}
            {selectedImage.originalSize && selectedImage.optimizedSize && (
              <div style={{ background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.2)", borderRadius: "8px", padding: "12px", textAlign: "center", marginBottom: "24px", color: "#22c55e", fontWeight: "600" }}>
                🎉 Serverless pipeline saved {formatSize(selectedImage.originalSize - selectedImage.optimizedSize)} ({((1 - selectedImage.optimizedSize / selectedImage.originalSize) * 100).toFixed(1)}%) storage space!
              </div>
            )}

            {/* Links and Actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <h4 style={{ margin: "0", fontSize: "15px" }}>Deliverable Variants</h4>
              
              <div className="glass-card" style={{ padding: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={{ margin: "0", fontSize: "13px", fontWeight: "600" }}>Optimized Image (WebP)</p>
                  <p style={{ margin: "2px 0 0 0", fontSize: "11px", color: "#6b7280", maxWidth: "450px", overflow: "hidden", textOverflow: "ellipsis" }}>{selectedImage.urls.optimized}</p>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={() => copyToClipboard(selectedImage.urls.optimized)} className="btn-secondary" style={{ padding: "6px 10px" }}><Copy size={14} /></button>
                  <a href={selectedImage.urls.optimized} target="_blank" rel="noreferrer" className="btn-primary" style={{ padding: "6px 10px" }}><ExternalLink size={14} /></a>
                </div>
              </div>

              {selectedImage.urls.thumbnail && (
                <div className="glass-card" style={{ padding: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <p style={{ margin: "0", fontSize: "13px", fontWeight: "600" }}>Medium Thumbnail (300px)</p>
                    <p style={{ margin: "2px 0 0 0", fontSize: "11px", color: "#6b7280", maxWidth: "450px", overflow: "hidden", textOverflow: "ellipsis" }}>{selectedImage.urls.thumbnail}</p>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={() => copyToClipboard(selectedImage.urls.thumbnail)} className="btn-secondary" style={{ padding: "6px 10px" }}><Copy size={14} /></button>
                    <a href={selectedImage.urls.thumbnail} target="_blank" rel="noreferrer" className="btn-primary" style={{ padding: "6px 10px" }}><ExternalLink size={14} /></a>
                  </div>
                </div>
              )}

              {selectedImage.urls.thumbnail150 && (
                <div className="glass-card" style={{ padding: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <p style={{ margin: "0", fontSize: "13px", fontWeight: "600" }}>Small Thumbnail (150px)</p>
                    <p style={{ margin: "2px 0 0 0", fontSize: "11px", color: "#6b7280", maxWidth: "450px", overflow: "hidden", textOverflow: "ellipsis" }}>{selectedImage.urls.thumbnail150}</p>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={() => copyToClipboard(selectedImage.urls.thumbnail150)} className="btn-secondary" style={{ padding: "6px 10px" }}><Copy size={14} /></button>
                    <a href={selectedImage.urls.thumbnail150} target="_blank" rel="noreferrer" className="btn-primary" style={{ padding: "6px 10px" }}><ExternalLink size={14} /></a>
                  </div>
                </div>
              )}

              {selectedImage.urls.thumbnail64 && (
                <div className="glass-card" style={{ padding: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <p style={{ margin: "0", fontSize: "13px", fontWeight: "600" }}>Avatar Thumbnail (64px)</p>
                    <p style={{ margin: "2px 0 0 0", fontSize: "11px", color: "#6b7280", maxWidth: "450px", overflow: "hidden", textOverflow: "ellipsis" }}>{selectedImage.urls.thumbnail64}</p>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={() => copyToClipboard(selectedImage.urls.thumbnail64)} className="btn-secondary" style={{ padding: "6px 10px" }}><Copy size={14} /></button>
                    <a href={selectedImage.urls.thumbnail64} target="_blank" rel="noreferrer" className="btn-primary" style={{ padding: "6px 10px" }}><ExternalLink size={14} /></a>
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: "24px", display: "flex", justifyContent: "space-between" }}>
              <button onClick={() => deleteImage(selectedImage.id)} className="btn-secondary" style={{ color: "#ef4444", borderColor: "rgba(239,68,68,0.2)" }}>
                <Trash2 size={16} /> Delete Image
              </button>
              <button onClick={() => setSelectedImage(null)} className="btn-secondary">Close Details</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
