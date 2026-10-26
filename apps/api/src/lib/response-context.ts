import type { NextFunction, Response } from "express";

/**
 * Calls the next Express handler but keeps the surrounding async context
 * (and therefore the tenant transaction) alive until the response has been
 * fully sent or the client disconnects.
 */
export function continueWithinContext(
  res: Response,
  next: NextFunction,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;

    const finish = (): void => {
      if (settled) return;
      settled = true;
      res.off("finish", finish);
      res.off("close", finish);
      resolve();
    };

    res.once("finish", finish);
    res.once("close", finish);

    try {
      next();
    } catch (err) {
      if (!settled) {
        settled = true;
        res.off("finish", finish);
        res.off("close", finish);
      }
      reject(err);
    }
  });
}
