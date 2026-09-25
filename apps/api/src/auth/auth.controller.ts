import { Body, Controller, Get, HttpCode, Inject, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import { ENV, Env } from '../config/env';
import type { AuthUser } from '../common/request';
import { ZodPipe } from '../common/zod.pipe';
import { AuthService, SignupInput } from './auth.service';
import { CurrentUser, Public } from './decorators';
import { clearSessionCookie, setSessionCookie } from './session';

const password = z.string().min(10, 'Password must be at least 10 characters').max(200);
const base = { name: z.string().trim().min(1).max(80), email: z.email().max(254), password };
const SignupSchema = z.union([
  z.object({ ...base, orgName: z.string().trim().min(2).max(80) }),
  z.object({ ...base, inviteToken: z.string().min(10).max(128) }),
]);
const LoginSchema = z.object({ email: z.email(), password: z.string().min(1).max(200) });

@Controller('auth')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Post('signup')
  async signup(@Body(new ZodPipe(SignupSchema)) body: SignupInput, @Res({ passthrough: true }) res: Response) {
    const { user, orgId, token } = await this.auth.signup(body);
    setSessionCookie(res, token, this.env);
    return { user, orgId };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body(new ZodPipe(LoginSchema)) body: z.infer<typeof LoginSchema>, @Res({ passthrough: true }) res: Response) {
    const { user, token } = await this.auth.login(body.email, body.password);
    setSessionCookie(res, token, this.env);
    return { user };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    clearSessionCookie(res, this.env);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
