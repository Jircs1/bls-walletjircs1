import {
  BigNumber,
  Bundle,
  bundleFromDto,
  bundleToDto,
  ethers,
  sqlite,
} from "../../deps.ts";

import assertExists from "../helpers/assertExists.ts";
import ExplicitAny from "../helpers/ExplicitAny.ts";
import { parseBundleDto } from "./parsers.ts";
import nil from "../helpers/nil.ts";

/**
 * Representation used when talking to the database. It's 'raw' in the sense
 * that it only uses primitive types, because the database cannot know about
 * custom classes like BigNumber.
 */
type RawRow = {
  id: number;
  status: string;
  hash: string;
  bundle: string;
  eligibleAfter: string;
  nextEligibilityDelay: string;
  submitError: string | null;
  receipt: string | null;
};

const BundleStatuses = ["pending", "confirmed", "failed"] as const;
type BundleStatus = typeof BundleStatuses[number];

type Row = {
  id: number;
  status: BundleStatus;
  hash: string;
  bundle: Bundle;
  eligibleAfter: BigNumber;
  nextEligibilityDelay: BigNumber;
  submitError?: string;
  receipt?: ethers.ContractReceipt;
};

type InsertRow = Omit<Row, "id">;
type InsertRawRow = Omit<RawRow, "id">;

export function makeHash() {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return ethers.utils.hexlify(buf);
}

export type BundleRow = Row;

function fromRawRow(rawRow: RawRow): Row {
  const parseBundleResult = parseBundleDto(JSON.parse(rawRow.bundle));
  if ("failures" in parseBundleResult) {
    throw new Error(parseBundleResult.failures.join("\n"));
  }

  const status = rawRow.status;
  if (!isValidStatus(status)) {
    throw new Error(`Not a valid bundle status: ${status}`);
  }

  const receipt: ethers.ContractReceipt = rawRow.receipt
    ? JSON.parse(rawRow.receipt)
    : nil;

  return {
    ...rawRow,
    submitError: rawRow.submitError ?? nil,
    bundle: bundleFromDto(parseBundleResult.success),
    eligibleAfter: BigNumber.from(rawRow.eligibleAfter),
    nextEligibilityDelay: BigNumber.from(rawRow.nextEligibilityDelay),
    receipt,
    status,
  };
}

function toInsertRawRow(row: InsertRow): InsertRawRow {
  return {
    ...row,
    submitError: row.submitError ?? null,
    bundle: JSON.stringify(bundleToDto(row.bundle)),
    eligibleAfter: toUint256Hex(row.eligibleAfter),
    nextEligibilityDelay: toUint256Hex(row.nextEligibilityDelay),
    receipt: JSON.stringify(row.receipt),
  };
}

function toRawRow(row: Row): RawRow {
  return {
    ...row,
    submitError: row.submitError ?? null,
    bundle: JSON.stringify(bundleToDto(row.bundle)),
    eligibleAfter: toUint256Hex(row.eligibleAfter),
    nextEligibilityDelay: toUint256Hex(row.nextEligibilityDelay),
    receipt: JSON.stringify(row.receipt),
  };
}

export default class BundleTable {
  constructor(public db: sqlite.DB) {
    this.db.query(`
      CREATE TABLE IF NOT EXISTS bundles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        status TEXT NOT NULL,
        hash TEXT NOT NULL,
        bundle TEXT NOT NULL,
        eligibleAfter TEXT NOT NULL,
        nextEligibilityDelay TEXT NOT NULL,
        submitError TEXT,
        receipt TEXT
      )
    `);
  }

  add(...rows: InsertRow[]) {
    for (const row of rows) {
      const rawRow = toInsertRawRow(row);

      this.db.query(
        `
          INSERT INTO bundles (
            id,
            status,
            hash,
            bundle,
            eligibleAfter,
            nextEligibilityDelay,
            submitError,
            receipt
          ) VALUES (
            :id,
            :status,
            :hash,
            :bundle,
            :eligibleAfter,
            :nextEligibilityDelay,
            :submitError,
            :receipt
          )
        `,
        {
          ":status": rawRow.status,
          ":hash": rawRow.hash,
          ":bundle": rawRow.bundle,
          ":eligibleAfter": rawRow.eligibleAfter,
          ":nextEligibilityDelay": rawRow.nextEligibilityDelay,
          ":submitError": rawRow.submitError,
          ":receipt": rawRow.receipt,
        },
      );
    }
  }

  update(row: Row) {
    const rawRow = toRawRow(row);

    this.db.query(
      `
        UPDATE bundles
        SET
          status = :status,
          hash = :hash,
          bundle = :bundle,
          eligibleAfter = :eligibleAfter,
          nextEligibilityDelay = :nextEligibilityDelay,
          submitError = :submitError,
          receipt = :receipt
        WHERE
          id = :id
      `,
      {
        ":id": rawRow.id,
        ":status": rawRow.status,
        ":hash": rawRow.hash,
        ":bundle": rawRow.bundle,
        ":eligibleAfter": rawRow.eligibleAfter,
        ":nextEligibilityDelay": rawRow.nextEligibilityDelay,
        ":submitError": rawRow.submitError,
        ":receipt": rawRow.receipt,
      },
    );
  }

  remove(...rows: Row[]) {
    for (const row of rows) {
      this.db.query(
        "DELETE FROM bundles WHERE id = :id",
        { ":id": assertExists(row.id) },
      );
    }
  }

  findEligible(blockNumber: BigNumber, limit: number) {
    const rows = this.db.query(
      `
        SELECT * from bundles
        WHERE
          eligibleAfter <= '${toUint256Hex(blockNumber)}' AND
          status = 'pending'
        ORDER BY id ASC
        LIMIT :limit
      `,
      {
        ":limit": limit,
      },
    );

    // TODO: Manual test / typing
    return rows.map(fromRawRow as any);
  }

  findBundle(hash: string): Row | nil {
    const rows: RawRow[] = this.db.query(
      "SELECT * from bundles WHERE hash = :hash",
      { ":hash": hash },
    ) as any; // TODO: Manual test / typing

    return rows.map(fromRawRow)[0];
  }

  count(): number {
    const result = this.db.query("SELECT COUNT(*) FROM bundles");

    // TODO: Manual test / typing
    return result[0][0] as number;
  }

  all(): Row[] {
    const rawRows: RawRow[] = this.db.query(
      "SELECT * FROM bundles",
    ) as any; // TODO: Manual test / typing

    return rawRows.map(fromRawRow);
  }

  drop() {
    this.db.query("DROP TABLE bundles");
  }

  clear() {
    this.db.query("DELETE from bundles");
  }
}

function toUint256Hex(n: BigNumber) {
  return `0x${n.toHexString().slice(2).padStart(64, "0")}`;
}

function isValidStatus(status: unknown): status is BundleStatus {
  return typeof status === "string" &&
    BundleStatuses.includes(status as ExplicitAny);
}
