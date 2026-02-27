#!/usr/bin/env ts-node
import { DatabaseFacade } from '../facades/DatabaseFacade';
import { PostgresFactory } from '../database/factories/PostgresFactory';
import { ExchangeRateRepository } from '../domains/exchange-rates/repositories/ExchangeRateRepository';
import { ExchangeRateService } from '../domains/exchange-rates/services/ExchangeRateService';

async function main() {
    const command = process.argv[2] || 'fetch';
    
    console.log(`\n🪙 Exchange Rates CLI - Command: ${command}\n`);
    
    const db = new DatabaseFacade(new PostgresFactory());
    const repository = new ExchangeRateRepository(db);
    const service = new ExchangeRateService(repository);
    
    try {
        switch (command) {
            case 'fetch':
                console.log('📥 Fetching latest exchange rates...\n');
                const result = await service.fetchAllRates();
                
                console.log('Results:');
                result.results.forEach(r => {
                    console.log(`  ${r.baseCurrency}: ${r.count} rates - ${r.success ? '✅' : '❌'}`);
                    if (r.errors) {
                        r.errors.forEach(e => console.log(`    - ${e}`));
                    }
                });
                
                console.log(`\n✅ Fetch complete!`);
                break;
                
            case 'fetch:usd':
                console.log('📥 Fetching USD rates...');
                const usdResult = await service.fetchAndStoreRates('USD');
                console.log(`✅ Fetched ${usdResult.count} rates for USD`);
                break;
                
            case 'rates':
                const base = process.argv[3] || 'USD';
                console.log(`📊 Getting stored rates for ${base}...`);
                const rates = await service.getRates(base);
                console.log(`\nFound ${rates.length} rates:`);
                rates.slice(0, 10).forEach(r => {
                    console.log(`  ${r.baseCurrency} → ${r.targetCurrency}: ${r.rate}`);
                });
                if (rates.length > 10) {
                    console.log(`  ... and ${rates.length - 10} more`);
                }
                break;
                
            case 'convert':
                const amount = parseFloat(process.argv[3] || '100');
                const from = process.argv[4] || 'USD';
                const to = process.argv[5] || 'EUR';
                console.log(`💱 Converting ${amount} ${from} to ${to}...`);
                const converted = await service.convert(amount, from, to);
                console.log(`\n✅ Result: ${converted.convertedAmount.toFixed(2)} ${to}`);
                console.log(`   Rate: ${converted.rate}`);
                break;
                
            case 'help':
            default:
                console.log(`
🪙 Exchange Rates CLI Commands:

  fetch           Fetch rates for all base currencies (USD, EUR, GBP)
  fetch:usd      Fetch rates for USD only
  rates [base]   Show stored rates (default: USD)
  convert <amount> <from> <to>
                  Convert amount (e.g., convert 100 USD EUR)
  help            Show this help message

Examples:
  npm run cli -- fetch
  npm run cli -- rates EUR
  npm run cli -- convert 500 USD EUR
`);
                break;
        }
    } catch (error: any) {
        console.error(`\n❌ Error: ${error.message}`);
        process.exit(1);
    }
    
    process.exit(0);
}

main();
