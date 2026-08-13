export const compareVersions = (a, b) => {
  const parse = (v) => parseInt(v.replace('v', ''), 10);
  return parse(a) - parse(b);
};
