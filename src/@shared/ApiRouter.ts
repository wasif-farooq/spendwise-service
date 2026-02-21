import { Router } from 'express';
import authRoutesV1 from '@domains/auth/routes/auth.routes';
import userRoutesV1 from '@domains/users/routes/user.routes';
import organizationRoutesV1 from '@domains/organizations/routes/organization.routes';
import settingsRoutesV1 from '@domains/settings/settings.routes';
import featureFlagsRoutesV1 from '@domains/feature-flags/routes/feature-flags.routes';
import subscriptionRoutesV1 from '@domains/subscription/routes/subscription.routes';


export class ApiRouter {
    private router: Router;

    constructor() {
        this.router = Router();
        this.configureRoutes();
    }

    private configureRoutes() {
        // V1 Routes
        this.router.use('/v1/auth', authRoutesV1);
        this.router.use('/v1/users', userRoutesV1);
        this.router.use('/v1/organizations', organizationRoutesV1);
        this.router.use('/v1/settings', settingsRoutesV1);
        this.router.use('/v1/feature-flags', featureFlagsRoutesV1);
        this.router.use('/v1/subscription', subscriptionRoutesV1);

        // V2 Routes could go here
        // this.router.use('/v2/auth', authRoutesV2);
    }

    public getRouter(): Router {
        return this.router;
    }
}
