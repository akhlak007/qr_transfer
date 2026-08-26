/**
 * Visual OFDM Synthetic Optical Channel (Milestone 4C)
 *
 * Implements:
 * - 2D Spatial optical degradation models (Gaussian noise, exposure drift, blur, perspective tilt)
 * - Sensor quantization and photon shot noise
 * - Seeded deterministic PRNG for 100% reproducible tests
 *
 * NOTE: For automated stress-testing only; does not replace physical camera experiments.
 */

export * from "./ofdm-synthetic-channel";
