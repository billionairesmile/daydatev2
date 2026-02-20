const KAKAO_REST_API_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY || '';

interface ReverseGeocodeResult {
  locationName: string | null;
}

/**
 * Reverse geocode GPS coordinates to a human-readable address using Kakao Local API.
 * Returns area-level name (시/군/구 + 동/읍/면) for concise display.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<ReverseGeocodeResult> {
  if (!KAKAO_REST_API_KEY) {
    console.warn('[reverseGeocode] No Kakao API key configured');
    return { locationName: null };
  }

  try {
    const url = `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${longitude}&y=${latitude}`;
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
    });

    if (!res.ok) {
      console.warn('[reverseGeocode] API error:', res.status);
      return { locationName: null };
    }

    const data = await res.json();
    const docs = data.documents;

    if (!docs || docs.length === 0) {
      return { locationName: null };
    }

    // Prefer H (행정동) type over B (법정동) for user-friendly names
    const hDoc = docs.find((d: any) => d.region_type === 'H');
    const doc = hDoc || docs[0];

    // Build concise location: "서울 성수동" format
    const region1 = doc.region_1depth_name || ''; // 시/도
    const region3 = doc.region_3depth_name || ''; // 동/읍/면

    // Shorten city names: "서울특별시" → "서울", "경기도" → "경기"
    const shortRegion1 = region1
      .replace('특별시', '')
      .replace('광역시', '')
      .replace('특별자치시', '')
      .replace('특별자치도', '');

    const locationName = region3
      ? `${shortRegion1} ${region3}`
      : shortRegion1 || null;

    return { locationName: locationName?.trim() || null };
  } catch (error) {
    console.warn('[reverseGeocode] Error:', error);
    return { locationName: null };
  }
}
