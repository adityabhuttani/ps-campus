import fs from "fs";
import path from "path";
import multer from "multer";

// Local disk storage for candidate CVs/assessment reports — this app isn't
// deployed yet, so a simple on-disk folder is enough for now. Revisit with
// real object storage (S3/Supabase Storage) before this ever runs on more
// than one server instance, since local disk won't survive a redeploy.
export const UPLOAD_DIR = path.join(__dirname, "../../uploads");

export function ensureUploadDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const uploadPdf = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `${req.params.id}-${file.fieldname}-${Date.now()}.pdf`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") return cb(new Error("Only PDF files are allowed"));
    cb(null, true);
  },
});
