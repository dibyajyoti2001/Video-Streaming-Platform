import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
  getSubscribedChannels,
  getUserChannelSubscribers,
  toggleSubscription,
} from "../controllers/subscription.controller.js";

const router = Router();

// Apply middleware for all subscriptions routes
router.use(verifyJWT);

router.route("/channel/:subscriberId").get(getSubscribedChannels);

router
  .route("/user/:channelId")
  .get(getUserChannelSubscribers)
  .post(toggleSubscription);

export default router;
