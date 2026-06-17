import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

const remainingIndexes = [
  { table: '"AlertSettings"', columns: ['"userId"'], name: 'idx_alert_settings_user' },
  { table: '"AlertThresholdOverride"', columns: ['"branchId"'], name: 'idx_alert_threshold_override_branch' },
  { table: '"AuditLog"', columns: ['"userId"'], name: 'idx_audit_log_user' },
  { table: '"BranchPerformanceMetric"', columns: ['"branchId"'], name: 'idx_branch_performance_metric_branch' },
  { table: '"EscalationPolicy"', columns: ['"settingsId"'], name: 'idx_escalation_policy_settings' },
  { table: '"Medicine"', columns: ['"manufacturerId"'], name: 'idx_medicine_manufacturer' },
  { table: '"Notification"', columns: ['"patientId"'], name: 'idx_notification_patient' },
  { table: '"NotificationChannelConfig"', columns: ['"settingsId"'], name: 'idx_notification_channel_config_settings' },
  { table: '"OnlineOrderItem"', columns: ['"tenantId"'], name: 'idx_online_order_item_tenant' },
  { table: '"Prescription"', columns: ['"createdBy"'], name: 'idx_prescription_createdby' },
  { table: '"Prescription"', columns: ['"doctorId"'], name: 'idx_prescription_doctor' },
  { table: '"PrescriptionItem"', columns: ['"medicineId"'], name: 'idx_prescription_item_medicine' },
  { table: '"PrescriptionVerification"', columns: ['"verifiedBy"'], name: 'idx_prescription_verification_verifiedby' },
  { table: '"PurchaseOrderApproval"', columns: ['"approvedBy"'], name: 'idx_purchase_order_approval_approvedby' },
  { table: '"PurchaseOrderItem"', columns: ['"purchaseOrderId"'], name: 'idx_purchase_order_item_po' },
  { table: '"ReminderRule"', columns: ['"settingsId"'], name: 'idx_reminder_rule_settings' },
  { table: '"SaleItem"', columns: ['"batchId"'], name: 'idx_sale_item_batch' },
  { table: '"Subscription"', columns: ['"planId"'], name: 'idx_subscription_plan' },
  { table: '"SupplierCreditNote"', columns: ['"returnId"'], name: 'idx_supplier_credit_note_return' },
  { table: '"SupplierPaymentAllocation"', columns: ['"tenantId"'], name: 'idx_supplier_payment_allocation_tenant' },
  { table: '"SupplierReturn"', columns: ['"approvedBy"'], name: 'idx_supplier_return_approvedby' },
  { table: '"SupplierReturn"', columns: ['"batchId"'], name: 'idx_supplier_return_batch' },
  { table: '"SupplierReturn"', columns: ['"medicineId"'], name: 'idx_supplier_return_medicine' },
  { table: '"User"', columns: ['"branchId"'], name: 'idx_user_branch' },
  { table: '"User"', columns: ['"roleId"'], name: 'idx_user_role' },
];

async function createRemainingIndexes() {
  console.log('\n🔧 CREATING REMAINING INDEXES...');
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log(`   Total indexes to create: ${remainingIndexes.length}`);

  let created = 0;
  let errors = 0;

  for (const idx of remainingIndexes) {
    try {
      if (!DRY_RUN) {
        await prisma.$executeRawUnsafe(
          `CREATE INDEX IF NOT EXISTS ${idx.name} ON ${idx.table} (${idx.columns.join(', ')})`
        );
      }
      created++;
      if (DRY_RUN) {
        console.log(`   [DRY RUN] Would create: ${idx.name} ON ${idx.table} (${idx.columns.join(', ')})`);
      }
    } catch (error) {
      errors++;
      console.error(`   ❌ Error creating ${idx.name}: ${error.message}`);
    }
  }

  console.log(`\n   Summary:`);
  console.log(`     Created: ${created}`);
  console.log(`     Errors: ${errors}`);
}

async function main() {
  console.log('🗄️  PHASE 6: DATABASE PERFORMANCE - ADD REMAINING INDEXES');
  console.log('='.repeat(80));
  console.log(`Started at: ${new Date().toISOString()}`);

  try {
    await createRemainingIndexes();
  } catch (error) {
    console.error('Index creation failed:', error);
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ INDEX CREATION COMPLETE');
  console.log('='.repeat(80));
  console.log(`Completed at: ${new Date().toISOString()}`);
}

main();
