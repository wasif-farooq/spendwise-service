import { Request, Response, NextFunction } from 'express';
import { AnyZodObject } from 'zod';

export const validateBody =
  (schema: AnyZodObject) => async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync(req.body);
      return next();
    } catch (error: any) {
      return res.status(400).json(error);
    }
  };

export const validateParams =
  (schema: AnyZodObject) => async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({ params: req.params });
      return next();
    } catch (error: any) {
      return res.status(400).json(error);
    }
  };
