/** Pure projected-coordinate geometry. No image recognition, confidence or device control. */
export const WORKFLOW_THRESHOLDS = Object.freeze({ angleDeg: 10, offset: 0.15, vectorEpsilon: 1e-6 });
const REQUIRED = Object.freeze(['E', 'W', 'M']);
const AUXILIARY = Object.freeze(['T']);
const isVec2 = v => Array.isArray(v) && v.length === 2 && v.every(x => typeof x === 'number' && Number.isFinite(x));
const copy = v => isVec2(v) ? [...v] : null;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const norm = v => Math.hypot(v[0], v[1]);
const cleanZero = n => n === 0 ? 0 : n;
const signedAngle = (a, b) => cleanZero(Math.atan2(cross(a, b), dot(a, b)) * 180 / Math.PI);
const addScaled = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s];

/**
 * points/anchor use one camera image's x-right, y-down pixel coordinates.
 * axis points toward the hand and may have any nonzero length.
 * E/W/M are required; T is auxiliary and does not enter these three formulae.
 * cameraValid must be exactly true. The caller owns frustum, occlusion and reference checks.
 */
export function evaluateCapture(input = {}) {
  const data = input && typeof input === 'object' ? input : {};
  const points = data.points && typeof data.points === 'object' ? data.points : {};
  const missingRequired = REQUIRED.filter(k => points[k] == null);
  const invalidRequired = REQUIRED.filter(k => points[k] != null && !isVec2(points[k]));
  const missingAuxiliary = AUXILIARY.filter(k => !isVec2(points[k]));
  const trace = {
    source: typeof data.source === 'string' ? data.source : 'unspecified',
    cameraValid: data.cameraValid === true,
    points: Object.fromEntries([...REQUIRED, ...AUXILIARY].map(k => [k, copy(points[k])])),
    axis: copy(data.axis), anchor: copy(data.anchor),
    missingRequired, invalidRequired, missingAuxiliary,
    requiredPoints: [...REQUIRED], auxiliaryPoints: [...AUXILIARY],
    axisUnit: null, perpendicularUnit: null, handVector: null, forearmVector: null,
    wristOffset: null, referenceLength: null, handLength: null, axisLength: null,
    signedPerpendicularPixels: null, alongAxisPixels: null,
    alphaCross: null, alphaDot: null, betaCross: null, betaDot: null,
    signedBeta: null, signedForearm: null, thresholds: { ...WORKFLOW_THRESHOLDS },
    checks: { alphaExceeded: null, betaExceeded: null, offsetExceeded: null },
    calculated: false,
    coordinateConvention: 'camera pixels: x right, y down; positive lateral uses [-axis.y, axis.x]',
  };
  const pausedCorrection = () => ({
    mode: 'pause', rotateHandDeg: null, rotateForearmDeg: null, translatePixels: null,
    signedTranslateD: null, targetPoints: null, requiresRecapture: true,
    scope: '2D projected geometry only; no 3D inverse solution or equipment command',
  });
  const stop = (code, reasons) => ({
    alpha: null, beta: null, d: null, signedAlpha: null, signedD: null,
    state: 'S3', code, reasons, errorCodes: [code], trace, correction: pausedCorrection(),
  });
  if (data.cameraValid !== true) return stop('REFERENCE_INVALID', ['摄像机或基准参照无效，暂停计算；重新确认视角和基准后再次捕获。']);
  if (!isVec2(data.axis) || !isVec2(data.anchor)) return stop('REFERENCE_INVALID', ['基准方向或基准锚点缺失、格式错误或数值无效，暂停计算。']);
  if (missingRequired.length) return stop('POINT_MISSING', [`必需关键点 ${missingRequired.join('、')} 缺失，暂停计算并清空 α、β、d。`]);
  if (invalidRequired.length) return stop('POINT_INVALID', [`必需关键点 ${invalidRequired.join('、')} 坐标无效，暂停计算并清空 α、β、d。`]);

  const hand = sub(points.M, points.W), forearm = sub(points.W, points.E);
  const handLength = norm(hand), referenceLength = norm(forearm), axisLength = norm(data.axis);
  Object.assign(trace, { handVector: hand, forearmVector: forearm, handLength, referenceLength, axisLength });
  if (![...hand, ...forearm, handLength, referenceLength, axisLength].every(Number.isFinite)) return stop('POINT_INVALID', ['坐标尺度超出可计算范围，暂停计算。']);
  const badVectors = [];
  if (referenceLength < WORKFLOW_THRESHOLDS.vectorEpsilon) badVectors.push('EW 参考长度');
  if (handLength < WORKFLOW_THRESHOLDS.vectorEpsilon) badVectors.push('WM 手轴长度');
  if (axisLength < WORKFLOW_THRESHOLDS.vectorEpsilon) badVectors.push('基准方向长度');
  if (badVectors.length) return stop('VECTOR_DEGENERATE', [`${badVectors.join('、')}为零或小于数值下限，暂停计算。`]);

  const axisUnit = data.axis.map(x => x / axisLength);
  const perpendicularUnit = [-axisUnit[1], axisUnit[0]];
  const wristOffset = sub(points.W, data.anchor);
  const signedPerpendicularPixels = cleanZero(dot(wristOffset, perpendicularUnit));
  const alongAxisPixels = cleanZero(dot(wristOffset, axisUnit));
  const signedAlpha = signedAngle(axisUnit, hand);
  const signedBeta = signedAngle(forearm, hand);
  const signedForearm = signedAngle(axisUnit, forearm);
  const signedD = cleanZero(signedPerpendicularPixels / referenceLength);
  const alpha = Math.abs(signedAlpha), beta = Math.abs(signedBeta), d = Math.abs(signedD);
  if (![...wristOffset, signedPerpendicularPixels, alongAxisPixels, signedAlpha, signedBeta, signedForearm, signedD, cross(axisUnit, hand), dot(axisUnit, hand), cross(forearm, hand), dot(forearm, hand)].every(Number.isFinite)) return stop('POINT_INVALID', ['坐标尺度超出可计算范围，暂停计算。']);
  // Branch on unrounded IEEE-754 values; display formatting must occur in the UI.
  const checks = {
    alphaExceeded: alpha > WORKFLOW_THRESHOLDS.angleDeg,
    betaExceeded: beta > WORKFLOW_THRESHOLDS.angleDeg,
    offsetExceeded: d > WORKFLOW_THRESHOLDS.offset,
  };
  Object.assign(trace, {
    axisUnit, perpendicularUnit, wristOffset, signedPerpendicularPixels, alongAxisPixels,
    alphaCross: cross(axisUnit, hand), alphaDot: dot(axisUnit, hand),
    betaCross: cross(forearm, hand), betaDot: dot(forearm, hand),
    signedBeta, signedForearm, checks, calculated: true,
  });
  const errorCodes = [], reasons = [];
  if (checks.alphaExceeded) {
    errorCodes.push('AXIS_DEVIATION');
    reasons.push('α 超过 10°：手轴偏离基准方向，需要调整后重新捕获。');
  }
  if (checks.betaExceeded) {
    errorCodes.push('HAND_FOREARM_DEVIATION');
    reasons.push('β 超过 10°：手轴与前臂轴夹角偏大，需要调整后重新捕获。');
  }
  if (checks.offsetExceeded) {
    errorCodes.push('REFERENCE_OFFSET');
    reasons.push('d 超过 0.15：腕点相对基准轴的横向偏移偏大，需要调整后重新捕获。');
  }
  const state = errorCodes.length ? 'S2' : 'S1';
  if (state === 'S1') reasons.push('未发现超过预设阈值的可见几何偏差，待人工确认；不等同于临床投影质量合格。');
  const translatePixels = perpendicularUnit.map(x => cleanZero(-signedPerpendicularPixels * x));
  const targetW = [points.W[0] + translatePixels[0], points.W[1] + translatePixels[1]];
  const targetPoints = {
    E: addScaled(targetW, axisUnit, -referenceLength), W: targetW,
    M: addScaled(targetW, axisUnit, handLength), T: null,
  };
  if (isVec2(points.T)) {
    const localT = sub(points.T, points.W), angle = -signedAlpha * Math.PI / 180;
    targetPoints.T = [
      targetW[0] + Math.cos(angle) * localT[0] - Math.sin(angle) * localT[1],
      targetW[1] + Math.sin(angle) * localT[0] + Math.cos(angle) * localT[1],
    ];
  }
  const correction = {
    mode: state === 'S2' ? 'adjust' : 'manual_confirmation',
    rotateHandDeg: cleanZero(-signedAlpha), rotateForearmDeg: cleanZero(-signedForearm),
    translatePixels, signedTranslateD: cleanZero(-signedD), targetPoints,
    requiresRecapture: state === 'S2',
    scope: '2D projected geometry only; no 3D inverse solution or equipment command',
  };
  return { alpha, beta, d, signedAlpha, signedD, state, code: errorCodes[0] || 'NO_DEFINED_VISIBLE_DEVIATION', reasons, errorCodes, trace, correction };
}
