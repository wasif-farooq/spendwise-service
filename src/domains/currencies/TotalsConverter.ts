/** Rate for 1 unit of `from` in `to`; throws (or returns a non-positive number) when unknown. */
export type RateLookup = (from: string, to: string) => Promise<number>;

/**
 * Converts amounts in many currencies into one target for a total.
 *
 * A currency with no rate is *skipped* and reported in
 * `unconvertedCurrencies()`, never counted at a rate of 1 (which would count
 * 1 BTC as 1 USD). Each rate is looked up once per converter.
 */
export class TotalsConverter {
  private readonly rates = new Map<string, number | null>();
  private readonly missing = new Set<string>();

  constructor(
    readonly target: string,
    private readonly rateOf?: RateLookup,
  ) {}

  /** The amount in the target currency, or null when there's no rate. */
  async convert(amount: number, from: string | null | undefined): Promise<number | null> {
    const code = String(from || 'USD').toUpperCase();
    if (code === this.target.toUpperCase()) return amount;

    if (!this.rates.has(code)) {
      let rate: number | null = null;
      try {
        rate = this.rateOf ? await this.rateOf(code, this.target) : null;
      } catch {
        rate = null;
      }
      this.rates.set(code, rate !== null && Number.isFinite(rate) && rate > 0 ? rate : null);
    }

    const rate = this.rates.get(code);
    if (rate == null) {
      this.missing.add(code);
      return null;
    }
    return amount * rate;
  }

  /** Currencies left out of the totals, sorted. */
  unconvertedCurrencies(): string[] {
    return [...this.missing].sort();
  }
}

/** Two-decimal rounding for percentages (not money: use roundAmount for that). */
export const roundPercent = (value: number): number => Math.round(value * 100) / 100;
