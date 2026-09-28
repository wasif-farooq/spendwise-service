import { Request, Response, NextFunction } from 'express';
import { AuthRequestRepository } from '../repositories/AuthRequestRepository';

export class AuthController {
  constructor(private authRequestRepository: AuthRequestRepository) {}

  async login(req: Request, res: Response) {
    const result = await this.authRequestRepository.login(req.body);

    if (result.error) {
      res.status(result.statusCode || 400).json({ message: result.error });
      return;
    }

    res.json(result);
  }

  async register(req: Request, res: Response) {
    const result = await this.authRequestRepository.register(req.body);

    if (result.error) {
      res.status(result.statusCode || 400).json({ message: result.error });
      return;
    }

    res.status(201).json(result);
  }

  async verify2FA(req: Request, res: Response) {
    const result = await this.authRequestRepository.verify2FA(req.body);
    if (result.error) {
      res.status(result.statusCode || 400).json({ message: result.error });
      return;
    }
    res.json(result);
  }

  async resend2FA(req: Request, res: Response) {
    const result = await this.authRequestRepository.resend2FA(req.body);
    if (result.error) {
      res.status(result.statusCode || 400).json({ message: result.error });
      return;
    }
    res.json(result);
  }

  async verifyBackupCode(req: Request, res: Response) {
    const result = await this.authRequestRepository.verifyBackupCode(req.body);
    if (result.error) {
      res.status(result.statusCode || 400).json({ message: result.error });
      return;
    }
    res.json(result);
  }

  async forgotPassword(req: Request, res: Response) {
    const result = await this.authRequestRepository.forgotPassword(req.body);
    if (result.error) {
      res.status(result.statusCode || 400).json({ message: result.error });
      return;
    }
    res.json(result);
  }

  async verifyResetCode(req: Request, res: Response) {
    const result = await this.authRequestRepository.verifyResetCode(req.body);
    if (result.error) {
      res.status(result.statusCode || 400).json({ message: result.error });
      return;
    }
    res.json(result);
  }

  async resetPassword(req: Request, res: Response) {
    const result = await this.authRequestRepository.resetPassword(req.body);
    if (result.error) {
      res.status(result.statusCode || 400).json({ message: result.error });
      return;
    }
    res.json(result);
  }

  async verifyEmail(req: Request, res: Response) {
    const result = await this.authRequestRepository.verifyEmail(req.body);
    if (result.error) {
      res.status(result.statusCode || 400).json({ message: result.error });
      return;
    }
    res.json(result);
  }

  async getMe(req: Request, res: Response) {
    // userId should be attached by requireAuth middleware
    const userId = (req as any).user?.userId || (req as any).user?.sub || (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const result = await this.authRequestRepository.getMe(userId);
    if (result.error) {
      res.status(result.statusCode || 404).json({ message: result.error });
      return;
    }

    // Ensure user is serialized if it's an entity
    const userData =
      result.data && typeof result.data.toJSON === 'function' ? result.data.toJSON() : result.data;

    res.json({ ...result, data: userData });
  }

  async refresh(req: Request, res: Response) {
    const result = await this.authRequestRepository.refresh(req.body);
    if (result.error) {
      res.status(result.statusCode || 401).json({ message: result.error });
      return;
    }
    res.json(result);
  }

  async changePassword(req: Request, res: Response) {
    const userId = (req as any).user?.userId || (req as any).user?.sub;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const result = await this.authRequestRepository.changePassword(userId, req.body);
    if (result.error) {
      res.status(result.statusCode || 400).json({ message: result.error });
      return;
    }
    res.json(result);
  }

  /** Issue a one-time code so the web app can be opened already signed in. */
  async issueHandoff(req: Request, res: Response) {
    const userId = (req as any).user?.userId || (req as any).user?.sub;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const result = await this.authRequestRepository.issueHandoffCode(userId, req.body);
    if (result.error) {
      res.status(result.statusCode || 400).json({ message: result.error });
      return;
    }
    // The code is a credential for the next 60 seconds; keep it out of caches.
    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  }

  /** Exchange a handoff code for a token pair, in the same shape as login. */
  async exchangeHandoff(req: Request, res: Response) {
    const result = await this.authRequestRepository.exchangeHandoffCode(req.body);
    if (result.error) {
      res.status(result.statusCode || 401).json({ message: result.error });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  }

  async googleLogin(req: Request, res: Response) {
    // Web sends an authorization code; native apps send the ID token they got
    // from their own PKCE flow. The code path wins if both are present.
    const { code, idToken } = req.body;

    if (!code && !idToken) {
      res.status(400).json({ message: 'Authorization code or ID token required' });
      return;
    }

    const result = code
      ? await this.authRequestRepository.loginWithGoogle(code)
      : await this.authRequestRepository.loginWithGoogleIdToken(idToken);

    if (result.error) {
      res.status(result.statusCode || 400).json({ message: result.error });
      return;
    }

    res.json(result);
  }
}
