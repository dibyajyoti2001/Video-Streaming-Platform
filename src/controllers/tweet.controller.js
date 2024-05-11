import mongoose, { isValidObjectId } from "mongoose";
import { Tweet } from "../models/tweet.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const getUserTweets = asyncHandler(async (req, res) => {
  // Get the tweet id from params
  const { userId } = req.params;

  // Validate it
  if (!(userId && isValidObjectId(userId))) {
    throw new ApiError(400, "Invalid user id");
  }

  // Find the user by its id
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(400, "User not found");
  }

  // Get the user tweets using aggregation pipeline
  const allTweets = await Tweet.aggregate([
    // Stage-1: match the user id to find user tweets
    {
      $match: {
        owner: new mongoose.Types.ObjectId(userId),
      },
    },
    // Stage-2: join the user schema with the owner field of tweet schema
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "ownerDetails",
        pipeline: [
          // Stage-2.1: response necessary user details to owner details field
          {
            $project: {
              username: 1,
              "avatar.url": 1,
            },
          },
        ],
      },
    },
    // Stage-3: join the likes schema with tweet schema to find tweet likes
    {
      $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "tweet",
        as: "likeDetails",
        pipeline: [
          // Stage-3.1: response necessary details to the likeDetails field
          {
            $project: {
              likedBy: 1,
            },
          },
        ],
      },
    },
    // Stage-4: add all the fields to the tweet schema
    {
      $addFields: {
        likesCount: {
          $size: "$likeDetails",
        },
        ownerDetails: {
          $first: "$ownerDetails",
        },
        isLiked: {
          $cond: {
            if: {
              $in: [userId, "$ownerDetails.likedBy"],
            },
            then: true,
            else: false,
          },
        },
      },
    },
    {
      $sort: {
        createdAt: -1,
      },
    },
    {
      $project: {
        content: 1,
        ownerDetails: 1,
        likesCount: 1,
        createdAt: 1,
        isLiked: 1,
      },
    },
  ]);

  if (!allTweets) {
    throw new ApiError(500, "Error while fetching all Tweets");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, allTweets, "AllTweets fetched successfully"));
});

const createTweet = asyncHandler(async (req, res) => {
  // Get the tweet content from the frontend
  const { content } = req.body;

  // Validate it
  if (!content) {
    throw new ApiError(400, "Invalid content");
  }

  // Create an entry to the db
  const createdTweet = await Tweet.create({
    content,
    owner: req.user?._id,
  });

  if (!createdTweet) {
    throw new ApiError(500, "Invalid create tweet");
  }

  return res.status(201).json(new ApiResponse(200, createdTweet, "Success"));
});

const updateTweet = asyncHandler(async (req, res) => {
  // Get the tweet to update from body
  const { content } = req.body;
  const { tweetId } = req.params;

  // Validate it
  if (!content) {
    throw new ApiError(400, "Invalid content");
  }

  if (!(tweetId && isValidObjectId(tweetId))) {
    throw new ApiError(400, "Invalid tweet id");
  }

  // Get the old tweet details
  const tweet = await Tweet.findById(tweetId);

  if (!tweet) {
    throw new ApiError(404, "Tweet not found");
  }

  if (tweet?.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(400, "Only owner can edit their tweet");
  }

  // Update the tweet
  const updatedTweet = await Tweet.findByIdAndUpdate(
    tweetId,
    {
      $set: { content },
    },
    { new: true }
  );

  if (!updatedTweet) {
    throw new ApiError(500, "Error updating tweet");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, updatedTweet, "Tweet updated successfully"));
});

const deleteTweet = asyncHandler(async (req, res) => {
  // Get the tweet id from params
  const { tweetId } = req.params;

  // Validate it
  if (!(tweetId && isValidObjectId(tweetId))) {
    throw new ApiError(400, "Invalid tweet id");
  }

  // Get the old tweet details
  const tweet = await Tweet.findById(tweetId);

  if (!tweet) {
    throw new ApiError(404, "Tweet not found");
  }

  if (tweet?.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(400, "Only owner can delete their tweet");
  }

  // Delete the tweet
  const deletedTweet = await Tweet.findByIdAndDelete(tweetId);

  if (!deletedTweet) {
    throw new ApiError(500, "Error deleting tweet");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, {}, "Tweet deleted successfully"));
});

export { createTweet, getUserTweets, updateTweet, deleteTweet };
