// Mirrors backend/src/utils/upload.js's own constants exactly — kept in
// sync by hand since the two ends can't share a module, but this is what
// requirement #4 means by enforcing the existing limit client-side before
// a direct upload starts (the backend still re-checks after, via
// assertUploadedSizeOk, since a client-side check is never a real
// guarantee).
export const IMAGE_DOC_MAX_SIZE = 10 * 1024 * 1024;
export const CHAT_VIDEO_MAX_SIZE = 100 * 1024 * 1024;

// Uploads a file straight from the browser to Cloudinary, bypassing the
// Vercel -> Railway proxy entirely for the actual file bytes. That proxy
// hard-fails (502, before the request ever reaches the backend) on any
// request body over ~4.3MB — this is the fix: only a small JSON signature
// request and, after this, a small JSON "here's what I uploaded" report
// still cross the proxy at all.
//
// `getSignature` is whichever portal's own signature-fetching API call
// (client.js / portalApi.js / staffApi.js each hit their own auth-guarded
// endpoint) — this function doesn't know or care which. It must resolve to
// { signature, timestamp, apiKey, cloudName, folder }.
//
// maxSizeBytes mirrors the backend's own IMAGE_DOC_MAX_SIZE/
// CHAT_VIDEO_MAX_SIZE — checked here first so an oversized file never even
// starts uploading, and again server-side (assertUploadedSizeOk) once this
// reports back, since a client-side check alone is never a real guarantee.
export async function uploadFileDirectToCloudinary(file, getSignature, maxSizeBytes) {
  if (maxSizeBytes && file.size > maxSizeBytes) {
    throw new Error(`File must be under ${Math.round(maxSizeBytes / (1024 * 1024))}MB`)
  }

  const { signature, timestamp, apiKey, cloudName, folder } = await getSignature()

  const form = new FormData()
  form.append('file', file)
  form.append('timestamp', timestamp)
  form.append('signature', signature)
  form.append('api_key', apiKey)
  form.append('folder', folder)

  // "auto" lets Cloudinary classify image/video/raw itself, same as the
  // server-side uploadToCloudinary this replaces — resource_type has to be
  // in the URL path for the direct API, not a signed form field.
  let res
  try {
    res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
      method: 'POST',
      body: form,
    })
  } catch {
    throw new Error('Could not reach Cloudinary — check your connection and try again.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Failed to upload file — please try again.')
  }

  return {
    url: data.secure_url,
    publicId: data.public_id,
    resourceType: data.resource_type,
    bytes: data.bytes,
    fileName: file.name,
    mimeType: file.type,
  }
}
