import { describe, expect, it } from "vitest";
import { computeUnreadCounts } from "../notificationUtils.js";

describe("computeUnreadCounts", () => {
  it("groups notification counts by sidebar category", () => {
    const sample = [
      { type: "questionsAnswered", count: 2 },
      { type: "suggestedTasks", count: 1 },
      { type: "answerReceived", count: 3 },
      { type: "suggestedHypotheses", count: 4 },
      { type: "hypothesisConfidence", count: 1 },
    ];

    expect(computeUnreadCounts(sample)).toEqual({
      questions: 2,
      tasks: 1,
      messages: 3,
      inquiry: 5,
    });
  });

  it("falls back to the notification type when no mapping exists", () => {
    const sample = [{ type: "other", count: 2 }];
    expect(computeUnreadCounts(sample)).toEqual({ other: 2 });
  });
});

