import type { JestConfigWithTsJest } from "ts-jest/dist/types";
import tsJestPresets from "ts-jest/presets";
const config: JestConfigWithTsJest = {
  transform: {
    ".*\\.tsx?": ["ts-jest", tsJestPresets.jsWithTsESM],
  },
  testMatch: ["./**/?(*.)+(spec|test).[t]s?(x)"],
};
export default config;
