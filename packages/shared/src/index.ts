// @farm-in-pocket/shared
// Shared type definitions across web and api.
// Populated in #8 onward.

export type FarmInPocketVersion = "0.0.0-phase-0";
export const FARM_IN_POCKET_VERSION: FarmInPocketVersion = "0.0.0-phase-0";

export * from "./db";
export * from "./fade";
export * from "./farm";
export * from "./farm-events";
export * from "./mypace";
export * from "./nostr";
export * from "./relay";
export * from "./upload";
