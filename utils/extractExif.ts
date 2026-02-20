import * as MediaLibrary from 'expo-media-library';

export interface PhotoMetadata {
  takenAt: string | null;      // ISO date string
  latitude: number | null;
  longitude: number | null;
}

/**
 * Extract EXIF metadata from a media library asset.
 * Uses expo-media-library's getAssetInfoAsync for reliable EXIF extraction.
 */
export async function extractPhotoMetadata(assetId: string): Promise<PhotoMetadata> {
  try {
    const info = await MediaLibrary.getAssetInfoAsync(assetId);

    // GPS location
    const latitude = info.location?.latitude ?? null;
    const longitude = info.location?.longitude ?? null;

    // Taken date - prefer EXIF creation date, fall back to asset creation date
    let takenAt: string | null = null;
    if (info.creationTime) {
      takenAt = new Date(info.creationTime).toISOString();
    }

    return { takenAt, latitude, longitude };
  } catch (error) {
    console.warn('[extractExif] Failed to extract metadata:', error);
    return { takenAt: null, latitude: null, longitude: null };
  }
}

/**
 * Extract metadata from multiple assets in parallel.
 */
export async function extractMultiplePhotoMetadata(
  assetIds: string[]
): Promise<PhotoMetadata[]> {
  return Promise.all(assetIds.map(id => extractPhotoMetadata(id)));
}
