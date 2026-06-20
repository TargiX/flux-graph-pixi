import { createClient } from "@supabase/supabase-js";

const ROOMBOARD_UPLOAD_BUCKET = process.env.ROOMBOARD_UPLOAD_BUCKET ?? "roomboard-uploads";
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

type UploadResult = {
  mode: "data-url" | "supabase";
  url: string;
};

function getUploadClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
    },
  });
}

function extensionForType(type: string) {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/gif") return "gif";
  if (type === "image/webp") return "webp";
  return "image";
}

export async function uploadRoomImage(file: File, roomId: string): Promise<UploadResult> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Only JPEG, PNG, GIF, and WebP images are supported.");
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    throw new Error("Images must be smaller than 10MB.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const supabase = getUploadClient();

  if (!supabase) {
    const base64 = Buffer.from(bytes).toString("base64");
    return {
      mode: "data-url",
      url: `data:${file.type};base64,${base64}`,
    };
  }

  const extension = extensionForType(file.type);
  const storagePath = `${roomId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(ROOMBOARD_UPLOAD_BUCKET).upload(storagePath, bytes, {
    cacheControl: "31536000",
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from(ROOMBOARD_UPLOAD_BUCKET).getPublicUrl(storagePath);

  return {
    mode: "supabase",
    url: data.publicUrl,
  };
}
