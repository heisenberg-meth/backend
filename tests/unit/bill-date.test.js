import { describe, it, expect, jest } from '@jest/globals';
import { normalizeInvoice } from '../../src/modules/billing/helpers/invoice-dto.js';
import invoiceRepository from '../../src/modules/billing/repositories/invoice.repository.js';
import prisma from '../../src/config/prisma.js';

describe('Bill Date Feature Unit Tests', () => {
  describe('normalizeInvoice DTO', () => {
    it('should use explicit billDate when provided as a string', () => {
      const rawInvoice = {
        id: 'inv-12345678-abcd',
        invoiceNumber: 'INV-2026-000055',
        billDate: '2026-09-11',
        createdAt: '2026-09-11T17:32:14.000Z',
        patientName: 'Peter',
        patientPhone: '9003629797',
        status: 'PAID',
        items: [],
      };

      const normalized = normalizeInvoice(rawInvoice);
      expect(normalized.billDate).toBe('2026-09-11');
      expect(normalized.invoiceNumber).toBe('INV-2026-000055');
      expect(normalized.status).toBe('PAID');
    });

    it('should use explicit billDate when provided as a Date object', () => {
      const rawInvoice = {
        id: 'inv-12345678-abcd',
        invoiceNumber: 'INV-2026-000054',
        billDate: new Date('2026-09-10T00:00:00.000Z'),
        createdAt: '2026-09-11T00:05:00.000Z', // Created next day
        patientName: 'Peter',
        patientPhone: '9003629797',
        status: 'PAID',
        items: [],
      };

      const normalized = normalizeInvoice(rawInvoice);
      expect(normalized.billDate).toBe('2026-09-10');
    });

    it('should gracefully fallback to date portion of createdAt for legacy bills without billDate', () => {
      const legacyInvoice = {
        id: 'inv-legacy-1',
        invoiceNumber: 'INV-2025-000001',
        billDate: null,
        createdAt: '2025-11-20T14:30:00.000Z',
        status: 'PAID',
        items: [],
      };

      const normalized = normalizeInvoice(legacyInvoice);
      expect(normalized.billDate).toBe('2025-11-20');
    });

    it('should retain original billDate when a bill is refunded', () => {
      const refundedInvoice = {
        id: 'inv-refund-1',
        invoiceNumber: 'INV-2026-000053',
        billDate: '2026-09-11',
        createdAt: '2026-09-11T16:51:00.000Z',
        updatedAt: '2026-09-12T10:00:00.000Z',
        status: 'REFUNDED',
        refundedAmount: 500,
        items: [],
      };

      const normalized = normalizeInvoice(refundedInvoice);
      expect(normalized.billDate).toBe('2026-09-11');
      expect(normalized.status).toBe('REFUNDED');
    });
  });

  describe('invoiceRepository findAll billDate filtering', () => {
    it('should construct OR filter for billDate matching exact billDate or legacy createdAt', async () => {
      const findManySpy = jest.spyOn(prisma.invoice, 'findMany').mockResolvedValue([]);
      const countSpy = jest.spyOn(prisma.invoice, 'count').mockResolvedValue(0);

      await invoiceRepository.findAll('tenant-1', {
        billDate: '2026-09-11',
      });

      expect(findManySpy).toHaveBeenCalled();
      const whereArg = findManySpy.mock.calls[0][0].where;

      expect(whereArg.tenantId).toBe('tenant-1');
      expect(whereArg.OR).toBeDefined();
      expect(whereArg.OR).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            billDate: expect.any(Date),
          }),
          expect.objectContaining({
            billDate: null,
            createdAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        ]),
      );

      findManySpy.mockRestore();
      countSpy.mockRestore();
    });

    it('should not include billDate filter if billDate is not in query params', async () => {
      const findManySpy = jest.spyOn(prisma.invoice, 'findMany').mockResolvedValue([]);
      const countSpy = jest.spyOn(prisma.invoice, 'count').mockResolvedValue(0);

      await invoiceRepository.findAll('tenant-1', {
        search: 'Peter',
      });

      expect(findManySpy).toHaveBeenCalled();
      const whereArg = findManySpy.mock.calls[0][0].where;
      expect(whereArg.billDate).toBeUndefined();
      expect(whereArg.OR).toBeUndefined();

      findManySpy.mockRestore();
      countSpy.mockRestore();
    });
  });
});
