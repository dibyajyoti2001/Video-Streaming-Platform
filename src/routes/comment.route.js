import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
  addComment,
  deleteComment,
  getVideoComments,
  updateComment,
} from "../controllers/comment.controller.js";

const router = Router();

// Apply middleware for all subscriptions routes
router.use(verifyJWT);

router.route("/:videoId").get(getVideoComments).post(addComment);

router.route("/comment/:commentId").delete(deleteComment).patch(updateComment);

export default router;
