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

router.route("/").get(getVideoComments).post(addComment);

router.route("/:commentId").patch(updateComment).delete(deleteComment);

export default router;
