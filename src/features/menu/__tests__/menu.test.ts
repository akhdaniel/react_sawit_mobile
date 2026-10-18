import { canAccess, menuForRoles } from '@/features/menu/menu';

const keys = (r: Parameters<typeof menuForRoles>[0]) => menuForRoles(r).map((m) => m.key);

describe('menu per peran', () => {
  it('mandor panen', () => {
    expect(keys(['mandor_panen'])).toEqual(['attendance', 'assignment', 'harvest', 'daily_report', 'sync']);
  });
  it('kerani transport hanya SPB + sinkron', () => {
    expect(keys(['kerani_transport'])).toEqual(['transport', 'sync']);
  });
  it('asisten mendapat persetujuan', () => {
    expect(keys(['asisten'])).toContain('approval');
    expect(canAccess('harvest', ['asisten'])).toBe(false);
  });
  it('gabungan peran tanpa duplikat', () => {
    const k = keys(['mandor_panen', 'mandor_rawat']);
    expect(new Set(k).size).toBe(k.length);
    expect(k).toEqual(expect.arrayContaining(['harvest', 'upkeep']));
  });
  it('tanpa peran tetap bisa sinkron', () => {
    expect(keys([])).toEqual(['sync']);
  });
});
