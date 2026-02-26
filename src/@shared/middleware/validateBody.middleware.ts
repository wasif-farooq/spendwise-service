import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';

export const validateBody =
  (schema: AnyZodObject) => async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync(req.body);
      return next();
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      return res.status(400).json(error);
    }
  };

export const validateParams =
  (schema: AnyZodObject) => async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Parse only the params we need, not all params
      await schema.parseAsync(req.params);
      return next();
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      return res.status(400).json(error);
    }
  };
