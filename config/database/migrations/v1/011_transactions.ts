import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('transactions', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('account_id').notNullable();
        table.uuid('user_id').notNullable();
        table.uuid('workspace_id').notNullable();
        table.string('type', 20).notNullable(); // income, expense, transfer
        table.decimal('amount', 15, 2).notNullable();
        table.string('currency', 3).notNullable();
        table.text('description');
        table.timestamp('date').notNullable();
        table.uuid('category_id');
        
        // For transfers
        table.uuid('to_account_id');
        table.decimal('exchange_rate', 15, 6);
        table.decimal('base_amount', 15, 2); // Amount in USD for conversions
        
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());

        // Indexes
        table.index('account_id');
        table.index('workspace_id');
        table.index(['account_id', 'created_at']); // For monthly counting
        table.index('date');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('transactions');
}
