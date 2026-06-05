const formatResponse = (data, message = 'Success') => ({
  message,
  data,
  timestamp: new Date().toISOString(),
});

const formatError = (message, code = 'ERROR') => ({
  message,
  code,
  timestamp: new Date().toISOString(),
});

const paginate = (model, query, options = {}) => {
  const { page = 1, limit = 10, sort = { createdAt: -1 } } = options;
  return model
    .find(query)
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit);
};

export default { formatResponse, formatError, paginate };
