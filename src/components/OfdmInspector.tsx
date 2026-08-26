/**
 * Visual OFDM Inspector (Milestone 4D)
 *
 * Research-oriented live telemetry instrument for spatial frequency-domain optical communication.
 *
 * Displays:
 * - Experimental and NOT PHYSICALLY TESTED badges
 * - 2D Subcarrier spatial-frequency grid allocation (DC, Pilots, Data, Guards)
 * - 1D/2D Constellation plot (BPSK, QPSK, 16-QAM)
 * - Pilot synchronization confidence and channel gain
 * - Estimated SNR (dB) and BER
 * - Subcarrier utilization efficiency
 * - CRC status and demodulation state
 *
 * NOTE: Explicitly designated as an Experimental Research Instrument (Not Physically Tested).
 */

import React from "react";
import { OfdmSpectrumInspector, type OfdmSpectrumInspectorProps } from "./OfdmSpectrumInspector";

export type OfdmInspectorProps = OfdmSpectrumInspectorProps;

export const OfdmInspector: React.FC<OfdmInspectorProps> = (props) => {
  return <OfdmSpectrumInspector {...props} />;
};

export default OfdmInspector;
