export const omitEmptyStrings = (obj = {}) =>
  Object.fromEntries(
    Object.entries(obj).filter(
      ([, v]) => !(typeof v === "string" && v.trim() === "")
    )
  );
