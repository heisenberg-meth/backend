import verificationService from '../services/verification.service.js';

class QRFastifyController {
  async verify(request, reply) {
    try {
      const result = await verificationService.verifyQR(request.body.payload, request.tenantId);
      return reply.send({ success: true, data: result });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }
}

export default new QRFastifyController();
