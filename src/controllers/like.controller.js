import mongoose, { isValidObjectId } from "mongoose";
import { Like } from "../models/like.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const toggleVideoLike = asyncHandler(async (req, res) => {
  // Get the video likes by its id
  const { videoId } = req.params;

  // Validate it
  if (!(videoId && isValidObjectId(videoId))) {
    throw new ApiError(400, "Invalid video id");
  }

  // Check if user is already liked
  const alreadyLiked = await Like.findOne({
    video: videoId,
    likedBy: req.user?._id,
  });

  // If liked then dislike it
  if (alreadyLiked) {
    await Like.findByIdAndDelete(alreadyLiked._id);

    return res
      .status(201)
      .json(new ApiResponse(200, { isLiked: false }, "Dislike successfully"));
  }

  // If not liked then create a new like
  const likedVideo = await Like.create({
    video: videoId,
    likedBy: req.user?._id,
  });

  if (!likedVideo) {
    throw new ApiResponse(500, "Error while like a video");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, likedVideo, "Like successfully"));
});

const toggleCommentLike = asyncHandler(async (req, res) => {
  // Get the comment like by its id
  const { commentId } = req.params;

  // Validate it
  if (!(commentId && isValidObjectId(commentId))) {
    throw new ApiError(400, "Invalid comment id");
  }

  // Check if user is already liked
  const alreadyLiked = await Like.findOne({
    comment: commentId,
    likedBy: req.user?._id,
  });

  // If liked then dislike it
  if (alreadyLiked) {
    await Like.findByIdAndDelete(alreadyLiked._id);

    return res
      .status(201)
      .json(new ApiResponse(200, { isLiked: false }, "Dislike successfully"));
  }

  // If not liked then create a new like
  const likedComment = await Like.create({
    comment: commentId,
    likedBy: req.user?._id,
  });

  if (!likedComment) {
    throw new ApiResponse(500, "Error while like a comment");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, likedComment, "Like successfully"));
});

const toggleTweetLike = asyncHandler(async (req, res) => {
  // Get the tweet like by its id
  const { tweetId } = req.params;

  // Validate it
  if (!(tweetId && isValidObjectId(tweetId))) {
    throw new ApiError(400, "Invalid tweet id");
  }

  // Check if user is already liked
  const alreadyLiked = await Like.findOne({
    tweet: tweetId,
    likedBy: req.user?._id,
  });

  // If liked then dislike it
  if (alreadyLiked) {
    await Like.findByIdAndDelete(alreadyLiked._id);

    return res
      .status(201)
      .json(new ApiResponse(200, { isLiked: false }, "Dislike successfully"));
  }

  // If not liked then create a new like
  const likedTweet = await Like.create({
    tweet: tweetId,
    likedBy: req.user?._id,
  });

  if (!likedTweet) {
    throw new ApiResponse(500, "Error while like a tweet");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, likedTweet, "Like successfully"));
});

const getLikedVideos = asyncHandler(async (req, res) => {
  // Get the likes videos by its id
  const { videoId } = req.params;

  // Validate it
  if (!(videoId && isValidObjectId(videoId))) {
    throw new ApiError(400, "Invalid video id");
  }

  // Get the liked videos list by using aggregation pipeline
  const allLikedVideos = await Like.aggregate([
    // Stage-1: match the video by its id
    {
      $match: {
        video: new mongoose.Types.ObjectId(videoId),
      },
    },
    // Stage-2: join the video schema with like schema to get the video details
    {
      $lookup: {
        from: "videos",
        localField: "video",
        foreignField: "_id",
        as: "likedVideos",
        pipeline: [
          // Stage-2.1: join the user schema with the video schema to get which user video it is
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "ownerDetails",
            },
          },
          // Stage-2.2: deconstruct the owner details
          {
            $unwind: "$ownerDetails",
          },
        ],
      },
    },
    // Stage-3: Deconstruct the likedVideos
    {
      $unwind: "$likedVideos",
    },
    // Stage-4: Sort the liked videos by createdAt
    {
      $sort: {
        createdAt: -1,
      },
    },
    // Stage-5: Response necessary details to user
    {
      $project: {
        _id: 0,
        likedVideos: {
          _id: 1,
          "videoFile.url": 1,
          "thumbnail.url": 1,
          owner: 1,
          title: 1,
          description: 1,
          views: 1,
          duration: 1,
          createdAt: 1,
          isPublished: 1,
          ownerDetails: {
            username: 1,
            fullName: 1,
            "avatar.url": 1,
          },
        },
      },
    },
  ]);

  if (!allLikedVideos) {
    throw new ApiResponse(500, "Error getting liked videos");
  }

  return res
    .status(201)
    .json(
      new ApiResponse(200, allLikedVideos, "LikeVideos fetched successfully")
    );
});

export { toggleVideoLike, toggleCommentLike, toggleTweetLike, getLikedVideos };
