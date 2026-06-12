export function toReturnListDto(returnRecord) {
  return {
    id: returnRecord.id,
    returnNumber: returnRecord.returnNumber,
    status: returnRecord.status,
    totalQty: returnRecord.quantity,
    returnAmount: returnRecord.returnAmount,
    notes: returnRecord.notes,
    itemCount: returnRecord._count?.items || 0,
    supplier: returnRecord.supplier,
    createdAt: returnRecord.createdAt,
    approvedAt: returnRecord.approvedAt,
    pickedUpAt: returnRecord.pickedUpAt,
    creator: returnRecord.creator,
    creditNotes: returnRecord.creditNotes,
  };
}

export function toReturnDetailDto(returnRecord) {
  return {
    id: returnRecord.id,
    returnNumber: returnRecord.returnNumber,
    status: returnRecord.status,
    returnAmount: returnRecord.returnAmount,
    notes: returnRecord.notes,
    createdAt: returnRecord.createdAt,
    approvedAt: returnRecord.approvedAt,
    pickedUpAt: returnRecord.pickedUpAt,
    supplier: returnRecord.supplier,
    items: returnRecord.items,
    creditNotes: returnRecord.creditNotes,
    creator: returnRecord.creator,
    approver: returnRecord.approver,
  };
}
