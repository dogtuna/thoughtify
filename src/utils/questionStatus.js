export const STATUS = {
  ASK: "Ask",
  ASKED: "Asked",
  ANSWERED: "Answered",
};

export function initStatus() {
  const timestamp = new Date().toISOString();
  return {
    currentStatus: STATUS.ASK,
    history: [{ status: STATUS.ASK, timestamp }],
    answers: [],
  };
}

export function markAsked(state) {
  const timestamp = new Date().toISOString();
  const next = state ? { ...state } : initStatus();
  if (next.currentStatus !== STATUS.ASKED) {
    next.currentStatus = STATUS.ASKED;
    next.history = [...(next.history || []), { status: STATUS.ASKED, timestamp }];
  }
  next.askedAt = timestamp;
  return next;
}

export function markAnswered(state, answer) {
  const timestamp = new Date().toISOString();
  const next = state ? { ...state } : initStatus();
  next.currentStatus = STATUS.ANSWERED;
  next.history = [...(next.history || []), { status: STATUS.ANSWERED, timestamp }];
  if (answer) {
    next.answers = [...(next.answers || []), { ...answer, answeredAt: timestamp }];
  }
  return next;
}
