import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';

/**
 * Validate the request body and replace it with the parsed result.
 *
 * Assigning the result back is the point: zod strips keys the schema does not
 * declare, but only in its *output*. Discarding that output left undeclared
 * keys on req.body for controllers to pick up — which is how a client-supplied
 * `accountId` reached the transactions controller despite not being part of
 * CreateTransactionSchema.
 *
 * A schema is therefore now the complete list of fields an endpoint accepts.
 * Anything a controller reads from req.body must be declared, or it will
 * silently arrive as undefined.
 */
export const validateBody =
  (schema: AnyZodObject) => async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = await schema.parseAsync(req.body);
      return next();
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      return res.status(400).json(error);
    }
  };

/**
 * Params and query are validated but deliberately NOT replaced.
 *
 * Unlike the body, their keys come from the route pattern and query string and
 * are read individually by name, so there is no mass-assignment surface to
 * close. Reassigning them is also unsafe: Express repopulates req.params per
 * router layer, and req.query is a prototype getter that later Express
 * versions make read-only.
 */
export const validateParams =
  (schema: AnyZodObject) => async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync(req.params);
      return next();
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      return res.status(400).json(error);
    }
  };

export const validateQuery =
  (schema: AnyZodObject) => async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync(req.query);
      return next();
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      return res.status(400).json(error);
    }
  };
