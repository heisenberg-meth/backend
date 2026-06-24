import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

const indexesToCreate = [
  {
    table: 'Invoice',
    columns: ['"tenantId"', '"createdBy"'],
    name: 'idx_invoice_tenant_createdby',
  },
  { table: 'Invoice', columns: ['"tenantId"', '"patientId"'], name: 'idx_invoice_tenant_patient' },
  { table: 'Invoice', columns: ['"tenantId"', '"branchId"'], name: 'idx_invoice_tenant_branch' },
  { table: 'Invoice', columns: ['"prescriptionId"'], name: 'idx_invoice_prescription' },
  { table: 'Sale', columns: ['"tenantId"', '"patientId"'], name: 'idx_sale_tenant_patient' },
  { table: 'Sale', columns: ['"tenantId"', '"soldBy"'], name: 'idx_sale_tenant_soldby' },
  { table: 'Sale', columns: ['"invoiceId"'], name: 'idx_sale_invoice' },
  {
    table: 'StockMovement',
    columns: ['"tenantId"', '"medicineId"', '"createdAt"'],
    name: 'idx_stock_movement_tenant_medicine_date',
  },
  {
    table: 'StockMovement',
    columns: ['"tenantId"', '"batchId"'],
    name: 'idx_stock_movement_tenant_batch',
  },
  {
    table: 'StockMovement',
    columns: ['"tenantId"', '"branchId"'],
    name: 'idx_stock_movement_tenant_branch',
  },
  { table: 'StockMovement', columns: ['"performedBy"'], name: 'idx_stock_movement_performedby' },
  {
    table: 'InventoryBatch',
    columns: ['"tenantId"', '"medicineId"'],
    name: 'idx_inventory_batch_tenant_medicine',
  },
  {
    table: 'InventoryBatch',
    columns: ['"tenantId"', '"supplierId"'],
    name: 'idx_inventory_batch_tenant_supplier',
  },
  {
    table: 'InventoryBatch',
    columns: ['"tenantId"', '"branchId"'],
    name: 'idx_inventory_batch_tenant_branch',
  },
  {
    table: 'InventoryBatch',
    columns: ['"purchaseInvoiceId"'],
    name: 'idx_inventory_batch_purchase_invoice',
  },
  {
    table: 'InventoryBatch',
    columns: ['"purchaseOrderItemId"'],
    name: 'idx_inventory_batch_po_item',
  },
  { table: 'Payment', columns: ['"tenantId"', '"createdAt"'], name: 'idx_payment_tenant_created' },
  { table: 'PaymentAllocation', columns: ['"tenantId"'], name: 'idx_payment_allocation_tenant' },
  { table: 'Return', columns: ['"tenantId"', '"createdBy"'], name: 'idx_return_tenant_createdby' },
  { table: 'ReturnItem', columns: ['"invoiceItemId"'], name: 'idx_return_item_invoice_item' },
  { table: 'ReturnItem', columns: ['"saleItemId"'], name: 'idx_return_item_sale_item' },
  {
    table: 'SalesReturn',
    columns: ['"tenantId"', '"createdBy"'],
    name: 'idx_sales_return_tenant_createdby',
  },
  { table: 'SalesReturn', columns: ['"invoiceId"'], name: 'idx_sales_return_invoice' },
  { table: 'SalesReturn', columns: ['"invoiceItemId"'], name: 'idx_sales_return_invoice_item' },
  { table: 'SalesReturn', columns: ['"saleId"'], name: 'idx_sales_return_sale' },
  { table: 'SalesReturn', columns: ['"saleItemId"'], name: 'idx_sales_return_sale_item' },
  { table: 'SalesReturn', columns: ['"batchId"'], name: 'idx_sales_return_batch' },
  {
    table: 'SupplierPayment',
    columns: ['"tenantId"', '"supplierId"'],
    name: 'idx_supplier_payment_tenant_supplier',
  },
  { table: 'SupplierPayment', columns: ['"createdBy"'], name: 'idx_supplier_payment_createdby' },
  { table: 'SupplierReturn', columns: ['"createdBy"'], name: 'idx_supplier_return_createdby' },
  {
    table: 'SupplierReturnItem',
    columns: ['"medicineId"'],
    name: 'idx_supplier_return_item_medicine',
  },
  {
    table: 'PatientCreditLedger',
    columns: ['"accountId"'],
    name: 'idx_patient_credit_ledger_account',
  },
  {
    table: 'PatientIdentityMap',
    columns: ['"internalPatientId"'],
    name: 'idx_patient_identity_map_internal',
  },
  {
    table: 'Notification',
    columns: ['"tenantId"', '"userId"'],
    name: 'idx_notification_tenant_user',
  },
  { table: 'SmsNotification', columns: ['"patientId"'], name: 'idx_sms_notification_patient' },
  { table: 'OnlineOrder', columns: ['"patientId"'], name: 'idx_online_order_patient' },
  { table: 'OnlineOrderItem', columns: ['"batchId"'], name: 'idx_online_order_item_batch' },
  { table: 'PurchaseOrder', columns: ['"userId"'], name: 'idx_purchase_order_user' },
  { table: 'PurchaseOrder', columns: ['"approvedBy"'], name: 'idx_purchase_order_approvedby' },
  {
    table: 'PurchaseOrderItem',
    columns: ['"medicineId"'],
    name: 'idx_purchase_order_item_medicine',
  },
  { table: 'GoodsReceiptNote', columns: ['"receivedBy"'], name: 'idx_grn_receivedby' },
  { table: 'GoodsReceiptNoteItem', columns: ['"grnId"'], name: 'idx_grn_item_grn' },
  { table: 'GoodsReceiptNoteItem', columns: ['"medicineId"'], name: 'idx_grn_item_medicine' },
  {
    table: 'InventoryReconciliation',
    columns: ['"branchId"'],
    name: 'idx_inventory_reconciliation_branch',
  },
  {
    table: 'InventoryReconciliation',
    columns: ['"medicineId"'],
    name: 'idx_inventory_reconciliation_medicine',
  },
  { table: 'InventorySyncLog', columns: ['"medicineId"'], name: 'idx_inventory_sync_log_medicine' },
  { table: 'DamagedStock', columns: ['"batchId"'], name: 'idx_damaged_stock_batch' },
  { table: 'DamagedStock', columns: ['"tenantId"'], name: 'idx_damaged_stock_tenant' },
  { table: 'QuarantinedBatch', columns: ['"batchId"'], name: 'idx_quarantined_batch' },
  { table: 'ExpiryAlert', columns: ['"batchId"'], name: 'idx_expiry_alert_batch' },
  { table: 'ExpiryAlert', columns: ['"medicineId"'], name: 'idx_expiry_alert_medicine' },
  {
    table: 'ExpiryRecommendation',
    columns: ['"batchId"'],
    name: 'idx_expiry_recommendation_batch',
  },
  {
    table: 'ExpiryRecommendation',
    columns: ['"tenantId"'],
    name: 'idx_expiry_recommendation_tenant',
  },
  {
    table: 'ExpiryRiskPrediction',
    columns: ['"batchId"'],
    name: 'idx_expiry_risk_prediction_batch',
  },
  {
    table: 'ExpiryRiskPrediction',
    columns: ['"branchId"'],
    name: 'idx_expiry_risk_prediction_branch',
  },
  {
    table: 'ExpiryRiskPrediction',
    columns: ['"medicineId"'],
    name: 'idx_expiry_risk_prediction_medicine',
  },
  { table: 'DemandForecast', columns: ['"branchId"'], name: 'idx_demand_forecast_branch' },
  {
    table: 'ForecastRecommendation',
    columns: ['"tenantId"'],
    name: 'idx_forecast_recommendation_tenant',
  },
  { table: 'Medicine', columns: ['"userId"'], name: 'idx_medicine_user' },
  { table: 'MedicineCategory', columns: ['"parentId"'], name: 'idx_medicine_category_parent' },
  {
    table: 'MedicineInventoryConfig',
    columns: ['"updatedBy"'],
    name: 'idx_medicine_inventory_config_updatedby',
  },
  {
    table: 'MedicinePriceHistory',
    columns: ['"changedBy"'],
    name: 'idx_medicine_price_history_changedby',
  },
  {
    table: 'MedicineStatusHistory',
    columns: ['"changedBy"'],
    name: 'idx_medicine_status_history_changedby',
  },
  {
    table: 'MedicineSubscription',
    columns: ['"medicineId"'],
    name: 'idx_medicine_subscription_medicine',
  },
  { table: 'BarcodeMapping', columns: ['"medicineId"'], name: 'idx_barcode_mapping_medicine' },
  { table: 'ImportJob', columns: ['"uploadedBy"'], name: 'idx_import_job_uploadedby' },
  { table: 'ImportJob', columns: ['"purchaseOrderId"'], name: 'idx_import_job_purchase_order' },
  {
    table: 'ImportExtractedItem',
    columns: ['"matchedMedicineId"'],
    name: 'idx_import_extracted_item_medicine',
  },
  { table: 'Warehouse', columns: ['"tenantId"'], name: 'idx_warehouse_tenant' },
  { table: 'WarehouseBin', columns: ['"warehouseId"'], name: 'idx_warehouse_bin_warehouse' },
  { table: 'ColdStorageLog', columns: ['"warehouseId"'], name: 'idx_cold_storage_log_warehouse' },
  { table: 'StockTransferItem', columns: ['"batchId"'], name: 'idx_stock_transfer_item_batch' },
  {
    table: 'StockTransferItem',
    columns: ['"transferId"'],
    name: 'idx_stock_transfer_item_transfer',
  },
  {
    table: 'StockTransfer',
    columns: ['"sourceBranchId"'],
    name: 'idx_stock_transfer_source_branch',
  },
  {
    table: 'StockTransfer',
    columns: ['"destinationBranchId"'],
    name: 'idx_stock_transfer_dest_branch',
  },
  { table: 'StockAlert', columns: ['"medicineId"'], name: 'idx_stock_alert_medicine' },
  { table: 'StockAlert', columns: ['"purchaseOrderId"'], name: 'idx_stock_alert_purchase_order' },
  { table: 'CreditNote', columns: ['"createdBy"'], name: 'idx_credit_note_createdby' },
  { table: 'RefundPayment', columns: ['"createdBy"'], name: 'idx_refund_payment_createdby' },
  { table: 'Expense', columns: ['"categoryId"'], name: 'idx_expense_category' },
  { table: 'Expense', columns: ['"createdBy"'], name: 'idx_expense_createdby' },
  {
    table: 'SettingsApproval',
    columns: ['"approvedBy"'],
    name: 'idx_settings_approval_approvedby',
  },
  {
    table: 'SettingsApproval',
    columns: ['"proposedBy"'],
    name: 'idx_settings_approval_proposedby',
  },
  { table: 'RefreshToken', columns: ['"userId"'], name: 'idx_refresh_token_user' },
  { table: 'MobileDevice', columns: ['"userId"'], name: 'idx_mobile_device_user' },
  { table: 'FileAsset', columns: ['"uploadedBy"'], name: 'idx_file_asset_uploadedby' },
  { table: 'BatchAuditLog', columns: ['"performedBy"'], name: 'idx_batch_audit_log_performedby' },
  {
    table: 'InvoiceAuditLog',
    columns: ['"performedBy"'],
    name: 'idx_invoice_audit_log_performedby',
  },
  { table: 'Transaction', columns: ['"userId"'], name: 'idx_transaction_user' },
  { table: 'OtpAuditLog', columns: ['"userId"'], name: 'idx_otp_audit_log_user' },
  {
    table: 'InpatientMedicationUsage',
    columns: ['"admissionId"'],
    name: 'idx_inpatient_medication_admission',
  },
  {
    table: 'InpatientMedicationUsage',
    columns: ['"medicineId"'],
    name: 'idx_inpatient_medication_medicine',
  },
  { table: 'PatientAdherence', columns: ['"refillId"'], name: 'idx_patient_adherence_refill' },
  {
    table: 'PatientRefillReminder',
    columns: ['"refillId"'],
    name: 'idx_patient_refill_reminder_refill',
  },
  {
    table: 'PatientRefillReminder',
    columns: ['"tenantId"'],
    name: 'idx_patient_refill_reminder_tenant',
  },
  { table: 'PatientReminder', columns: ['"medicineId"'], name: 'idx_patient_reminder_medicine' },
  {
    table: 'PatientPrescription',
    columns: ['"tenantId"'],
    name: 'idx_patient_prescription_tenant',
  },
  { table: 'TallyExport', columns: ['"tenantId"'], name: 'idx_tally_export_tenant' },
  { table: 'TenantDomain', columns: ['"tenantId"'], name: 'idx_tenant_domain_tenant' },
];

async function createIndexes() {
  console.log('\n🔧 CREATING MISSING INDEXES...');
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log(`   Total indexes to create: ${indexesToCreate.length}`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const idx of indexesToCreate) {
    try {
      if (!DRY_RUN) {
        await prisma.$executeRawUnsafe(
          `CREATE INDEX IF NOT EXISTS ${idx.name} ON "${idx.table}" (${idx.columns.join(', ')})`,
        );
      }
      created++;
      if (DRY_RUN) {
        console.log(
          `   [DRY RUN] Would create: ${idx.name} ON ${idx.table} (${idx.columns.join(', ')})`,
        );
      }
    } catch (error) {
      if (error.message.includes('already exists')) {
        skipped++;
      } else {
        errors++;
        console.error(`   ❌ Error creating ${idx.name}: ${error.message}`);
      }
    }
  }

  console.log(`\n   Summary:`);
  console.log(`     Created: ${created}`);
  console.log(`     Skipped (already exist): ${skipped}`);
  console.log(`     Errors: ${errors}`);
}

async function main() {
  console.log('🗄️  PHASE 6: DATABASE PERFORMANCE - ADD MISSING INDEXES');
  console.log('='.repeat(80));
  console.log(`Started at: ${new Date().toISOString()}`);

  try {
    await createIndexes();
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
