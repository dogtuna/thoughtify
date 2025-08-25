export function getPriority(taskType = "explore", confidence = 0) {
  // Ensure confidence is a value between 0 and 1 before converting to percent
  const normalizedConfidence = Math.min(1, Math.max(0, confidence));
  const pct = normalizedConfidence * 100;

  if (pct <= 40) {
    switch (taskType) {
      case "validate":
        return "critical";
      case "refute":
        return "low";
      default: // 'explore'
        return "high";
    }
  }

  if (pct <= 75) {
    switch (taskType) {
      case "validate":
        return "high";
      case "refute":
        return "medium";
      default: // 'explore'
        return "low";
    }
  }

  // Confidence is > 75%
  switch (taskType) {
    case "refute":
      return "medium";
    default: // 'validate' and 'explore'
      return "low";
  }
}

export default { getPriority };