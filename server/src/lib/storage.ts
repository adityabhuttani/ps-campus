import { createClient } from "@supabase/supabase-js";

const BUCKET = "candidate-documents";
export type DocumentKind = "cv" | "assessment-report";

// The dashboard's Data API page shows a REST endpoint (".../rest/v1/"), which
// people naturally copy — but the SDK wants the bare project URL and appends
// the right path per service (Storage, Auth, REST) itself.
function normalizedProjectUrl(): string {
  const raw = process.env.SUPABASE_URL ?? "";
  return raw.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
}

const supabase = createClient(normalizedProjectUrl(), process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");

// One fixed object per candidate+kind (not timestamped) — a re-upload
// overwrites it via `upsert`, so there's never a stale duplicate sitting in
// the bucket and no separate DB column is needed to track the current key.
function storageKey(candidateId: string, kind: DocumentKind): string {
  return `${candidateId}/${kind}.pdf`;
}

export async function uploadDocument(candidateId: string, kind: DocumentKind, file: Buffer): Promise<void> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storageKey(candidateId, kind), file, { contentType: "application/pdf", upsert: true });
  if (error) throw error;
}

// Bucket is private, so every view goes through a freshly minted signed URL
// rather than a permanently guessable link — this is called once per click,
// not stored, and expires long before anyone could reuse it.
export async function getSignedDocumentUrl(candidateId: string, kind: DocumentKind): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storageKey(candidateId, kind), 60);
  if (error || !data) return null;
  return data.signedUrl;
}
