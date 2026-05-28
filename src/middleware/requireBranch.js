/**
 * Middleware: Require branchId on request context.
 * Use on routes where branch-level isolation is mandatory
 * (inventory, sales, billing, imports).
 *
 * Must run AFTER authenticate middleware which sets request.branchId.
 */
export const requireBranch = async (request, reply) => {
  if (!request.branchId) {
    return reply.code(403).send({
      success: false,
      error: {
        message: 'Branch context required. User must be assigned to a branch.',
        code: 'BRANCH_REQUIRED',
      },
    });
  }
};
