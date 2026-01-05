import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import { FastifyInstance } from "fastify";

export type ActorType = "UI" | "RUNNER" | "SYSTEM";

export type JwtPayload = {
  sub: string; // actor id
  actorType: ActorType;
};

export const authPlugin = fp(async (app: FastifyInstance, opts: { secret: string }) => {
  await app.register(jwt, { secret: opts.secret });

  app.decorate(
    "requireAuth",
    async (request: any) => {
      await request.jwtVerify();
    }
  );
});

declare module "fastify" {
  interface FastifyInstance {
    requireAuth: (request: any) => Promise<void>;
  }
}
