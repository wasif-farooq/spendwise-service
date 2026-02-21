import 'reflect-metadata';
import { Container } from '@di/Container';

export function Inject(token: string) {
    return function (target: any, propertyKey: string | undefined, parameterIndex: number) {
        // In a full implementation, we would register metadata here
        // and resolve dependencies during instantiation via the Container.
        // For this simplified version without a complex resolve chain, 
        // we might need more logic or just stick to property injection or constructor metadata.

        // For now, let's assume property injection for simplicity in this scaffold
        // or constructor injection metadata key.
    };
}
