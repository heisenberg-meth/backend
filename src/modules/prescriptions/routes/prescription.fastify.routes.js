import controller from '../fastify/prescription.fastify.controller.js';
import doctorController from '../fastify/doctor.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';

export default async function (fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.get('/', {
    schema: { tags: ['Prescriptions'], summary: 'List prescriptions' },
    handler: controller.getPrescriptions,
  });

  fastify.post('/', {
    schema: { tags: ['Prescriptions'], summary: 'Create prescription' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: controller.createPrescription,
  });

  fastify.get('/:id', {
    schema: { tags: ['Prescriptions'], summary: 'Get prescription by ID' },
    handler: controller.getPrescriptionById,
  });

  fastify.post('/:id/verify', {
    schema: { tags: ['Prescriptions'], summary: 'Verify prescription' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: controller.verifyPrescription,
  });

  fastify.post('/:id/reject', {
    schema: { tags: ['Prescriptions'], summary: 'Reject prescription' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: controller.rejectPrescription,
  });

  fastify.get('/patient/:patientId', {
    schema: { tags: ['Prescriptions'], summary: 'Get patient prescriptions' },
    handler: controller.getCustomerPrescriptions,
  });

  fastify.post('/:id/convert-to-invoice', {
    schema: { tags: ['Prescriptions'], summary: 'Convert prescription to invoice' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: controller.convertToInvoice,
  });

  fastify.get('/:id/dispensing-history', {
    schema: { tags: ['Prescriptions'], summary: 'Get dispensing history' },
    handler: controller.getDispensingHistory,
  });

  fastify.get('/:id/doctor-validation', {
    schema: { tags: ['Prescriptions'], summary: 'Validate doctor on prescription' },
    handler: controller.getDoctorValidation,
  });

  fastify.get('/doctors', {
    schema: { tags: ['Doctors'], summary: 'List doctors' },
    handler: doctorController.getDoctors,
  });

  fastify.post('/doctors', {
    schema: { tags: ['Doctors'], summary: 'Create doctor' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: doctorController.createDoctor,
  });
}
