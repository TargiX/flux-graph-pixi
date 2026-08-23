export type JsonBodyError = {
  error: string;
  ok: false;
  status: 400 | 413;
};

export type JsonBodySuccess<T> = {
  ok: true;
  value: T;
};

export type JsonBodyResult<T> = JsonBodyError | JsonBodySuccess<T>;

export const defaultJsonBodyLimit = 64 * 1024;

export async function readJsonBody<T>(
  request: Request,
  maxBytes = defaultJsonBodyLimit,
): Promise<JsonBodyResult<T>> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { error: `JSON body must be ${maxBytes} bytes or smaller.`, ok: false, status: 413 };
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    return { error: `JSON body must be ${maxBytes} bytes or smaller.`, ok: false, status: 413 };
  }

  if (!text.trim()) {
    return { error: "A JSON body is required.", ok: false, status: 400 };
  }

  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    return { error: "The request body must be valid JSON.", ok: false, status: 400 };
  }
}
