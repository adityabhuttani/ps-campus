import multer from "multer";

// Parses the multipart upload into memory (req.file.buffer) rather than
// writing to local disk — the buffer is handed straight to Supabase Storage
// in the route handler, so nothing ever touches this server's filesystem.
export const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") return cb(new Error("Only PDF files are allowed"));
    cb(null, true);
  },
});
