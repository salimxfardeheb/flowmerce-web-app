// lib/storage.ts
import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const BUCKET = "documents";

export async function uploadFile(
  fileBuffer: Buffer,
  path: string,
  contentType: string,
) {
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, fileBuffer, {
      contentType,
      upsert: false,
    });
  if (error) throw error;
  return path;
}

export async function getSignedUrl(path: string, expiresIn = 3600) {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteFile(path: string) {
  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
