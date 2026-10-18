/**
 * Utilitas geometri GeoJSON (Polygon/MultiPolygon, lubang didukung) untuk menandai
 * absen/transaksi di luar afdeling. Koordinat GeoJSON = [lng, lat].
 */
type Ring = number[][];
type PolygonCoords = Ring[];

function inRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(lng: number, lat: number, poly: PolygonCoords): boolean {
  const [outer, ...holes] = poly;
  if (!outer || !inRing(lng, lat, outer)) return false;
  return !holes.some((h) => inRing(lng, lat, h));
}

/** Parse GeoJSON (string/objek: Polygon, MultiPolygon, Feature) menjadi daftar polygon. */
export function parsePolygons(geojson: unknown): PolygonCoords[] {
  let g = geojson;
  if (typeof g === 'string') {
    try {
      g = JSON.parse(g);
    } catch {
      return [];
    }
  }
  if (!g || typeof g !== 'object') return [];
  const obj = g as { type?: string; coordinates?: unknown; geometry?: unknown };
  if (obj.type === 'Feature') return parsePolygons(obj.geometry);
  if (obj.type === 'Polygon' && Array.isArray(obj.coordinates)) return [obj.coordinates as PolygonCoords];
  if (obj.type === 'MultiPolygon' && Array.isArray(obj.coordinates)) return obj.coordinates as PolygonCoords[];
  return [];
}

/**
 * true/false bila titik di dalam/luar; null bila polygon tidak tersedia
 * (tidak bisa dinilai — jangan ditandai di luar).
 */
export function isInsideGeojson(lat: number, lng: number, geojson: unknown): boolean | null {
  const polys = parsePolygons(geojson);
  if (polys.length === 0) return null;
  return polys.some((p) => inPolygon(lng, lat, p));
}
