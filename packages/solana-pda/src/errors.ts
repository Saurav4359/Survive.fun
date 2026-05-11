export type PdaInvariantCode =
  | "MARKET_PDA_MISMATCH"
  | "MARKET_PDA_MISSING_STORED";

export class PdaInvariantError extends Error {
  readonly code: PdaInvariantCode;

  constructor(code: PdaInvariantCode, message: string) {
    super(message);
    this.name = "PdaInvariantError";
    this.code = code;
  }
}
