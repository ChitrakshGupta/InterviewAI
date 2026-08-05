import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export interface CloudinaryUploadResult {
  url: string;        // https:// secure URL
  publicId: string;   // e.g. "ai-interview/resumes/resume-abc123"
}

/**
 * Upload a file buffer to Cloudinary.
 * @param buffer   Raw file bytes (from multer memoryStorage)
 * @param options  Cloudinary upload options (folder, resource_type, etc.)
 */
export const uploadToCloudinary = (
  buffer: Buffer,
  options: {
    folder: string;
    resource_type?: 'image' | 'raw' | 'auto';
    public_id?: string;
    format?: string;
  }
): Promise<CloudinaryUploadResult> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder,
        resource_type: options.resource_type ?? 'auto',
        ...(options.public_id ? { public_id: options.public_id } : {}),
        ...(options.format ? { format: options.format } : {}),
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('Cloudinary upload failed'));
          return;
        }
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
        });
      }
    );
    uploadStream.end(buffer);
  });
};

/**
 * Delete a file from Cloudinary by its public ID.
 * Silently ignores errors (e.g. file already gone).
 */
export const deleteFromCloudinary = async (
  publicId: string,
  resourceType: 'image' | 'raw' | 'auto' = 'image'
): Promise<void> => {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (err) {
    console.warn(`[Cloudinary] Could not delete "${publicId}":`, err);
  }
};
