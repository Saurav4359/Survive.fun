import type { ApiResponse } from "@survivefun/types";
import type { NextFunction, Request, Response } from "express";

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = "AppError";
  }
}

function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

function isExpressErr(err: unknown): err is { statusCode?: number; message?: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    "statusCode" in err &&
    typeof (err as { statusCode: unknown }).statusCode === "number"
  );
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) {
    return;
  }

  if (isAppError(err)) {
    const body: ApiResponse<never> = {
      success: false,
      error: { code: err.code, message: err.message },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  if (isExpressErr(err)) {
    const status = err.statusCode ?? 500;
    const body: ApiResponse<never> = {
      success: false,
      error: {
        code: "HTTP_ERROR",
        message: typeof err.message === "string" ? err.message : "Request failed",
      },
    };
    res.status(status).json(body);
    return;
  }

  const body: ApiResponse<never> = {
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    },
  };
  res.status(500).json(body);
}
