import { defineConfig } from "hardhat/config";
import { createRequire } from "node:module";
import viem from "@nomicfoundation/hardhat-viem";
import tests from "@nomicfoundation/hardhat-node-test-runner";
import helpers from "@nomicfoundation/hardhat-network-helpers";
import assertions from "@nomicfoundation/hardhat-viem-assertions";

export default defineConfig({
  plugins: [viem, tests, helpers, assertions],
  solidity: { version: "0.8.28", path: createRequire(import.meta.url).resolve("solc/soljson.js") },
  networks: {
    default: { type: "edr-simulated", chainType: "l1" },
  },
});
