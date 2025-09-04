// Mapping of notification types to sidebar categories
export const TYPE_CATEGORY_MAP = {
  questionsAnswered: "questions",
  answerReceived: "messages",
  suggestedTasks: "tasks",
  suggestedQuestions: "questions",
  suggestedHypotheses: "inquiry",
  hypothesisConfidence: "inquiry",
};

// Aggregate unread notification counts by sidebar category
export const computeUnreadCounts = (notifs = []) =>
  notifs.reduce((acc, n) => {
    const c = n.count || 0;
    if (c > 0) {
      const key = TYPE_CATEGORY_MAP[n.type] || n.type;
      acc[key] = (acc[key] || 0) + c;
    }
    return acc;
  }, {});
