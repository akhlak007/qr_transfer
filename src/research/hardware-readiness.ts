/**
 * Hardware Readiness Gate & Pre-Flight Evaluator (Milestone 7G)
 *
 * Implements:
 * - Pre-run hardware readiness gating for real screen-to-camera experiments
 * - Verification of camera stream, measured FPS, throw distance, ambient lux, and payload
 * - Strict non-fabrication gate: Blocks execution unless all physical criteria pass
 *
 * NOTE: For physical optical research execution.
 */

export interface HardwareReadinessCriteria {
  cameraPermission: boolean;
  cameraStreamAvailable: boolean;
  cameraResolution: { width: number; height: number } | null;
  measuredFps: number | null;
  transmitterCanvasAvailable: boolean;
  displayResolution: { width: number; height: number } | null;
  opticalDistanceCm: number | null;
  ambientLux: number | null;
  selectedModulation: string;
  payloadLoaded: boolean;
  expectedSha256: string;
  physicalEvidenceMode: boolean;
}

export interface HardwareReadinessResult {
  ready: boolean;
  status: "READY" | "NOT_READY";
  passedChecksCount: number;
  totalChecksCount: number;
  errors: string[];
  warnings: string[];
  evaluatedAt: number;
}

/**
 * Evaluate whether the physical setup passes all mandatory pre-run hardware gates.
 */
export function evaluateHardwareReadiness(
  criteria: HardwareReadinessCriteria
): HardwareReadinessResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let passedChecks = 0;
  const totalChecks = 10;

  // 1. Camera permission & stream check
  if (!criteria.cameraPermission) {
    errors.push("Camera permission has not been granted by user/browser.");
  } else if (!criteria.cameraStreamAvailable) {
    errors.push("Active camera MediaStream is unavailable or disconnected.");
  } else {
    passedChecks++;
  }

  // 2. Camera resolution check
  if (
    !criteria.cameraResolution ||
    criteria.cameraResolution.width <= 0 ||
    criteria.cameraResolution.height <= 0
  ) {
    errors.push("Camera resolution is invalid or unmeasured.");
  } else {
    passedChecks++;
    if (criteria.cameraResolution.width < 640 || criteria.cameraResolution.height < 480) {
      warnings.push("Camera resolution is below recommended 640×480 threshold.");
    }
  }

  // 3. Sensor Frame Rate check
  if (criteria.measuredFps === null || criteria.measuredFps <= 0) {
    errors.push("Measured camera sensor frame rate must be greater than 0 FPS.");
  } else {
    passedChecks++;
    if (criteria.measuredFps < 15) {
      warnings.push(`Low measured sensor frame rate: ${criteria.measuredFps} FPS (recommended >= 24 FPS).`);
    }
  }

  // 4. Transmitter canvas check
  if (!criteria.transmitterCanvasAvailable) {
    errors.push("Transmitter display canvas element is unavailable.");
  } else {
    passedChecks++;
  }

  // 5. Display resolution check
  if (
    !criteria.displayResolution ||
    criteria.displayResolution.width <= 0 ||
    criteria.displayResolution.height <= 0
  ) {
    errors.push("Transmitter display dimensions are unmeasured or zero.");
  } else {
    passedChecks++;
  }

  // 6. Optical throw distance check
  if (criteria.opticalDistanceCm === null || criteria.opticalDistanceCm <= 0) {
    errors.push("Optical throw distance must be specified and greater than 0 cm.");
  } else {
    passedChecks++;
  }

  // 7. Ambient illumination check
  if (criteria.ambientLux === null || criteria.ambientLux < 0) {
    errors.push("Ambient illumination (lux) must be specified and non-negative.");
  } else {
    passedChecks++;
  }

  // 8. Modulation selection check
  if (!criteria.selectedModulation || criteria.selectedModulation.trim() === "") {
    errors.push("Optical modulation scheme has not been selected.");
  } else {
    passedChecks++;
  }

  // 9. Payload & Expected SHA-256 check
  if (!criteria.payloadLoaded) {
    errors.push("Transmission payload is not loaded.");
  } else if (!criteria.expectedSha256 || criteria.expectedSha256.length !== 64) {
    errors.push("Missing or invalid 64-character expected SHA-256 digest.");
  } else {
    passedChecks++;
  }

  // 10. Physical Evidence Mode Lock
  if (!criteria.physicalEvidenceMode) {
    errors.push("Physical Evidence Mode is disabled (synthetic/simulation mode active).");
  } else {
    passedChecks++;
  }

  const ready = errors.length === 0;

  return {
    ready,
    status: ready ? "READY" : "NOT_READY",
    passedChecksCount: passedChecks,
    totalChecksCount: totalChecks,
    errors,
    warnings,
    evaluatedAt: Date.now(),
  };
}
