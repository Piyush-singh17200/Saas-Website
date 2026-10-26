import { Router } from "express";
import { createSuccessResponse } from "@workspace/contracts";
import { healthRouter } from "./health.router.js";
import { authRouter } from "./auth.router.js";
import { organizationRouter } from "./organization.router.js";
import { invitationTokenRouter } from "./invitation-token.router.js";
import { v1DeveloperRouter } from "./v1-developer.router.js";
import { securityRouter } from "./security.router.js";
import { requireAuthenticatedUser } from "../middleware/auth.middleware.js";

export const apiV1Router: Router = Router();

apiV1Router.use("/", healthRouter);
apiV1Router.use("/auth", authRouter);
apiV1Router.use("/organizations", organizationRouter);
apiV1Router.use("/invitations", invitationTokenRouter);
apiV1Router.use("/", v1DeveloperRouter);
apiV1Router.use("/", securityRouter);

// GET /api/v1/me
apiV1Router.get("/me", requireAuthenticatedUser, (req, res) => {
  const user = req.user!;
  res.status(200).json(
    createSuccessResponse(
      {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          status: user.status,
          createdAt: user.createdAt.toISOString(),
          mfaEnabled: user.mfaEnabled ?? false,
        },
      },
      req.id,
    ),
  );
});
