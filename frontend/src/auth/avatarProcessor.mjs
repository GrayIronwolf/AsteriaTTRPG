import { avatarUploadError } from '../../../src/state/accountProfileEdit.mjs';

/** Identical 512px WEBP crop and 2 MB Storage contract as the existing site. */
export async function cropAccountAvatar(file) {
  const error = avatarUploadError(file);
  if (error) throw new Error(error);
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined')
    throw new Error('Image editing is not available on this browser.');
  const image = await createImageBitmap(file);
  try {
    if (!image.width || !image.height) throw new Error('Invalid image dimensions.');
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image editing is not available on this browser.');
    const source = Math.min(image.width, image.height);
    context.drawImage(image, (image.width - source) / 2,
      (image.height - source) / 2, source, source, 0, 0, 512, 512);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.85));
    if (!blob || blob.size <= 0 || blob.size > 2 * 1024 * 1024)
      throw new Error('Profile image could not be prepared.');
    return blob;
  } finally {
    image.close?.();
  }
}
