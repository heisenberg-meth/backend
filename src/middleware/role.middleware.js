export const authorize = (...roles) => {
  return (req, res, next) => next();
};
export default { authorize };
