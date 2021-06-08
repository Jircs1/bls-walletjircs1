import { requireBoolEnv, requireEnv } from "../helpers/envTools.ts";

export const USE_TEST_NET = requireBoolEnv("USE_TEST_NET");

export const PRIVATE_KEY_AGG = requireEnv("PRIVATE_KEY_AGG");

export const DEPLOYER_ADDRESS = requireEnv("DEPLOYER_ADDRESS");

export const VERIFICATION_GATEWAY_ADDRESS = requireEnv(
  "VERIFICATION_GATEWAY_ADDRESS",
);

export const BLS_EXPANDER_ADDRESS = requireEnv("BLS_EXPANDER_ADDRESS");

export const TOKEN_ADDRESS = requireEnv("TOKEN_ADDRESS");

export const PG = {
  HOST: requireEnv("PG_HOST"),
  PORT: requireEnv("PG_PORT"),
  USER: requireEnv("PG_USER"),
  PASSWORD: requireEnv("PG_PASSWORD"),
  DB_NAME: requireEnv("PG_DB_NAME"),
};
