import mongoose, { isValidObjectId } from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Subscription } from "../models/subscription.model.js";

const getUserChannelSubscribers = asyncHandler(async (req, res) => {
  // Get the channel id to find the channel subscribers
  const { channelId } = req.params;

  // Validate the channel id
  if (!(channelId && isValidObjectId(channelId))) {
    throw new ApiError(400, "Invalid channel id");
  }

  // Get the channel subscribers using aggregation pipeline
  const subscribersList = await Subscription.aggregate([
    // Stage-1: Match the channel id
    {
      $match: {
        channelId: new mongoose.Types.ObjectId(channelId),
      },
    },
    // Stage-2: Find the channel subscribers to join with user collection
    {
      $lookup: {
        from: "users",
        localField: "subscriber",
        foreignField: "_id",
        as: "subscribers",
        pipeline: [
          // Stage-2.1: Find the subscribers from the subscription collection channel
          {
            $lookup: {
              from: "subscriptions",
              localField: "_id",
              foreignField: "channel",
              as: "channelSubscriber",
            },
          },
          // Stage-2.2: Check if user is subscribed and Count the subscriber
          {
            $addFields: {
              isSubscribed: {
                $cond: {
                  if: {
                    $in: [channelId, "$channelSubscriber.subscriber"],
                  },
                  then: true,
                  else: false,
                },
              },
              subscribersCount: {
                $size: "$channelSubscriber",
              },
            },
          },
        ],
      },
    },
    // Stage-3: Deconstructs to the subscribers field
    {
      $unwind: "$subscribers",
    },
    // Stage-4: Return neccessary details
    {
      $project: {
        fullName: "$subscribers.fullName",
        username: "$subscribers.username",
        avtar: "$subscribers.avtar",
        isSubscribed: "$subscribers.isSubscribed",
        subscribersCount: "$subscribers.subscribersCount",
      },
    },
  ]);

  // Validate the subscriberList
  if (!subscribersList?.length) {
    throw new ApiError(500, "Subscriber list is not found");
  }

  return res
    .status(201)
    .json(
      new ApiResponse(
        200,
        subscribersList[0],
        "Subscribers fetched successfully"
      )
    );
});

export { getUserChannelSubscribers };
