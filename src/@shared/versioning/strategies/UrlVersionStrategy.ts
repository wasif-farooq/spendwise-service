import { ApiVersion } from '../ApiVersion';
import { Request } from 'express';

export class UrlVersionStrategy {
    static extract(req: Request): ApiVersion | null {
        const parts = req.url.split('/');
        // Assuming /api/v1/... format, parts[0] is empty, parts[1] is api, parts[2] is version
        // Or just /v1/... -> parts[1]
        // Let's assume standard /api/v1 prefix

        // Simple check - loop through valid versions
        for (const part of parts) {
            if (Object.values(ApiVersion).includes(part as ApiVersion)) {
                return part as ApiVersion;
            }
        }
        return null;
    }
}
