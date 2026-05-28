import { jest , describe, afterEach, it, expect } from '@jest/globals';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: mockPrisma,
}));

const { default: authzService } = await import(
  '../../src/modules/access-control/services/authz.service.js'
);

describe('AuthzService Unit Tests', () => {
  const userId = 'user-1';

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return true for ADMIN role regardless of permission', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: userId,
      role: 'ADMIN',
      assignedRole: null,
    });

    const result = await authzService.hasPermission(userId, 'SOME_RANDOM_PERMISSION');
    expect(result).toBe(true);
  });

  it('should return true if assignedRole has the specific permission', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: userId,
      role: 'STAFF',
      assignedRole: {
        name: 'CASHIER',
        permissions: [{ permission: { name: 'CREATE_BILL' } }],
      },
    });

    const result = await authzService.hasPermission(userId, 'CREATE_BILL');
    expect(result).toBe(true);
  });

  it('should return false if assignedRole does not have the specific permission', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: userId,
      role: 'STAFF',
      assignedRole: {
        name: 'CASHIER',
        permissions: [{ permission: { name: 'CREATE_BILL' } }],
      },
    });

    const result = await authzService.hasPermission(userId, 'DELETE_INVENTORY');
    expect(result).toBe(false);
  });

  it('should return false if user has no assignedRole', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: userId,
      role: 'STAFF',
      assignedRole: null,
    });

    const result = await authzService.hasPermission(userId, 'CREATE_BILL');
    expect(result).toBe(false);
  });

  it('should return true if assignedRole name is ADMIN', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: userId,
      role: 'STAFF',
      assignedRole: {
        name: 'ADMIN',
        permissions: [],
      },
    });

    const result = await authzService.hasPermission(userId, 'ANYTHING');
    expect(result).toBe(true);
  });
});
