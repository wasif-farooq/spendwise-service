import {
  dustUnits,
  fromUnits,
  rawToUnits,
  toDecimalString,
  toUnits,
} from '@domains/connections/providers/decimal';

describe('toDecimalString', () => {
  it('converts smallest units exactly, without floats', () => {
    expect(toDecimalString(1245000000000000000n, 18)).toBe('1.245');
    expect(toDecimalString('820500000', 6)).toBe('820.5');
    expect(toDecimalString('1', 18)).toBe('0.000000000000000001');
    expect(toDecimalString(0, 8)).toBe('0');
    expect(toDecimalString('123456789012345678901234567890', 18)).toBe(
      '123456789012.34567890123456789',
    );
    expect(toDecimalString(-150000000n, 8)).toBe('-1.5');
    expect(toDecimalString(42, 0)).toBe('42');
  });

  it('rejects non-integers', () => {
    expect(() => toDecimalString('1.5', 8)).toThrow();
    expect(() => toDecimalString(Number.MAX_SAFE_INTEGER + 2, 8)).toThrow();
  });
});

describe('ledger units (8 decimals)', () => {
  it('rounds half away from zero at the 8th decimal', () => {
    expect(fromUnits(toUnits('0.039869364'))).toBe('0.03986936');
    expect(fromUnits(toUnits('0.039869365'))).toBe('0.03986937');
    expect(fromUnits(toUnits('-0.000000005'))).toBe('-0.00000001');
    expect(fromUnits(toUnits('1200'))).toBe('1200.00000000');
  });

  it('sums exactly', () => {
    const total = ['0.1', '0.2', '0.00000001'].map(toUnits).reduce((a, b) => a + b, 0n);
    expect(fromUnits(total)).toBe('0.30000001');
    expect(rawToUnits('1500000000000000000', 18)).toBe(150000000n);
  });

  it('knows the dust thresholds', () => {
    expect(dustUnits('crypto')).toBe(1n);
    expect(dustUnits('fiat')).toBe(1000000n);
  });
});
