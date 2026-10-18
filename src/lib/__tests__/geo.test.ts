import { isInsideGeojson, parsePolygons } from '@/lib/geo';

const square = { type: 'Polygon', coordinates: [[[101.4, 0.5], [101.43, 0.5], [101.43, 0.55], [101.4, 0.55], [101.4, 0.5]]] };
const withHole = {
  type: 'Polygon',
  coordinates: [
    square.coordinates[0],
    [[101.41, 0.51], [101.42, 0.51], [101.42, 0.52], [101.41, 0.52], [101.41, 0.51]],
  ],
};

describe('geo', () => {
  it('titik di dalam / di luar polygon (lat, lng)', () => {
    expect(isInsideGeojson(0.52, 101.415, square)).toBe(true);
    expect(isInsideGeojson(0.6, 101.415, square)).toBe(false);
  });
  it('lubang polygon dihitung di luar', () => {
    expect(isInsideGeojson(0.515, 101.415, withHole)).toBe(false);
    expect(isInsideGeojson(0.53, 101.415, withHole)).toBe(true);
  });
  it('MultiPolygon, Feature, dan string JSON', () => {
    const multi = { type: 'MultiPolygon', coordinates: [square.coordinates, [[[102, 1], [102.1, 1], [102.1, 1.1], [102, 1]]]] };
    expect(isInsideGeojson(1.02, 102.05, multi)).toBe(true);
    expect(isInsideGeojson(0.52, 101.415, JSON.stringify({ type: 'Feature', geometry: square }))).toBe(true);
  });
  it('polygon tidak tersedia/rusak → null (tidak dinilai)', () => {
    expect(isInsideGeojson(0.5, 101.4, null)).toBeNull();
    expect(isInsideGeojson(0.5, 101.4, '{rusak')).toBeNull();
    expect(parsePolygons({ type: 'Point', coordinates: [1, 2] })).toEqual([]);
  });
});
