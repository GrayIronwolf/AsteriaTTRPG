// Shared campaign-image upload contract for the Forge, GM workspace and Firebase.
export const CAMPAIGN_ARTWORK_MAX_BYTES = 8 * 1024 * 1024;
export const CAMPAIGN_ARTWORK_MIME_TYPES = Object.freeze(['image/png','image/jpeg','image/webp','image/gif']);
export function campaignArtworkFileError(file) {
  if (!file || typeof file !== 'object') return 'Choose an image file.';
  if (!CAMPAIGN_ARTWORK_MIME_TYPES.includes(String(file.type || '').toLowerCase())) {
    return 'Choose a PNG, JPG, WEBP or GIF image.';
  }
  if (!Number.isFinite(Number(file.size)) || Number(file.size) <= 0 || Number(file.size) > CAMPAIGN_ARTWORK_MAX_BYTES) {
    return 'Images must be larger than zero and no more than 8 MB.';
  }
  return '';
}
export function campaignArtworkImage(campaign = {}) {
  return [campaign.image, campaign.art, campaign.banner, campaign.coverImage, campaign.cover]
    .find(value => typeof value === 'string' && value.trim()) || '';
}
