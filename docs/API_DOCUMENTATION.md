# MedAssist API Documentation — Purchase Orders & Support Tickets

## Authentication

All endpoints require JWT Bearer token or `accessToken` cookie.

---

## Purchase Orders

### Create Purchase Order

```
POST /api/purchase-orders
```

**Permission:** `purchase-orders.create`

**Request Body:**

```json
{
  "supplierId": "uuid",
  "branchId": "uuid (optional)",
  "expectedDeliveryDate": "2026-06-30 (optional)",
  "paymentMode": "CASH | CREDIT | UPI | BANK_TRANSFER | CHEQUE (optional)",
  "paymentTermsDays": 30 (optional),
  "discountAmount": 100.00 (optional, default 0),
  "notes": "string (optional)",
  "items": [
    {
      "medicineId": "uuid",
      "quantity": 100,
      "unitPrice": 45.50,
      "purchasePrice": 45.50,
      "gstPercentage": 18
    }
  ]
}
```

> **Note:** Both `unitPrice` and `purchasePrice` are accepted. If both provided, `unitPrice` takes precedence.

**Backend Calculations (never trust frontend):**
- `itemTotal = quantity × unitPrice`
- `itemGst = itemTotal × gstPercentage / 100`
- `subtotal = Σ(itemTotals)`
- `taxableAmount = subtotal - discountAmount`
- `totalGst = Σ(all GST)`
- `grandTotal = taxableAmount + totalGst`

**Response (201):**

```json
{
  "success": true,
  "message": "Purchase order created successfully",
  "data": {
    "id": "uuid",
    "orderNumber": "PO-20260623-0001",
    "status": "DRAFT",
    "supplierId": "uuid",
    "branchId": "uuid",
    "expectedDeliveryDate": "2026-06-30",
    "paymentMode": "CREDIT",
    "paymentTermsDays": 30,
    "discountAmount": 100.00,
    "subtotal": 10550.00,
    "gstAmount": 1872.00,
    "totalAmount": 12322.00,
    "notes": "Urgent stock replenishment",
    "createdAt": "2026-06-23T12:30:00.000Z",
    "items": [
      {
        "id": "uuid",
        "medicineId": "uuid",
        "medicineName": "Paracetamol 500mg",
        "quantity": 100,
        "unitPrice": 45.50,
        "gstPercentage": 18,
        "totalAmount": 4550.00
      }
    ]
  }
}
```

**Validation Errors:**

| Error | Code |
|---|---|
| Supplier not found | `400` |
| Medicine not found | `400` |
| At least one medicine required | `400` |
| Quantity must be > 0 | `400` |

---

### Get All Purchase Orders

```
GET /api/purchase-orders
```

**Query Parameters:**

| Param | Type | Description |
|---|---|---|
| `branchId` | uuid | Filter by branch |
| `supplierId` | uuid | Filter by supplier |
| `status` | string | Filter by status |
| `from` | date | Filter from date |
| `to` | date | Filter to date |

---

### Get Purchase Order by ID

```
GET /api/purchase-orders/:id
```

---

### Approve Purchase Order

```
POST /api/purchase-orders/:id/approve
```

**Permission:** `purchase-orders.approve`

**Body:** `{ "notes": "optional string" }`

**Status Flow:** `DRAFT → PENDING_APPROVAL → APPROVED`

---

### Receive Goods (GRN)

```
POST /api/purchase-orders/:id/receive
```

**Permission:** `purchase-orders.receive`

**Request Body:**

```json
{
  "supplierInvoiceNumber": "INV-2026-4455",
  "invoiceDate": "2026-06-29",
  "receivedItems": [
    {
      "purchaseOrderItemId": "uuid",
      "receivedQuantity": 100,
      "batchNumber": "BAT-2026-001",
      "expiryDate": "2028-12-31",
      "manufacturingDate": "2026-01-01 (optional)",
      "purchasePrice": 46.00,
      "mrp": 75.00,
      "sellingPrice": 65.00
    }
  ],
  "notes": "optional string"
}
```

**System Actions During GRN:**
1. Creates GoodsReceiptNote + GoodsReceiptNoteItem
2. Creates/updates InventoryBatch
3. Records StockMovement (PURCHASE)
4. Updates Inventory aggregate
5. Updates PO item receivedQuantity + remainingQuantity
6. Determines PO status (PARTIALLY_RECEIVED or RECEIVED)
7. Creates PurchaseInvoice
8. Creates SupplierLedger debit entry

**Partial Receipt:** Supports multiple GRNs per PO. Status goes to `PARTIALLY_RECEIVED` until all items fully received.

---

### Cancel Purchase Order

```
POST /api/purchase-orders/:id/cancel
```

**Permission:** `purchase-orders.cancel`

**Body:** `{ "reason": "string (min 5 chars)" }`

---

### Update PO Status

```
PATCH /api/purchase-orders/:id/status
```

**Permission:** `purchase-orders.update`

**Body:** `{ "status": "DRAFT | PENDING_APPROVAL | APPROVED | SENT | RECEIVED | CANCELLED" }`

---

### One-Click Reorder

```
POST /api/purchase-orders/reorder
```

**Permission:** `purchase-orders.create`

**Body:** `{ "medicineId": "uuid", "quantity": 100 }`

Auto-fills supplier, pricing, GST from last purchase batch.

---

### Generate PO PDF

```
GET /api/purchase-orders/:id/pdf
```

Returns HTML document for printing.

---

### PO Status Workflow

```
DRAFT → PENDING_APPROVAL → APPROVED → SENT → PARTIALLY_RECEIVED → RECEIVED → CLOSED
                                ↓                                      ↑
                           CANCELLED                              CANCELLED
```

---

## Support Tickets

### Create Ticket (Staff)

```
POST /api/support
```

**Body:**

```json
{
  "title": "Invoice not generating",
  "description": "When I click generate invoice, nothing happens",
  "category": "BILLING",
  "priority": "HIGH"
}
```

**Categories:** `INVENTORY`, `BILLING`, `PURCHASE`, `SUPPLIER`, `SALES`, `REPORTS`, `IMPORT`, `ACCOUNT`, `TECHNICAL`, `OTHER`

**Priorities:** `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`

**Response (201):**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "ticketNumber": "TKT-20260623-0001",
    "title": "Invoice not generating",
    "description": "When I click generate invoice, nothing happens",
    "category": "BILLING",
    "priority": "HIGH",
    "status": "OPEN",
    "createdById": "uuid",
    "createdAt": "2026-06-23T12:30:00.000Z"
  }
}
```

---

### Get My Tickets (Staff)

```
GET /api/support/my?status=OPEN&priority=HIGH&page=1&limit=20
```

---

### Get Ticket Details

```
GET /api/support/:ticketId
```

---

### Add Reply

```
POST /api/support/:ticketId/replies
```

**Body:** `{ "message": "string" }`

**Auto-status transitions:**
- Staff reply on `WAITING_FOR_STAFF` → `IN_PROGRESS`
- Admin reply on `IN_PROGRESS` → `WAITING_FOR_STAFF`

---

### Upload Attachment

```
POST /api/support/:ticketId/attachments
```

**Max:** 10MB per file, PNG/JPG/PDF

---

### Close Ticket

```
PUT /api/support/:ticketId/close
```

---

### Reopen Ticket

```
PUT /api/support/:ticketId/reopen
```

**Body:** `{ "reason": "Issue still occurring" }`

---

### Staff Dashboard

```
GET /api/support/dashboard
```

Returns: `{ open, inProgress, resolved, closed }`

---

## Admin Support Endpoints

### Admin Dashboard

```
GET /api/admin-support/dashboard
```

Returns: `{ totalTickets, open, inProgress, waitingForStaff, resolved, closed, critical, avgResolutionHours }`

---

### Get All Tickets

```
GET /api/admin-support/tickets?status=OPEN&priority=HIGH&category=BILLING&search=invoice&page=1&limit=20
```

---

### Get Ticket Details (Admin)

```
GET /api/admin-support/tickets/:ticketId
```

---

### Assign Ticket

```
PUT /api/admin-support/tickets/:ticketId/assign
```

**Body:** `{ "assignedTo": "user-uuid" }`

---

### Update Status

```
PUT /api/admin-support/tickets/:ticketId/status
```

**Body:** `{ "status": "IN_PROGRESS | WAITING_FOR_STAFF | RESOLVED | CLOSED" }`

---

### Admin Reply

```
POST /api/admin-support/tickets/:ticketId/replies
```

**Body:** `{ "message": "string" }`

---

### Resolve Ticket

```
PUT /api/admin-support/tickets/:ticketId/resolve
```

**Body:** `{ "resolution": "Fixed invoice calculation bug. Deployment completed." }`

---

## Ticket Lifecycle

```
Staff Creates → OPEN
Admin Reviews → IN_PROGRESS
Admin Replies → WAITING_FOR_STAFF
Staff Replies → IN_PROGRESS
Admin Resolves → RESOLVED
Staff Closes → CLOSED
Staff Reopens → OPEN
```

---

## Notifications

| Event | Who Notifies | Message |
|---|---|---|
| Ticket created | All admins | `New support ticket {number}: {title}` |
| Admin replies | Ticket creator | `Admin replied to your ticket {number}` |
| Staff replies | All admins | `New reply on ticket {number}` |
| Ticket resolved | Ticket creator | `Your ticket {number} has been resolved` |
| Ticket closed | Ticket creator | `Your ticket {number} has been closed` |

---

## Auth Endpoints

### Login

```
POST /api/auth/login
```

**Body:** `{ "email": "string", "password": "string", "fingerprint": "string (optional)" }`

**Rate limit:** 5 attempts per 15 minutes

**Lockout:** 10 failed attempts → 30 minute lock

---

### Refresh Token

```
POST /api/auth/refresh
```

Uses HttpOnly cookie. Token rotated on every refresh.

---

### Logout

```
POST /api/auth/logout
```

Revokes session, clears cookies.

---

### Change Password

```
PUT /api/auth/change-password
```

**Body:** `{ "currentPassword": "string", "newPassword": "string" }`

**Requirements:** Min 8 chars, uppercase, lowercase, number, special character

---

### Forgot Password

```
POST /api/auth/forgot-password
```

**Body:** `{ "email": "string" }`

Returns generic message regardless of whether email exists.

---

### Verify Reset OTP

```
POST /api/auth/verify-reset-otp
```

**Body:** `{ "email": "string", "otp": "6 digits" }`

---

### Reset Password

```
POST /api/auth/reset-password
```

**Body:** `{ "resetToken": "string", "newPassword": "string" }`
