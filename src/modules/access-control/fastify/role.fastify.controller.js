import roleService from '../services/role.service.js';

class RoleFastifyController {
  async getRoles(request, reply) {
    try {
      const roles = await roleService.getRoles(request.tenantId);
      return reply.send(roles);
    } catch (error) {
      return reply.code(500).send({ message: error.message });
    }
  }

  async getRoleById(request, reply) {
    try {
      const role = await roleService.getRoleById(request.params.id, request.tenantId);
      return reply.send(role);
    } catch (error) {
      return reply.code(404).send({ message: error.message });
    }
  }

  async createRole(request, reply) {
    try {
      const role = await roleService.createRole(request.tenantId, request.body);
      return reply.code(201).send(role);
    } catch (error) {
      return reply.code(400).send({ message: error.message });
    }
  }

  async updateRole(request, reply) {
    try {
      const role = await roleService.updateRole(request.params.id, request.tenantId, request.body);
      return reply.send(role);
    } catch (error) {
      return reply.code(400).send({ message: error.message });
    }
  }

  async getPermissions(request, reply) {
    try {
      const permissions = await roleService.getPermissions();
      return reply.send(permissions);
    } catch (error) {
      return reply.code(500).send({ message: error.message });
    }
  }

  async seedPermissions(request, reply) {
    try {
      const results = await roleService.seedPermissions();
      return reply.send({ message: 'Permissions seeded successfully', count: results.length });
    } catch (error) {
      return reply.code(500).send({ message: error.message });
    }
  }
}

export default new RoleFastifyController();
