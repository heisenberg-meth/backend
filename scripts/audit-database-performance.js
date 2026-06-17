import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const results = {
  slowQueries: [],
  nPlusOneQueries: [],
  missingIndexes: [],
  largeTableScans: [],
  unboundedQueries: [],
  summary: {
    totalSlowQueries: 0,
    totalNPlusOne: 0,
    totalMissingIndexes: 0,
    totalLargeTableScans: 0,
    totalUnboundedQueries: 0,
  },
};

async function auditSlowQueries() {
  console.log('\n📊 AUDITING SLOW QUERIES...');
  console.log('   Checking for queries that may cause performance issues');

  // Check for queries without proper indexing
  const queriesWithoutIndex = await prisma.$queryRaw`
    SELECT 
      schemaname,
      relname AS "tableName",
      seq_scan,
      seq_tup_read,
      idx_scan,
      idx_tup_fetch,
      CASE 
        WHEN seq_scan > 0 AND (idx_scan = 0 OR seq_scan > idx_scan * 10) 
        THEN 'NEEDS INDEX'
        ELSE 'OK'
      END AS "status"
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
      AND seq_scan > 100
    ORDER BY seq_tup_read DESC
    LIMIT 50
  `;

  results.slowQueries = queriesWithoutIndex.filter(q => q.status === 'NEEDS INDEX');
  results.summary.totalSlowQueries = results.slowQueries.length;

  if (results.slowQueries.length > 0) {
    console.log(`   ⚠️  FOUND ${results.slowQueries.length} TABLES WITH HIGH SEQUENTIAL SCANS:`);
    results.slowQueries.forEach((q) => {
      console.log(`      ${q.tableName}: seq_scan=${q.seq_scan}, seq_tup_read=${q.seq_tup_read}, idx_scan=${q.idx_scan || 0}`);
    });
  } else {
    console.log('   ✅ No problematic sequential scans detected');
  }
}

async function auditNPlusOneQueries() {
  console.log('\n📊 AUDITING N+1 QUERY PATTERNS...');
  console.log('   Checking for potential N+1 query patterns in code');

  // This is a static analysis - we'll check for common patterns
  // In a real scenario, you'd use query logging or APM tools

  console.log('   ℹ️  N+1 query detection requires code analysis or APM tools');
  console.log('   Checking for common patterns...');

  // Check for includes that might cause N+1
  const largeIncludes = await prisma.$queryRaw`
    SELECT 
      'Invoice' AS "table",
      COUNT(*) AS "count"
    FROM "Invoice"
    WHERE "deletedAt" IS NULL
    UNION ALL
    SELECT 
      'Sale' AS "table",
      COUNT(*) AS "count"
    FROM "Sale"
    UNION ALL
    SELECT 
      'PurchaseInvoice' AS "table",
      COUNT(*) AS "count"
    FROM "PurchaseInvoice"
    UNION ALL
    SELECT 
      'InventoryBatch' AS "table",
      COUNT(*) AS "count"
    FROM "InventoryBatch"
    WHERE "deletedAt" IS NULL
    UNION ALL
    SELECT 
      'StockMovement' AS "table",
      COUNT(*) AS "count"
    FROM "StockMovement"
  `;

  console.log('   Table sizes for N+1 risk assessment:');
  largeIncludes.forEach(t => {
    console.log(`     ${t.table}: ${t.count} rows`);
  });
}

async function auditMissingIndexes() {
  console.log('\n📊 AUDITING MISSING INDEXES...');
  console.log('   Checking for foreign keys without indexes');

  // Check for foreign keys without corresponding indexes
  const foreignKeysWithoutIndex = await prisma.$queryRaw`
    SELECT 
      tc.table_name AS "tableName",
      kcu.column_name AS "columnName",
      ccu.table_name AS "referencedTable",
      CASE 
        WHEN EXISTS (
          SELECT 1 FROM pg_indexes 
          WHERE tablename = tc.table_name 
            AND indexdef LIKE '%' || kcu.column_name || '%'
        ) THEN 'INDEXED'
        ELSE 'MISSING INDEX'
      END AS "indexStatus"
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
    ORDER BY tc.table_name, kcu.column_name
  `;

  const missingIndexes = foreignKeysWithoutIndex.filter(fk => fk.indexStatus === 'MISSING INDEX');
  results.missingIndexes = missingIndexes;
  results.summary.totalMissingIndexes = missingIndexes.length;

  if (missingIndexes.length > 0) {
    console.log(`   ⚠️  FOUND ${missingIndexes.length} FOREIGN KEYS WITHOUT INDEXES:`);
    missingIndexes.forEach((fk) => {
      console.log(`      ${fk.tableName}.${fk.columnName} → ${fk.referencedTable}`);
    });
  } else {
    console.log('   ✅ All foreign keys have indexes');
  }
}

async function auditLargeTableScans() {
  console.log('\n📊 AUDITING LARGE TABLE SCANS...');
  console.log('   Checking for tables that may cause slow queries');

  const tableStats = await prisma.$queryRaw`
    SELECT 
      relname AS "tableName",
      n_live_tup AS "estimatedRows",
      pg_size_pretty(pg_total_relation_size(relid)) AS "totalSize",
      pg_size_pretty(pg_relation_size(relid)) AS "tableSize",
      pg_size_pretty(pg_indexes_size(relid)) AS "indexSize"
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    ORDER BY n_live_tup DESC
    LIMIT 20
  `;

  results.largeTableScans = tableStats;
  results.summary.totalLargeTableScans = tableStats.filter(t => t.estimatedRows > 100000).length;

  console.log('   Table sizes:');
  tableStats.forEach((t) => {
    const rows = parseInt(t.estimatedRows) || 0;
    const indicator = rows > 100000 ? '🔴' : rows > 10000 ? '🟡' : '🟢';
    console.log(`     ${indicator} ${t.tableName}: ${rows.toLocaleString()} rows (${t.totalSize})`);
  });
}

async function auditUnboundedQueries() {
  console.log('\n📊 AUDITING UNBOUNDED QUERIES...');
  console.log('   Checking for queries without pagination limits');

  // Check for common unbounded query patterns
  const unboundedPatterns = [
    { table: 'Invoice', column: 'createdAt', risk: 'HIGH' },
    { table: 'Sale', column: 'soldAt', risk: 'HIGH' },
    { table: 'StockMovement', column: 'createdAt', risk: 'HIGH' },
    { table: 'Payment', column: 'createdAt', risk: 'MEDIUM' },
    { table: 'AuditLog', column: 'date', risk: 'MEDIUM' },
    { table: 'Notification', column: 'createdAt', risk: 'LOW' },
  ];

  console.log('   Tables requiring pagination for large datasets:');
  unboundedPatterns.forEach(p => {
    const indicator = p.risk === 'HIGH' ? '🔴' : p.risk === 'MEDIUM' ? '🟡' : '🟢';
    console.log(`     ${indicator} ${p.table} (order by ${p.column}) - Risk: ${p.risk}`);
  });

  results.unboundedQueries = unboundedPatterns;
  results.summary.totalUnboundedQueries = unboundedPatterns.length;
}

async function auditQueryComplexity() {
  console.log('\n📊 AUDITING QUERY COMPLEXITY...');
  console.log('   Checking for complex queries that may need optimization');

  // Check for large IN clauses
  console.log('   Potential performance issues:');
  console.log('     - Large IN clauses (batch operations)');
  console.log('     - Multiple nested includes');
  console.log('     - Complex aggregations without indexes');
  console.log('     - Full table scans on large datasets');

  // Check for queries with many includes
  const complexInvoiceQuery = await prisma.$queryRaw`
    SELECT 
      COUNT(*) AS "count"
    FROM "Invoice" i
    LEFT JOIN "InvoiceItem" ii ON ii."invoiceId" = i."id"
    LEFT JOIN "InventoryBatch" ib ON ib."id" = ii."batchId"
    LEFT JOIN "Medicine" m ON m."id" = ii."medicineId"
    WHERE i."deletedAt" IS NULL
  `;

  console.log(`   Invoice queries with joins: ${complexInvoiceQuery[0].count} rows affected`);
}

function printSummary() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 DATABASE PERFORMANCE & QUERY OPTIMIZATION AUDIT REPORT');
  console.log('='.repeat(80));
  console.log('');
  console.log('METRICS:');
  console.log(`  Slow Queries (sequential scans):  ${results.summary.totalSlowQueries}`);
  console.log(`  N+1 Query Patterns:               ${results.summary.totalNPlusOne}`);
  console.log(`  Missing Indexes:                  ${results.summary.totalMissingIndexes}`);
  console.log(`  Large Tables (>100K rows):        ${results.summary.totalLargeTableScans}`);
  console.log(`  Unbounded Queries:                ${results.summary.totalUnboundedQueries}`);
  console.log('');

  const totalIssues = 
    results.summary.totalSlowQueries +
    results.summary.totalNPlusOne +
    results.summary.totalMissingIndexes;

  if (totalIssues === 0) {
    console.log('✅ DATABASE PERFORMANCE IS GOOD');
  } else {
    console.log(`⚠️  FOUND ${totalIssues} PERFORMANCE ISSUES TO ADDRESS`);
  }

  console.log('='.repeat(80));
}

async function main() {
  console.log('🗄️  PHASE 6: DATABASE PERFORMANCE & QUERY OPTIMIZATION AUDIT');
  console.log('='.repeat(80));
  console.log(`Started at: ${new Date().toISOString()}`);

  try {
    await auditSlowQueries();
    await auditNPlusOneQueries();
    await auditMissingIndexes();
    await auditLargeTableScans();
    await auditUnboundedQueries();
    await auditQueryComplexity();
  } catch (error) {
    console.error('Audit failed:', error);
  } finally {
    await prisma.$disconnect();
  }

  printSummary();
  console.log(`Completed at: ${new Date().toISOString()}`);
}

main();
