import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';

/**
 * Validate a request against a schema shaped as
 * `z.object({ body?, query?, params? })`, and replace req.body with the
 * parsed result.
 *
 * Assigning the body back is the point: zod drops keys the schema does not
 * declare, but only in its output. Discarding that output left undeclared
 * keys on req.body for controllers to read — the same mass-assignment gap
 * that validateBody had.
 *
 * Only the body is replaced. Params and query keys come from the route
 * pattern and query string and are read individually by name, so there is
 * nothing to strip; reassigning them is also unsafe, since Express
 * repopulates req.params per router layer and req.query is a prototype
 * getter that later Express versions make read-only.
 *
 * A schema is therefore the complete list of body fields an endpoint accepts.
 * Anything a controller reads must be declared, or it arrives as undefined.
 */
export const validate =
  (schema: AnyZodObject) => async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = (await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      })) as { body?: unknown };

      // Only overwrite when the schema actually declared a body, so a
      // params-only or query-only schema does not wipe the request body.
      if (parsed && typeof parsed === 'object' && 'body' in parsed) {
        req.body = parsed.body;
      }

      return next();
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      return next(error);
    }
  };
