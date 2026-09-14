const ds = require('./dist/database/data-source.js').default;

async function run() {
  console.log('Registered migrations in DataSource:', ds.options.migrations ? ds.options.migrations.length : 0);
  console.log('Connecting to database...');
  await ds.initialize();
  console.log('Checking pending migrations...');
  const hasPending = await ds.showMigrations();
  console.log('Has pending migrations:', hasPending);
  console.log('Running migrations...');
  const migrations = await ds.runMigrations();
  console.log(`Executed ${migrations.length} migrations:`);
  for (const m of migrations) {
    console.log(` - ${m.name}`);
  }
  await ds.destroy();
  console.log('Done!');
}

run().catch((err) => {
  console.error('Migration error:', err);
  process.exit(1);
});
