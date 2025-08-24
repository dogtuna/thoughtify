# Confidence Scaling

Hypothesis confidence is derived from a weighted sum of supporting and refuting evidence. Each piece of evidence is evaluated on three axes with the following multipliers:

| Axis | Options | Multiplier |
| --- | --- | --- |
| **Source Authority** | High / Medium / Low | 1.5 / 1.0 / 0.5 |
| **Evidence Type** | Quantitative / Qualitative | 1.2 / 0.8 |
| **Directness** | Direct / Indirect | 1.3 / 0.7 |

The base impact score (`High` = 0.2, `Medium` = 0.1, `Low` = 0.05) is multiplied by all three axes to determine the contribution of the evidence. When both qualitative and quantitative evidence from different sources support the same hypothesis, the resulting score is multiplied by a **corroboration factor** of `2.0` to emphasize the convergence of diverse evidence.

After summing all contributions, the raw score is passed through a logistic function to keep values between `0` and `1`:

```
confidence = 1 / (1 + Math.exp(-slope * raw))
```

The `slope` parameter (default `1.0`) controls how quickly confidence reacts to new evidence. It is defined in `src/utils/confidence.js` and can be adjusted to tune sensitivity. Large positive scores asymptotically approach `1.0`, while large negative scores approach `0`.

When high-authority sources provide conflicting support and refutation for the same hypothesis, that hypothesis is flagged as **contested** so that stakeholders can resolve the discrepancy.
