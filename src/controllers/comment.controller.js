import mongoose, { isValidObjectId } from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Comment } from "../models/comment.model.js";

const getVideoComments = asyncHandler(async (req, res) => {
  // Get the video id from params
  const { videoId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  // Validate it
  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video id");
  }

  // Use aggregation pipline to get comments
  const getComments = await Comment.aggregate([
    // Stage-1: match the video id to get comments
    {
      $match: {
        video: new mongoose.Types.ObjectId(videoId),
      },
    },
    // Stage-2: join the user with owner of comment schema
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owners",
      },
    },
    // Stage-3: join the likes schema to show the likes of the comment
    {
      $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "comment",
        as: "likes",
      },
    },
    // Stage-4: add these fields to the comment schema
    {
      $addFields: {
        likesCount: {
          $size: "$likes",
        },
        owner: {
          $first: "$owners",
        },
        isLiked: {
          $cond: {
            if: {
              $in: [req.user?._id, "$likes.likedBy"],
            },
            then: true,
            else: false,
          },
        },
      },
    },
  ]);

  // Validate the getComments
  if (!getComments) {
    throw new ApiError(500, "Error getting comments");
  }

  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
  };

  // Get the comments with pagination
  const comments = await Comment.aggregatePaginate(getComments, options);

  // Validate the comments
  if (!comments) {
    throw new ApiError(500, "Error getting comments");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, comments, "Fetched comment successfully"));
});

const addComment = asyncHandler(async (req, res) => {
  // Get content to comment from user body and also get video id to comment from params
  const { videoId } = req.params;
  const { content } = req.body;

  // Validate it
  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video id");
  }

  if (!content) {
    throw new ApiError(400, "Invalid content");
  }

  // Create a new comment entry to database
  const uploadComment = await Comment.create({
    content,
    video: videoId,
    owner: req.user?._id,
  });

  // Validate upload comment
  if (!uploadComment) {
    throw new ApiError(500, "Error while uploading comment");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, uploadComment, "Comment created successfully"));
});

const updateComment = asyncHandler(async (req, res) => {
  // Get the video id to update comment
  const { commentId } = req.params;
  const { content } = req.body;

  // Validate it
  if (!isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid video id");
  }

  if (!content) {
    throw new ApiError(400, "Invalid content");
  }

  // Get the old comment using comment id
  const getComment = await Comment.findById(commentId);

  if (req.user?._id.toString() !== getComment?.owner.toString()) {
    throw new ApiError(400, "User is not the owner of this comment");
  }

  // Update the comment
  const updatedComment = await Comment.findByIdAndUpdate(
    commentId,
    {
      $set: {
        content: content,
      },
    },
    {
      new: true,
    }
  );

  if (!updatedComment) {
    throw new ApiError(500, "Error updating comments");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, updatedComment, "Comment updated successfully"));
});

const deleteComment = asyncHandler(async (req, res) => {
  // Get commentId from params
  const { commentId } = req.params;

  // Validate it
  if (!(commentId && isValidObjectId(commentId))) {
    throw new ApiError(400, "Invalid comment id");
  }

  // Get the old comment using comment id
  const getComment = await Comment.findById(commentId);

  if (req.user?._id.toString() !== getComment?.owner.toString()) {
    throw new ApiError(400, "User is not the owner of this comment");
  }

  // Delete the comment
  const deletedComment = await Comment.findByIdAndDelete(commentId);

  if (!deletedComment) {
    throw new ApiError(500, "Error deleting comment");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, deletedComment, "Comment deleted successfully"));
});

export { addComment, getVideoComments, updateComment, deleteComment };
