import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { AppRequest } from '../common/request';
import { IS_PUBLIC } from './decorators';
import { SESSION_COOKIE } from './session';

type JwtPayload = { sub: string; email: string };

/** Global guard: every route requires a valid session unless marked @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const token = this.extractToken(req);

    if (token) {
      try {
        const payload = await this.jwt.verifyAsync<JwtPayload>(token);
        req.user = { id: payload.sub, email: payload.email };
      } catch {
        if (!isPublic) throw new UnauthorizedException('Session expired — please sign in again');
      }
    }
    if (isPublic) return true;
    if (!req.user) throw new UnauthorizedException('Not signed in');
    return true;
  }

  private extractToken(req: AppRequest): string | undefined {
    const cookie = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    if (cookie) return cookie;
    const [scheme, value] = req.headers.authorization?.split(' ') ?? [];
    return scheme === 'Bearer' ? value : undefined;
  }
}
