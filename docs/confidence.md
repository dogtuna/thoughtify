# Confidence Scaling

Hypothesis confidence is derived from a weighted sum of supporting and refuting evidence. After each triage event, the raw score is passed through a logistic function to keep values between `0` and `1`:

```
confidence = 1 / (1 + Math.exp(-slope * raw))
```

The `slope` parameter (default `1.0`) controls how quickly confidence reacts to new evidence. It is defined in `src/utils/confidence.js` and can be adjusted to tune sensitivity. Large positive scores asymptotically approach `1.0`, while large negative scores approach `0`.
