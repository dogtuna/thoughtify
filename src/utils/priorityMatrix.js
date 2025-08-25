export function getPriority(taskType = "explore", confidence = 0) {
  const pct = confidence > 1 ? confidence : confidence * 100;
  if (pct <= 40) {
    switch (taskType) {
      case "validate":
        return "critical";
      case "refute":
        return "low";
      default:
        return "high";
    }
  }
  if (pct <= 75) {
    switch (taskType) {
      case "validate":
        return "high";
      case "refute":
        return "medium";
      default:
        return "low";
    }
  }
  switch (taskType) {
    case "refute":
      return "medium";
    default:
      return "low";
  }
}

export default { getPriority };
