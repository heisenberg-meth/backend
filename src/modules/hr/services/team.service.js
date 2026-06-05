import bcrypt from 'bcryptjs';
import prisma from '../../../config/prisma.js';
import auditService from '../../audit/service/audit.prisma.service.js';
import redisClient from '../../../config/redis.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';

const ACTIVE_SHIFTS_CACHE_TTL = 300;
const PERFORMANCE_CACHE_TTL = 600;
class TeamService {
  async getTeamMembers({ tenantId, search, role, branchId, skip, take }) {
    const where = {
      tenantId,
      deletedAt: null,
    };

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role) {
      where.role = role;
    }

    if (branchId) {
      where.branchId = branchId;
    }

    const [members, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          phone: true,
          branchId: true,
          branch: { select: { id: true, name: true } },
          createdAt: true,
          updatedAt: true,
        },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    return { members, total, page: Math.floor(skip / take) + 1, limit: take };
  }

  async createTeamMember(data) {
    const { email, password, fullName, role, phone, branchId, tenantId, createdBy } = data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new Error('A user with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        fullName,
        role,
        phone,
        branchId,
        tenantId,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        phone: true,
        branchId: true,
        branch: { select: { id: true, name: true } },
        createdAt: true,
      },
    });

    await auditService.log({
      tenantId,
      userId: createdBy,
      action: 'CREATE_TEAM_MEMBER',
      target: user.email,
      type: 'ACCESS',
    });

    return user;
  }

  async getTeamMemberById(id, tenantId) {
    const user = await prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        phone: true,
        branchId: true,
        branch: { select: { id: true, name: true, code: true } },
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new Error('Team member not found');
    }

    return user;
  }

  async updateTeamMember(id, tenantId, data) {
    const { fullName, role, branchId, phone } = data;

    const existing = await prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!existing) {
      throw new Error('Team member not found');
    }

    const updateData = {};
    if (fullName !== undefined) updateData.fullName = fullName;
    if (role !== undefined) updateData.role = role;
    if (branchId !== undefined) updateData.branchId = branchId;
    if (phone !== undefined) updateData.phone = phone;

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        phone: true,
        branchId: true,
        branch: { select: { id: true, name: true } },
        updatedAt: true,
      },
    });

    return user;
  }

  async deleteTeamMember(id, tenantId) {
    const existing = await prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!existing) {
      throw new Error('Team member not found');
    }

    await prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async updateTeamMemberRole(id, tenantId, role) {
    const validRoles = ['OWNER', 'STAFF', 'ADMIN', 'PHARMACIST', 'CASHIER'];
    if (!role || !validRoles.includes(role)) {
      throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }

    const existing = await prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!existing) {
      throw new Error('Team member not found');
    }

    const oldRole = existing.role;

    const user = await prisma.user.update({
      where: { id },
      data: { role },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        phone: true,
        branchId: true,
        branch: { select: { id: true, name: true } },
        updatedAt: true,
      },
    });

    await auditService.log({
      tenantId,
      action: 'UPDATE_TEAM_ROLE',
      target: user.email || user.id,
      type: 'ACCESS',
    });

    await emitEvent(DOMAIN_EVENTS.PERMISSION_UPDATED, {
      tenantId,
      userId: id,
      oldRole,
      newRole: role,
    });

    return user;
  }

  async getShifts(tenantId, filters = {}) {
    const { userId, branchId, role, status, fromDate, toDate } = filters;
    const cacheKey = `team:shifts:${tenantId}:${userId || 'all'}:${branchId || 'all'}:${status || 'all'}`;

    if (!userId && !fromDate && !toDate && status === 'ACTIVE') {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    const where = { tenantId };

    if (userId) where.userId = userId;
    if (status) where.status = status;
    if (fromDate || toDate) {
      where.startTime = {};
      if (fromDate) where.startTime.gte = new Date(fromDate);
      if (toDate) where.startTime.lte = new Date(toDate);
    }

    if (branchId || role) {
      const userWhere = { tenantId, deletedAt: null };
      if (branchId) userWhere.branchId = branchId;
      if (role) userWhere.role = role;

      const userIds = await prisma.user.findMany({
        where: userWhere,
        select: { id: true },
      });

      where.userId = { in: userIds.map((u) => u.id) };
    }

    const shifts = await prisma.shift.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
            branchId: true,
            branch: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { startTime: 'desc' },
      take: 200,
    });

    if (!userId && !fromDate && !toDate && status === 'ACTIVE') {
      await redisClient.setex(cacheKey, ACTIVE_SHIFTS_CACHE_TTL, JSON.stringify(shifts));
    }

    return shifts;
  }

  async createShift(tenantId, data) {
    const { employeeId, shiftStart, shiftEnd } = data;

    const employee = await prisma.user.findFirst({
      where: { id: employeeId, tenantId, deletedAt: null },
    });
    if (!employee) {
      throw new Error('Employee not found');
    }

    const overlapping = await prisma.shift.findFirst({
      where: {
        tenantId,
        userId: employeeId,
        status: { in: ['SCHEDULED', 'ACTIVE'] },
        OR: [
          {
            startTime: { lte: new Date(shiftEnd) },
            endTime: { gte: new Date(shiftStart) },
          },
          {
            startTime: { lte: new Date(shiftEnd) },
            endTime: null,
          },
        ],
      },
    });

    if (overlapping) {
      throw new Error(
        `Shift overlap detected: employee already has a ${overlapping.status} shift from ${overlapping.startTime.toISOString()} to ${overlapping.endTime?.toISOString() || 'ongoing'}`,
      );
    }

    if (employee.role !== 'PHARMACIST' && employee.role !== 'ADMIN' && employee.role !== 'OWNER') {
      await auditService.log({
        tenantId,
        action: 'SHIFT_CREATED_NON_PHARMACIST',
        target: employee.email || employee.id,
        type: 'ACCESS',
      });
    }

    const shift = await prisma.shift.create({
      data: {
        tenantId,
        userId: employeeId,
        startTime: new Date(shiftStart),
        endTime: new Date(shiftEnd),
        status: 'SCHEDULED',
        notes: data.notes || null,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
            branchId: true,
            branch: { select: { id: true, name: true } },
          },
        },
      },
    });

    await redisClient.del(`team:shifts:${tenantId}:*`);

    await emitEvent(DOMAIN_EVENTS.SHIFT_CREATED, {
      tenantId,
      shiftId: shift.id,
      employeeId,
      shiftStart,
      shiftEnd,
    });

    return shift;
  }

  async startShift(tenantId, userId, notes) {
    const existingActive = await prisma.shift.findFirst({
      where: {
        tenantId,
        userId,
        status: { in: ['ACTIVE', 'SCHEDULED'] },
        endTime: null,
      },
    });

    if (existingActive) {
      throw new Error('Employee already has an active or scheduled shift');
    }

    const shift = await prisma.shift.create({
      data: {
        tenantId,
        userId,
        startTime: new Date(),
        notes,
        status: 'ACTIVE',
      },
      include: {
        user: {
          select: { id: true, fullName: true, role: true, branchId: true },
        },
      },
    });

    await redisClient.del(`team:shifts:${tenantId}:*`);

    return shift;
  }

  async endShift(tenantId, id) {
    const shift = await prisma.shift.findFirst({
      where: { id, tenantId, status: 'ACTIVE' },
    });

    if (!shift) {
      throw new Error('Active shift not found');
    }

    const updated = await prisma.shift.update({
      where: { id },
      data: {
        endTime: new Date(),
        status: 'COMPLETED',
      },
      include: {
        user: {
          select: { id: true, fullName: true, role: true, branchId: true },
        },
      },
    });

    await redisClient.del(`team:shifts:${tenantId}:*`);

    return updated;
  }

  async getActiveShifts(tenantId, branchId) {
    const cacheKey = `team:shifts:active:${tenantId}:${branchId || 'all'}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const where = { tenantId, status: 'ACTIVE' };

    if (branchId) {
      const userIds = await prisma.user.findMany({
        where: { tenantId, branchId, deletedAt: null },
        select: { id: true },
      });
      where.userId = { in: userIds.map((u) => u.id) };
    }

    const shifts = await prisma.shift.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            role: true,
            branchId: true,
            branch: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { startTime: 'desc' },
    });

    await redisClient.setex(cacheKey, ACTIVE_SHIFTS_CACHE_TTL, JSON.stringify(shifts));
    return shifts;
  }

  async getBillingPerformance(tenantId, filters = {}) {
    const { branchId, fromDate, toDate } = filters;
    const cacheKey = `team:billing-perf:${tenantId}:${branchId || 'all'}:${fromDate || ''}:${toDate || ''}`;

    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const dateFilter = {};
    if (fromDate || toDate) {
      dateFilter.soldAt = {};
      if (fromDate) dateFilter.soldAt.gte = new Date(fromDate);
      if (toDate) dateFilter.soldAt.lte = new Date(toDate);
    }

    const saleWhere = {
      tenantId,
      status: 'COMPLETED',
      ...dateFilter,
    };
    if (branchId) saleWhere.branchId = branchId;

    const sales = await prisma.sale.groupBy({
      by: ['soldBy'],
      where: saleWhere,
      _count: { id: true },
      _sum: { totalAmount: true },
      _avg: { totalAmount: true },
    });

    const refunds = await prisma.salesReturn.groupBy({
      by: ['createdBy'],
      where: {
        tenantId,
        createdAt: dateFilter.soldAt || {},
      },
      _count: { id: true },
      _sum: { refundAmount: true },
    });

    const refundMap = {};
    for (const r of refunds) {
      refundMap[r.createdBy] = {
        count: r._count.id,
        amount: r._sum.refundAmount || 0,
      };
    }

    const cancellations = await prisma.sale.groupBy({
      by: ['soldBy'],
      where: {
        tenantId,
        status: { not: 'COMPLETED' },
        ...dateFilter,
      },
      _count: { id: true },
    });

    const cancelMap = {};
    for (const c of cancellations) {
      cancelMap[c.soldBy] = c._count.id;
    }

    const userWhere = { tenantId, deletedAt: null };
    if (branchId) userWhere.branchId = branchId;
    const users = await prisma.user.findMany({
      where: userWhere,
      select: { id: true, fullName: true, role: true, branchId: true },
    });

    const userMap = {};
    for (const u of users) {
      userMap[u.id] = u;
    }

    const cashiers = sales.map((s) => {
      const user = userMap[s.soldBy] || {};
      const invoiceCount = s._count.id;
      const salesAmount = s._sum.totalAmount || 0;
      const refundData = refundMap[s.soldBy] || { count: 0, amount: 0 };
      const cancelCount = cancelMap[s.soldBy] || 0;
      const avgBillingTimeSeconds = invoiceCount > 0 ? Math.round((8 * 3600) / invoiceCount) : 0;

      return {
        employeeId: s.soldBy,
        employeeName: user.fullName || 'Unknown',
        role: user.role || 'Unknown',
        invoiceCount,
        salesAmount,
        averageBillingTimeSeconds: Math.min(avgBillingTimeSeconds, 600),
        refundCount: refundData.count,
        refundAmount: refundData.amount,
        refundRatio: invoiceCount > 0 ? (refundData.count / invoiceCount).toFixed(4) : 0,
        cancellationCount: cancelCount,
        cancellationRatio:
          invoiceCount + cancelCount > 0
            ? (cancelCount / (invoiceCount + cancelCount)).toFixed(4)
            : 0,
      };
    });

    cashiers.sort((a, b) => b.salesAmount - a.salesAmount);

    const result = {
      cashiers,
      summary: {
        totalInvoices: cashiers.reduce((sum, c) => sum + c.invoiceCount, 0),
        totalSales: cashiers.reduce((sum, c) => sum + c.salesAmount, 0),
        totalRefunds: cashiers.reduce((sum, c) => sum + c.refundAmount, 0),
        totalCancellations: cashiers.reduce((sum, c) => sum + c.cancellationCount, 0),
        averageInvoiceValue:
          cashiers.length > 0
            ? cashiers.reduce((sum, c) => sum + c.salesAmount, 0) /
              cashiers.reduce((sum, c) => sum + c.invoiceCount, 0)
            : 0,
      },
    };

    await redisClient.setex(cacheKey, PERFORMANCE_CACHE_TTL, JSON.stringify(result));
    return result;
  }

  async getPerformance(tenantId, userId) {
    const cacheKey = `team:perf:${tenantId}:${userId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const sales = await prisma.sale.aggregate({
      where: { tenantId, soldBy: userId, status: 'COMPLETED' },
      _count: { id: true },
      _sum: { totalAmount: true },
    });

    const shiftCount = await prisma.shift.count({
      where: { tenantId, userId, status: { in: ['COMPLETED', 'CLOSED'] } },
    });

    const prescriptionVerifications = await prisma.prescriptionVerification.count({
      where: { verifiedBy: userId },
    });
    const inventoryActions = await prisma.stockTransaction.count({
      where: { tenantId, createdBy: userId },
    });
    const returnsProcessed = await prisma.salesReturn.count({
      where: { tenantId, createdBy: userId },
    });
    const activeShifts = await prisma.shift.count({
      where: { tenantId, userId, status: 'ACTIVE' },
    });
    const totalCompleted = (sales._count.id || 0) + prescriptionVerifications + inventoryActions;
    const totalAssigned = totalCompleted + returnsProcessed * 2;
    const performanceScore =
      totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0;

    const result = {
      userId,
      totalSales: sales._sum.totalAmount || 0,
      saleCount: sales._count.id || 0,
      shiftCount,
      activeShifts,
      prescriptionsVerified: prescriptionVerifications,
      inventoryActions,
      returnsProcessed,
      performanceScore: Math.min(performanceScore, 100),
    };

    await redisClient.setex(cacheKey, PERFORMANCE_CACHE_TTL, JSON.stringify(result));
    return result;
  }

  async getTeamPerformanceOverview(tenantId, filters = {}) {
    const { branchId, role } = filters;
    const cacheKey = `team:perf-overview:${tenantId}:${branchId || 'all'}:${role || 'all'}`;

    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const userWhere = { tenantId, deletedAt: null };
    if (branchId) userWhere.branchId = branchId;
    if (role) userWhere.role = role;

    const users = await prisma.user.findMany({
      where: userWhere,
      select: { id: true, fullName: true, role: true, branchId: true },
    });

    const staffPerformance = await Promise.all(
      users.map(async (user) => {
        const perf = await this.getPerformance(tenantId, user.id);
        return {
          employeeId: user.id,
          employeeName: user.fullName,
          role: user.role,
          ...perf,
        };
      }),
    );

    staffPerformance.sort((a, b) => b.performanceScore - a.performanceScore);

    const result = {
      staff: staffPerformance,
      summary: {
        totalStaff: staffPerformance.length,
        averagePerformanceScore:
          staffPerformance.length > 0
            ? Math.round(
                staffPerformance.reduce((sum, s) => sum + s.performanceScore, 0) /
                  staffPerformance.length,
              )
            : 0,
        totalSales: staffPerformance.reduce((sum, s) => sum + s.totalSales, 0),
        totalPrescriptionsVerified: staffPerformance.reduce(
          (sum, s) => sum + s.prescriptionsVerified,
          0,
        ),
        totalInventoryActions: staffPerformance.reduce((sum, s) => sum + s.inventoryActions, 0),
      },
    };

    await redisClient.setex(cacheKey, PERFORMANCE_CACHE_TTL, JSON.stringify(result));
    return result;
  }

  async updateTeamMemberPermissions(tenantId, userId, permissions, changedBy) {
    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
      select: { id: true, fullName: true, email: true, roleId: true },
    });

    if (!user) {
      throw new Error('Team member not found');
    }

    const oldPermissions = user.roleId
      ? await prisma.rolePermission.findMany({
          where: { roleId: user.roleId },
          include: { permission: { select: { name: true } } },
        })
      : [];

    const validPermissions = await prisma.permission.findMany({
      where: { name: { in: permissions } },
    });

    if (validPermissions.length !== permissions.length) {
      const missing = permissions.filter((p) => !validPermissions.some((vp) => vp.name === p));
      throw new Error(`Invalid permissions: ${missing.join(', ')}`);
    }

    let roleId = user.roleId;

    if (!roleId) {
      const customRole = await prisma.accessRole.create({
        data: {
          name: `CUSTOM_${user.fullName.replace(/\s+/g, '_').toUpperCase()}`,
          tenantId,
          description: `Custom permissions for ${user.fullName}`,
          isSystem: false,
        },
      });
      roleId = customRole.id;

      await prisma.user.update({
        where: { id: userId },
        data: { roleId },
      });
    }

    await prisma.rolePermission.deleteMany({
      where: { roleId },
    });

    if (permissions.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissions.map((permissionName) => {
          const perm = validPermissions.find((vp) => vp.name === permissionName);
          return {
            roleId,
            permissionId: perm.id,
          };
        }),
      });
    }

    await auditService.log({
      tenantId,
      userId: changedBy,
      action: 'UPDATE_PERMISSIONS',
      target: user.email || user.id,
      type: 'ACCESS',
    });

    await emitEvent(DOMAIN_EVENTS.PERMISSION_UPDATED, {
      tenantId,
      userId,
      changedBy,
      oldPermissions: oldPermissions.map((op) => op.permission.name),
      newPermissions: permissions,
    });

    return {
      userId,
      fullName: user.fullName,
      permissions,
      previousPermissions: oldPermissions.map((op) => op.permission.name),
    };
  }

  async getTeamMemberPermissions(tenantId, userId) {
    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
      include: {
        assignedRole: {
          include: {
            permissions: {
              include: { permission: { select: { id: true, name: true, module: true } } },
            },
          },
        },
      },
    });

    if (!user) {
      throw new Error('Team member not found');
    }

    return {
      userId: user.id,
      fullName: user.fullName,
      role: user.role,
      roleId: user.assignedRole?.id || null,
      permissions: (user.assignedRole?.permissions || []).map((rp) => ({
        id: rp.permission.id,
        name: rp.permission.name,
        module: rp.permission.module,
      })),
    };
  }
}

export default new TeamService();
