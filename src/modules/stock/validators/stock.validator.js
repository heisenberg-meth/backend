/**
 * Fastify validation & OpenAPI schemas for Stock endpoints.
 */

const errorResponseSchema = {
  type: 'object',
  properties: {
    statusCode: { type: 'integer' },
    code: { type: 'string' },
    message: { type: 'string' },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field: { type: 'string' },
          message: { type: 'string' },
        },
      },
    },
  },
};

export const stockInSchema = {
  tags: ['Stock'],
  summary: 'Record stock inbound (purchase/receiving)',
  description:
    'Records inbound stock for a medicine batch, creates the batch record and ledger transaction, and updates aggregate inventory.',
  body: {
    type: 'object',
    required: ['medicineId', 'batchNumber', 'quantity', 'expiryDate'],
    properties: {
      medicineId: { type: 'string', minLength: 1, description: 'ID of the medicine' },
      batchNumber: { type: 'string', minLength: 1, maxLength: 100, description: 'Batch number' },
      quantity: { type: 'integer', minimum: 1, description: 'Quantity received' },
      expiryDate: { type: 'string', description: 'Expiry date (ISO string or YYYY-MM-DD)' },
      branchId: { type: 'string', description: 'Optional target branch ID' },
      manufacturingDate: {
        type: 'string',
        description: 'Optional manufacturing date (ISO string or YYYY-MM-DD)',
      },
      purchasePrice: {
        type: 'number',
        minimum: 0,
        default: 0,
        description: 'Purchase price per unit',
      },
      sellingPrice: {
        type: 'number',
        minimum: 0,
        default: 0,
        description: 'Selling price per unit',
      },
      mrp: { type: 'number', minimum: 0, description: 'Maximum retail price per unit' },
      supplierId: { type: 'string', description: 'Optional supplier ID' },
      referenceType: {
        type: 'string',
        description: 'Reference document type (e.g. PURCHASE, MANUAL)',
      },
      referenceId: { type: 'string', description: 'Optional reference ID (e.g. invoice or PO ID)' },
      notes: { type: 'string', maxLength: 500, description: 'Optional notes' },
    },
    additionalProperties: true,
  },
  response: {
    201: {
      type: 'object',
      description: 'Successfully created batch and recorded stock movement',
      properties: {
        id: { type: 'string' },
        tenantId: { type: 'string' },
        branchId: { type: ['string', 'null'] },
        medicineId: { type: 'string' },
        batchNumber: { type: 'string' },
        quantity: { type: 'integer' },
        receivedQuantity: { type: 'integer' },
        availableQuantity: { type: 'integer' },
        purchasePrice: { type: 'number' },
        sellingPrice: { type: 'number' },
        mrp: { type: 'number' },
        expiryDate: { type: 'string' },
        manufacturingDate: { type: ['string', 'null'] },
        status: { type: 'string' },
        supplierId: { type: ['string', 'null'] },
        purchaseInvoiceId: { type: ['string', 'null'] },
        createdAt: { type: 'string' },
        updatedAt: { type: 'string' },
      },
      additionalProperties: true,
    },
    400: errorResponseSchema,
    500: errorResponseSchema,
  },
};

export const stockOutSchema = {
  tags: ['Stock'],
  summary: 'Record stock outbound (sale/adjustment)',
  description:
    'Deducts stock according to First-Expiry-First-Out (FEFO) strategy and records a stock movement ledger entry.',
  body: {
    type: 'object',
    required: ['medicineId', 'quantity'],
    properties: {
      medicineId: { type: 'string', minLength: 1, description: 'ID of the medicine to deduct' },
      quantity: { type: 'integer', minimum: 1, description: 'Quantity to deduct' },
      type: {
        type: 'string',
        enum: [
          'SALE',
          'ADJUSTMENT',
          'RETURN',
          'DAMAGE',
          'EXPIRED',
          'TRANSFER_OUT',
          'SUPPLIER_RETURN',
          'DISPOSAL',
        ],
        default: 'SALE',
        description: 'Movement type classification',
      },
      branchId: { type: 'string', description: 'Optional branch filter' },
      batchId: { type: 'string', description: 'Optional specific batch to deduct from' },
    },
    additionalProperties: true,
  },
  response: {
    200: {
      type: 'object',
      description: 'Successfully deducted stock',
      properties: {
        totalDeducted: { type: 'integer', description: 'Total quantity deducted across batches' },
        batches: {
          type: 'array',
          description: 'Batches deducted with deducted quantities',
          items: {
            type: 'object',
            properties: {
              batchId: { type: 'string' },
              quantity: { type: 'integer' },
            },
          },
        },
      },
    },
    400: errorResponseSchema,
    500: errorResponseSchema,
  },
};

export const recordDamageSchema = {
  tags: ['Stock'],
  summary: 'Record damaged stock',
  description:
    'Records stock damaged or discarded, reduces available stock from the specified batch, and creates a ledger entry.',
  body: {
    type: 'object',
    required: ['batchId', 'quantity'],
    properties: {
      batchId: { type: 'string', minLength: 1, description: 'ID of the batch with damaged stock' },
      quantity: { type: 'integer', minimum: 1, description: 'Damaged quantity' },
      reason: {
        type: 'string',
        maxLength: 500,
        description: 'Reason for damage (e.g. broken, wet, expired)',
      },
      branchId: { type: 'string', description: 'Optional branch ID' },
      medicineId: { type: 'string', description: 'Optional medicine ID' },
      notes: { type: 'string', maxLength: 500, description: 'Additional notes' },
    },
    additionalProperties: true,
  },
  response: {
    201: {
      type: 'object',
      description: 'Successfully recorded damage',
      properties: {
        id: { type: 'string' },
        tenantId: { type: 'string' },
        medicineId: { type: 'string' },
        batchId: { type: ['string', 'null'] },
        branchId: { type: ['string', 'null'] },
        movementType: { type: 'string' },
        quantity: { type: 'integer' },
        quantityBefore: { type: ['integer', 'null'] },
        quantityAfter: { type: ['integer', 'null'] },
        performedBy: { type: ['string', 'null'] },
        referenceType: { type: ['string', 'null'] },
        referenceId: { type: ['string', 'null'] },
        notes: { type: ['string', 'null'] },
        createdAt: { type: 'string' },
      },
      additionalProperties: true,
    },
    400: errorResponseSchema,
    500: errorResponseSchema,
  },
};

export const getHistorySchema = {
  tags: ['Stock'],
  summary: 'Get stock movement history',
  description:
    'Retrieves paginated ledger entries of stock movements for a tenant or specific medicine.',
  querystring: {
    type: 'object',
    properties: {
      medicineId: { type: 'string', description: 'Filter by medicine ID' },
      page: { type: 'integer', minimum: 1, default: 1, description: 'Page number' },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 20,
        description: 'Items per page',
      },
    },
  },
  response: {
    200: {
      type: 'object',
      description: 'Paginated stock transaction history',
      properties: {
        transactions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              tenantId: { type: 'string' },
              medicineId: { type: 'string' },
              batchId: { type: ['string', 'null'] },
              branchId: { type: ['string', 'null'] },
              movementType: { type: 'string' },
              quantity: { type: 'integer' },
              quantityBefore: { type: ['integer', 'null'] },
              quantityAfter: { type: ['integer', 'null'] },
              performedBy: { type: ['string', 'null'] },
              referenceType: { type: ['string', 'null'] },
              referenceId: { type: ['string', 'null'] },
              notes: { type: ['string', 'null'] },
              createdAt: { type: 'string' },
              medicine: { type: 'object', additionalProperties: true },
              batch: { type: ['object', 'null'], additionalProperties: true },
            },
            additionalProperties: true,
          },
        },
        total: { type: 'integer', description: 'Total transaction count' },
        page: { type: 'integer', description: 'Current page number' },
        limit: { type: 'integer', description: 'Items per page' },
      },
    },
    400: errorResponseSchema,
    500: errorResponseSchema,
  },
};

export const getAlertsSchema = {
  tags: ['Stock'],
  summary: 'Get active stock alerts',
  description: 'Retrieves active low-stock, out-of-stock, and expiring-soon medicine alerts.',
  response: {
    200: {
      type: 'object',
      description: 'Active stock alerts and KPIs',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            lowStockCount: { type: 'integer' },
            expiringSoonCount: { type: 'integer' },
            lowStock: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  medicineId: { type: 'string' },
                  name: { type: 'string' },
                  currentStock: { type: 'integer' },
                  reorderPoint: { type: 'integer' },
                },
              },
            },
            expiringSoon: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  medicineId: { type: 'string' },
                  batchNumber: { type: 'string' },
                  expiryDate: { type: 'string' },
                  daysRemaining: { type: 'integer' },
                  name: { type: 'string' },
                },
              },
            },
            outOfStock: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  medicineId: { type: 'string' },
                  name: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    500: errorResponseSchema,
  },
};

export const resolveAlertSchema = {
  tags: ['Stock'],
  summary: 'Resolve a stock alert',
  description: 'Marks a stock alert as resolved.',
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', minLength: 1, description: 'Alert ID to resolve' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
    400: errorResponseSchema,
    500: errorResponseSchema,
  },
};

export const getCurrentStockSchema = {
  tags: ['Stock'],
  summary: 'Get current stock for a medicine',
  description:
    'Retrieves aggregated total available quantity and individual active batch breakdown for a given medicine.',
  params: {
    type: 'object',
    required: ['medicineId'],
    properties: {
      medicineId: { type: 'string', minLength: 1, description: 'Medicine ID' },
    },
  },
  response: {
    200: {
      type: 'object',
      description: 'Current stock and batches for medicine',
      properties: {
        totalQuantity: { type: 'integer', description: 'Total available stock quantity' },
        batches: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              batchNumber: { type: 'string' },
              quantity: { type: 'integer' },
              availableQuantity: { type: 'integer' },
              expiryDate: { type: 'string' },
              purchasePrice: { type: 'number' },
              sellingPrice: { type: 'number' },
              mrp: { type: 'number' },
            },
            additionalProperties: true,
          },
        },
      },
    },
    400: errorResponseSchema,
    500: errorResponseSchema,
  },
};
