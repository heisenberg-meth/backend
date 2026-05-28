import { Router } from 'express';
import prisma from '../../../config/prisma.js';
import returnService from '../services/return.service.js';
import creditNoteService from '../services/credit-note.service.js';
import authMiddleware from '../../../middleware/auth.middleware.js';
import { authorize } from '../../../middleware/role.middleware.js';
import validate from '../../../middleware/validate.middleware.js';

const router = Router();

router.use(authMiddleware);

router.post('/returns', authorize('returns.create'), validate('createReturn'), async (req, res, next) => {
  try {
    const result = await returnService.createReturn(req.tenantId, req.user.id, req.body);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    if (err.message.includes('not found') || err.message.includes('expired') || err.message.includes('cancelled')) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
  }
});

router.get('/returns', authorize('returns.read'), async (req, res, next) => {
  try {
    const result = await returnService.getReturns(req.tenantId, req.query);
    res.status(200).json({ success: true, data: result.returns || result });
  } catch (err) {
    next(err);
  }
});

router.get('/returns/:id', authorize('returns.read'), async (req, res, next) => {
  try {
    const returnRecord = await returnService.getReturn(req.params.id, req.tenantId);
    const creditNotes = returnRecord.creditNotes || await creditNoteService.getCreditNotesByReturn(req.params.id, req.tenantId);
    res.status(200).json({ success: true, data: { return: returnRecord, creditNotes } });
  } catch (err) {
    if (err.message === 'Return not found') {
      return res.status(404).json({ success: false, message: err.message });
    }
    next(err);
  }
});

router.post('/returns/:id/approve', authorize('returns.approve'), validate('approveReturn'), async (req, res, next) => {
  try {
    const result = await returnService.approveReturn(req.params.id, req.tenantId, req.user.id, req.body.notes);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/returns/:id/reject', authorize('returns.approve'), validate('rejectReturn'), async (req, res, next) => {
  try {
    const result = await returnService.rejectReturn(req.params.id, req.tenantId, req.user.id, req.body.reason);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/returns/:id/credit-note', authorize('returns.create'), validate('createCreditNote'), async (req, res, next) => {
  try {
    const creditNote = await creditNoteService.generateCreditNote(req.params.id, req.tenantId, req.user.id, req.body.notes);
    res.status(201).json({ success: true, data: { creditNoteNumber: creditNote.creditNoteNumber } });
  } catch (err) {
    if (err.message === 'Return not found') {
      return res.status(404).json({ success: false, message: err.message });
    }
    next(err);
  }
});

router.post('/returns/:id/refund', authorize('returns.refund'), validate('processRefund'), async (req, res, next) => {
  try {
    const returnRecord = await prisma.return.findUnique({ where: { id: req.params.id } });
    if (!returnRecord) return res.status(404).json({ success: false, message: 'Return not found' });
    if (returnRecord.status !== 'APPROVED') return res.status(400).json({ success: false, message: 'Return not approved' });

    await prisma.return.update({
      where: { id: req.params.id },
      data: { status: 'REFUNDED', refundStatus: 'COMPLETED', refundMethod: req.body.refundMethod },
    });

    const aggregate = await prisma.return.aggregate({
      where: { tenantId: req.tenantId, invoiceId: returnRecord.invoiceId },
      _sum: { totalReturnAmount: true },
    });

    const invoice = await prisma.invoice.findUnique({ where: { id: returnRecord.invoiceId } });
    if (invoice) {
      await prisma.invoice.update({
        where: { id: returnRecord.invoiceId },
        data: { status: aggregate._sum.totalReturnAmount >= invoice.totalAmount ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
      });
    }

    res.status(200).json({ success: true, data: { status: 'REFUNDED' } });
  } catch (err) {
    next(err);
  }
});

export default router;
