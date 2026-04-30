import { Request, Response, NextFunction } from 'express';
import { ControllerRegistry } from '@shared/ControllerRegistry';

/**
 * Controller middleware - attaches controller to request via ControllerRegistry
 * Controller is cached as singleton, retrieved once per token
 */
export function controllerMiddleware(token: string) {
    return (req: Request, res: Response, next: NextFunction) => {
        const registry = ControllerRegistry.getInstance();
        
        if (!registry.hasFactory(token)) {
            console.error(`[ControllerMiddleware] No factory registered for token: ${token}`);
            return next(new Error(`Controller not configured: ${token}`));
        }
        
        try {
            const controller = registry.getController(token);
            console.log(`[ControllerMiddleware] Got controller for token: ${token}`, typeof controller);
            req.controller = controller;
            next();
        } catch (error) {
            console.error(`[ControllerMiddleware] Error getting controller for token: ${token}`, error);
            next(error);
        }
    };
}

// Extend Request type to include controller
declare global {
    namespace Express {
        interface Request {
            controller?: any;
        }
    }
}