import { findEmployeeByCard } from '@/db/repositories/employee';
import { applyMasterChanges } from '@/db/repositories/master';
import { decodeTextRecord, employeeRefFromTexts, normalizeUid } from '@/lib/nfc-parse';
import { masterResponseSchema } from '@/sync/contract';
import { createTestDb } from '@/test/db';
import { seedMaster } from '@/test/fixtures';

/** Bangun NDEF Text Record UTF-8 dengan kode bahasa "en". */
const textRecord = (text: string) => ({
  tnf: 1,
  type: [0x54],
  payload: [0x02, 0x65, 0x6e, ...Array.from(new TextEncoder().encode(text))],
});

describe('parsing kartu NFC', () => {
  it('UID dinormalisasi ke hex huruf besar', () => {
    expect(normalizeUid('04:a1:b2:c3')).toBe('04A1B2C3');
    expect(normalizeUid([4, 161, 178, 195])).toBe('04A1B2C3');
    expect(normalizeUid('')).toBeNull();
    expect(normalizeUid(undefined)).toBeNull();
  });

  it('dekode NDEF Text Record (termasuk karakter non-ASCII), abaikan record lain', () => {
    expect(decodeTextRecord(textRecord('XSM1|EMP|12|1401002'))).toBe('XSM1|EMP|12|1401002');
    expect(decodeTextRecord(textRecord('Sité'))).toBe('Sité');
    expect(decodeTextRecord({ tnf: 1, type: 'T', payload: [0x02, 0x69, 0x64, 0x41] })).toBe('A');
    expect(decodeTextRecord({ tnf: 1, type: [0x55], payload: [0x00, 0x41] })).toBeNull(); // URI
    expect(decodeTextRecord({ tnf: 2, type: [0x54], payload: [0x00] })).toBeNull();
  });

  it('referensi pekerja dari teks kartu', () => {
    expect(employeeRefFromTexts(['halo', 'XSM1|EMP|11|1401002'])).toEqual({ employeeId: 11, nik: '1401002' });
    expect(employeeRefFromTexts(['XSM1|EMP|11|'])).toEqual({ employeeId: 11, nik: undefined });
    expect(employeeRefFromTexts(['XSM1|SPB|x'])).toBeNull();
  });
});

describe('findEmployeeByCard', () => {
  function setup() {
    const { db } = createTestDb();
    seedMaster(db);
    applyMasterChanges(
      db,
      masterResponseSchema.parse({
        cursor: 'v2',
        server_time: '2026-10-18T00:00:00Z',
        changes: { employee: { upserts: [{ id: 10, nik: '1401001', name: 'Agus', type: 'SKU', gang_id: 1, active: true, nfc_uid: '04a10011a5b680' }] } },
      }).changes,
      'v2',
    );
    return db;
  }

  it('teks NDEF lebih dulu; NIK harus cocok', () => {
    const db = setup();
    expect(findEmployeeByCard(db, { uid: null, texts: ['XSM1|EMP|11|1401002'] })?.name).toBe('Budi');
    expect(findEmployeeByCard(db, { uid: null, texts: ['XSM1|EMP|11|9999'] })).toBeNull();
  });

  it('fallback UID terdaftar di master (tidak peka huruf)', () => {
    const db = setup();
    expect(findEmployeeByCard(db, { uid: '04A10011A5B680', texts: [] })?.name).toBe('Agus');
    expect(findEmployeeByCard(db, { uid: '04a10011a5b680', texts: [] })?.name).toBe('Agus');
    expect(findEmployeeByCard(db, { uid: 'DEADBEEF', texts: [] })).toBeNull();
  });
});
