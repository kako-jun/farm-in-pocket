// Phase 0 ではテーブル定義の TS 表現は最小限。実装は #9 以降で。

export type GridEnvironment =
  | "outdoor_sunny"
  | "outdoor_partial_shade"
  | "outdoor_shade"
  | "indoor"
  | "greenhouse";

export type GridLighting = "natural_only" | "grow_light" | "fluorescent_led";

export type ContainerType =
  | "jiue"
  | "planter"
  | "pot"
  | "container"
  | "board_mounted"
  | "hanging"
  | "hydroponics"
  | "other"
  | "void";

export type SoilType =
  | "potting_mix"
  | "akadama"
  | "leafmold"
  | "hydroball"
  | "sphagnum"
  | "coconut_chips"
  | "pumice"
  | "sand"
  | "water_only"
  | "hydroponics_nutrient"
  | "none"
  | "other";

export type PlantingState = "planted" | "growing" | "ended";

export type PlantingEndTag =
  | "bloomed"
  | "fruited"
  | "died"
  | "disease"
  | "pest"
  | "failed"
  | "removed";

export type Season = "spring" | "summer" | "autumn" | "winter";
