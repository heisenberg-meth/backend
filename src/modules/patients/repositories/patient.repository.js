import prisma from "../../../config/prisma.js";
import sequenceService from '../../../shared/services/sequence.service.js';

const PHONE_REGEX = /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/;
const MIN_AGE = 0;
const MAX_AGE = 150;

class PatientRepository {
  async findAll(tenantId, { search, chronic, page = 1, limit = 50 } = {}) {
    const skip = (page - 1) * limit;
    const where = { tenantId, deletedAt: null };

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { patientCode: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (chronic === 'true' || chronic === true) {
      where.chronicConditions = { not: null };
    }

    const [patients, total] = await Promise.all([
      prisma.patient.findMany({
        where,
        include: {
          prescriptions: true,
          loyaltyTransactions: { take: 5, orderBy: { createdAt: 'desc' } },
        },
        orderBy: { fullName: 'asc' },
        skip,
        take: limit,
      }),
      prisma.patient.count({ where }),
    ]);

    return { patients, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id, tenantId) {
    return prisma.patient.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        prescriptions: {
          include: {
            items: { include: { medicine: true } },
            user: { select: { fullName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        loyaltyTransactions: { orderBy: { createdAt: 'desc' } },
        invoices: { take: 10, orderBy: { createdAt: 'desc' } },
        sales: { take: 10, orderBy: { soldAt: 'desc' } },
      },
    });
  }

  async search(tenantId, query) {
    return prisma.patient.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [
          { fullName: { contains: query, mode: 'insensitive' } },
          { phone: { contains: query } },
          { patientCode: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 20,
    });
  }

  async findByPhone(phone, tenantId) {
    return prisma.patient.findFirst({
      where: { phone, tenantId, deletedAt: null },
    });
  }

  async findDuplicate(tenantId, { phone, fullName }) {
    const conditions = [];

    // Exact phone match
    if (phone) {
      conditions.push({ phone, tenantId, deletedAt: null });
    }

    // Fuzzy name match (same name + same phone last 4 digits)
    if (fullName && phone) {
      const phoneSuffix = phone.slice(-4);
      conditions.push({
        tenantId,
        deletedAt: null,
        fullName: { contains: fullName.split(' ')[0], mode: 'insensitive' },
        phone: { contains: phoneSuffix },
      });
    }

    if (conditions.length === 0) return null;

    return prisma.patient.findFirst({
      where: { OR: conditions },
    });
  }

  validatePhone(phone) {
    if (!phone) return { valid: false, error: 'Phone number is required' };
    if (!PHONE_REGEX.test(phone)) return { valid: false, error: 'Invalid phone number format' };
    if (phone.length < 10)
      return { valid: false, error: 'Phone number must be at least 10 digits' };
    return { valid: true };
  }

  validateAge(age) {
    if (age === null || age === undefined) return { valid: true };
    if (typeof age !== 'number' || !Number.isInteger(age))
      return { valid: false, error: 'Age must be a whole number' };
    if (age < MIN_AGE || age > MAX_AGE)
      return { valid: false, error: `Age must be between ${MIN_AGE} and ${MAX_AGE}` };
    return { valid: true };
  }

  async getNextPatientCode(tenantId, tx) {
    return sequenceService.nextPatientCode(tenantId, tx);
  }

  async create(tenantId, data) {
    // Validate phone
    const phoneValidation = this.validatePhone(data.phone);
    if (!phoneValidation.valid) {
      throw new Error(phoneValidation.error);
    }

    // Validate age
    if (data.age !== undefined) {
      const ageValidation = this.validateAge(data.age);
      if (!ageValidation.valid) {
        throw new Error(ageValidation.error);
      }
    }

    // Check for duplicates
    const duplicate = await this.findDuplicate(tenantId, {
      phone: data.phone,
      fullName: data.fullName,
    });
    if (duplicate) {
      throw new Error(
        `Duplicate patient detected: ${duplicate.fullName} (${duplicate.patientCode}). Phone: ${duplicate.phone}`,
      );
    }

    // Auto-generate patient code
    const patientCode = await this.getNextPatientCode(tenantId);

    return prisma.patient.create({
      data: {
        tenantId,
        patientCode,
        fullName: data.fullName,
        phone: data.phone,
        email: data.email || null,
        gender: data.gender || null,
        dateOfBirth: data.dateOfBirth || null,
        age: data.age || null,
        address: data.address || null,
        medicalHistory: data.medicalHistory || null,
        allergies: data.allergies || null,
        chronicConditions: data.chronicConditions || null,
        bloodGroup: data.bloodGroup || null,
        emergencyContact: data.emergencyContact || null,
        insuranceProvider: data.insuranceProvider || null,
        insurancePolicyNo: data.insurancePolicyNo || null,
        insuranceCoveragePercentage: data.insuranceCoveragePercentage || 0,
        status: data.status || 'ACTIVE',
      },
    });
  }

  async update(id, tenantId, data, updatedBy = null) {
    const existing = await this.findById(id, tenantId);
    if (!existing) {
      throw new Error('Patient not found');
    }

    // Validate phone if changing
    if (data.phone !== undefined && data.phone !== existing.phone) {
      const phoneValidation = this.validatePhone(data.phone);
      if (!phoneValidation.valid) {
        throw new Error(phoneValidation.error);
      }

      // Check for duplicate phone (exclude current patient)
      const phoneDuplicate = await prisma.patient.findFirst({
        where: { phone: data.phone, tenantId, deletedAt: null, id: { not: id } },
      });
      if (phoneDuplicate) {
        throw new Error(`Phone number already in use by patient: ${phoneDuplicate.fullName}`);
      }
    }

    // Validate age if changing
    if (data.age !== undefined) {
      const ageValidation = this.validateAge(data.age);
      if (!ageValidation.valid) {
        throw new Error(ageValidation.error);
      }
    }

    // Track field-level audit for sensitive fields
    const auditFields = [
      'allergies',
      'chronicConditions',
      'fullName',
      'phone',
      'dateOfBirth',
      'bloodGroup',
    ];
    const auditLogs = [];

    for (const field of auditFields) {
      if (
        data[field] !== undefined &&
        JSON.stringify(data[field]) !== JSON.stringify(existing[field])
      ) {
        auditLogs.push({
          tenantId,
          patientId: id,
          action: 'FIELD_CHANGE',
          fieldName: field,
          oldValue: JSON.stringify(existing[field]),
          newValue: JSON.stringify(data[field]),
          description: `${field} updated by ${updatedBy || 'system'}`,
        });
      }
    }

    const updated = await prisma.patient.update({
      where: { id },
      data,
    });

    // Create audit logs
    if (auditLogs.length > 0) {
      await prisma.patientAuditLog.createMany({
        data: auditLogs,
      });
    }

    return updated;
  }

  async delete(id, tenantId) {
    const existing = await this.findById(id, tenantId);
    if (!existing) {
      throw new Error('Patient not found');
    }
    // Soft delete — NEVER hard delete healthcare entities
    return prisma.patient.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'ARCHIVED' },
    });
  }

  async updateStats(id, tenantId, amount) {
    await this.findById(id, tenantId);
    return prisma.patient.update({
      where: { id },
      data: {
        totalSpent: { increment: amount },
        lastPurchaseDate: new Date(),
      },
    });
  }

  async getPurchaseHistory(id, tenantId) {
    return prisma.sale.findMany({
      where: { patientId: id, tenantId },
      include: { items: { include: { medicine: true } } },
      orderBy: { soldAt: 'desc' },
    });
  }

  async getPrescriptions(id, tenantId) {
    return prisma.prescription.findMany({
      where: { patientId: id, tenantId },
      include: { items: { include: { medicine: true } }, doctor: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getInvoices(id, tenantId) {
    return prisma.invoice.findMany({
      where: { patientId: id, tenantId },
      include: { items: { include: { medicine: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getLoyaltyHistory(id, tenantId) {
    return prisma.loyaltyTransaction.findMany({
      where: { patientId: id, tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addCredit(id, tenantId, amount) {
    await this.findById(id, tenantId);
    return prisma.patient.update({
      where: { id },
      data: { creditLimit: { increment: amount } },
    });
  }
}

export default new PatientRepository();
