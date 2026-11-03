/**
 * PDF affine transforms use [a,b,c,d,e,f]:
 * x' = a*x + c*y + e, y' = b*x + d*y + f.
 * Kept isolated so transform composition can be tested without loading PDF libraries.
 */
export type Affine6 = [number, number, number, number, number, number];

/** Compose transforms A after B (apply B first, then A). */
export const multiplyAffine = (A: Affine6, B: Affine6): Affine6 => [
  A[0] * B[0] + A[2] * B[1],
  A[1] * B[0] + A[3] * B[1],
  A[0] * B[2] + A[2] * B[3],
  A[1] * B[2] + A[3] * B[3],
  A[0] * B[4] + A[2] * B[5] + A[4],
  A[1] * B[4] + A[3] * B[5] + A[5],
];

export const invertAffine = (T: Affine6): Affine6 => {
  const d = T[0] * T[3] - T[1] * T[2];
  if (!Number.isFinite(d) || Math.abs(d) < 1e-12) {
    throw new Error("This PDF page has an unsupported coordinate transform.");
  }
  return [
    T[3] / d,
    -T[1] / d,
    -T[2] / d,
    T[0] / d,
    (T[2] * T[5] - T[3] * T[4]) / d,
    (T[1] * T[4] - T[0] * T[5]) / d,
  ];
};
