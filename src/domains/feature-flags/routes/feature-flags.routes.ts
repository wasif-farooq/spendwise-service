import { Router } from 'express';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { FeatureFlagControllerFactory } from '@factories/FeatureFlagControllerFactory';

const router = Router();

router.get('/', (req, res) => {
    const container = Container.getInstance();
    const factory = container.resolve<FeatureFlagControllerFactory>(TOKENS.FeatureFlagControllerFactory);
    const controller = factory.create();
    return controller.getAll(req, res);
});

export default router;