// Psychometric Reliability & Norming Calculations (Phase 3)

/**
 * Calculates Cronbach's Alpha (α) coefficient of internal consistency reliability:
 * α = (K / (K - 1)) * (1 - (Σ σ_i^2) / σ_X^2)
 *
 * @param responsesMatrix Array of candidate responses [candidate_index][item_index] (scores 0 or 1, or rating points)
 */
export function calculateCronbachAlpha(responsesMatrix: number[][]): {
  alpha: number;
  grade: "HIGH" | "GOOD" | "LOW";
  label: string;
} {
  const N = responsesMatrix.length;
  if (N < 2) {
    return { alpha: 1.0, grade: "HIGH", label: "High (Insufficient Data)" };
  }

  const K = responsesMatrix[0]?.length ?? 0;
  if (K < 2) {
    return { alpha: 1.0, grade: "HIGH", label: "High (Single Item)" };
  }

  // Calculate variance for each item i
  let itemVariancesSum = 0;
  for (let col = 0; col < K; col++) {
    let itemSum = 0;
    for (let row = 0; row < N; row++) {
      itemSum += responsesMatrix[row][col] ?? 0;
    }
    const itemMean = itemSum / N;

    let itemVarSum = 0;
    for (let row = 0; row < N; row++) {
      const diff = (responsesMatrix[row][col] ?? 0) - itemMean;
      itemVarSum += diff * diff;
    }
    itemVariancesSum += itemVarSum / N;
  }

  // Calculate variance of total candidate scores
  const totalScores: number[] = new Array(N).fill(0);
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < K; col++) {
      totalScores[row] += responsesMatrix[row][col] ?? 0;
    }
  }

  const totalMean = totalScores.reduce((sum, v) => sum + v, 0) / N;
  const totalVar =
    totalScores.reduce((sum, v) => sum + Math.pow(v - totalMean, 2), 0) / N;

  if (totalVar === 0) {
    return { alpha: 1.0, grade: "HIGH", label: "High (Uniform Scores)" };
  }

  const rawAlpha = (K / (K - 1)) * (1 - itemVariancesSum / totalVar);
  const alpha = Math.max(0, Math.min(1, Number(rawAlpha.toFixed(2))));

  let grade: "HIGH" | "GOOD" | "LOW" = "LOW";
  let label = "Low (Needs Calibration)";

  if (alpha >= 0.8) {
    grade = "HIGH";
    label = "High (Excellent)";
  } else if (alpha >= 0.7) {
    grade = "GOOD";
    label = "Good (Acceptable)";
  }

  return { alpha, grade, label };
}

/**
 * Calculates empirical rank-based percentile rank against norm group distribution:
 * P = ((count_below + 0.5 * count_equal) / total_candidates) * 100
 */
export function calculatePercentileRank(
  normGroupScores: number[],
  rawScore: number,
): number {
  if (normGroupScores.length === 0) return 50.0;

  let countBelow = 0;
  let countEqual = 0;

  for (const score of normGroupScores) {
    if (score < rawScore) countBelow++;
    else if (score === rawScore) countEqual++;
  }

  const percentile =
    ((countBelow + 0.5 * countEqual) / normGroupScores.length) * 100;
  return Number(percentile.toFixed(1));
}
