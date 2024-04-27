import mongoose, { isValidObjectId } from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { Video } from "../models/video.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { deleteFromCloudinary } from "../utils/deleteImageAfterUpdate.js";

const getAllVideos = asyncHandler(async (req, res) => {
  // Get all videos by query
  const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query;

  // Validate if userId empty and from database
  if (!(userId && isValidObjectId(userId))) {
    throw new ApiError(400, "Invalid userId");
  }

  // Get all videos by using aggregation pipeline
  const videoAggregate = await Video.aggregate([
    // Stage-1: Match the userId
    {
      $match: {
        $or: [
          {
            owner: new mongoose.Types.ObjectId(userId),
          },
          {
            title: {
              $regex: query,
            },
          },
        ],
      },
    },
    // Stage 2: Lookup user details
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "ownerDetails",
        pipeline: [
          {
            $project: {
              username: 1,
              avtar: 1,
            },
          },
        ],
      },
    },
    // Stage 3: Unwind owner details
    {
      $unwind: "$ownerDetails",
    },
    // Stage 2: Sort by specified criteria or default to createdAt descending
    {
      $sort: {
        [sortBy ? sortBy : "createdAt"]: sortType === "asc" ? 1 : -1,
      },
    },
  ]);

  // Optionally paginate the result
  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
  };

  const video = await Video.aggregatePaginate(videoAggregate, options);

  // Validate if video exists
  if (!video || video.totalDocs === 0) {
    throw new ApiError(500, "Video not found");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, video, "Video fetched successfully"));
});

const publishAVideo = asyncHandler(async (req, res) => {
  // Get neccessary information for video creation
  const { title, description } = req.body;

  // Validate title and description
  if (!(title && description)) {
    throw new ApiError(400, "All fields are required");
  }

  // Check for video file and thumbnail
  const videoFileLocalPath = req.files?.videoFile[0]?.path;
  const thumbnailLocalPath = req.files?.thumbnail[0]?.path;

  // Validate local path
  if (!(videoFileLocalPath && thumbnailLocalPath)) {
    throw new ApiError(400, "Local path is required");
  }

  // Upload it on cloudinary
  const videoFile = await uploadOnCloudinary(videoFileLocalPath);
  const thumbnail = await uploadOnCloudinary(thumbnailLocalPath);

  // Validate the video file and thumbnail
  if (!(videoFile && thumbnail)) {
    throw new ApiError(400, "VideoFile and Thumbnail are required");
  }

  // Create video - create entry in db
  const video = await Video.create({
    title,
    description,
    videoFile: videoFile.url,
    thumbnail: thumbnail.url,
    duration: videoFile.duration,
    owner: new mongoose.Types.ObjectId(req.user?._id),
  });

  // Check video creation
  if (!video) {
    throw new ApiError(500, "Something went wrong while creating video");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, video, "Video created successfully"));
});

const getVideoById = asyncHandler(async (req, res) => {
  // Get video id from params
  const { videoId } = req.params;

  // Validate if video id empty and from database
  if (!(videoId && isValidObjectId(videoId))) {
    throw new ApiError(400, "Invalid video id");
  }

  // Find video by video id from database
  const userVideo = await Video.findById(videoId);

  // Validate user video
  if (!userVideo) {
    throw new ApiError(500, "Video not found");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, userVideo, "Video fetched successfully"));
});

const updateVideo = asyncHandler(async (req, res) => {
  // Get video id from params
  const { videoId } = req.params;

  // Validate if video exists and from database
  if (!(videoId && isValidObjectId(videoId))) {
    throw new ApiError(400, "Invalid video id");
  }

  // Get video details to update
  const { title, description } = req.body;

  // Validate it
  if (!(title && description)) {
    throw new ApiError(400, "All fields are required");
  }

  // Get the old thumbnail path
  const oldVideo = await Video.findById(videoId);
  const oldThumbnail = oldVideo.thumbnail;

  // Find the thumbnail path from multer and validate it
  const thumbnailLocalPath = req.file?.path;

  if (!thumbnailLocalPath) {
    throw new ApiError(400, "File path missing");
  }

  // Upload thumbnail on cloudinary and validate it
  const thumbnail = await uploadOnCloudinary(thumbnailLocalPath);

  if (!thumbnail.url) {
    throw new ApiError(400, "Thumbnail URL missing");
  }

  // Update the video details
  const updateVideoDetails = await Video.findByIdAndUpdate(
    videoId,
    {
      $set: {
        title,
        description,
        thumbnail: thumbnail.url,
      },
    },
    { new: true }
  ).select("-videoFile -duration");

  // Delete old thumbnail from cloudinary
  if (oldThumbnail) {
    // Extract public ID from old avtar URL
    const publicId = oldThumbnail.split("/").pop().split(".")[0];
    await deleteFromCloudinary(publicId);
  }

  return res
    .status(201)
    .json(
      new ApiResponse(
        200,
        { video: updateVideoDetails },
        "Video updated successfully"
      )
    );
});

const deleteVideo = asyncHandler(async (req, res) => {
  // Get the video id from params
  const { videoId } = req.params;

  // Validate if video exists and from database
  if (!(videoId && isValidObjectId(videoId))) {
    throw new ApiError(400, "Invalid video id");
  }

  // Get the video details to be deleted
  const video = await Video.findById(videoId);

  // Validate if video exists
  if (!video) {
    throw new ApiError(400, "Video not found");
  }

  // Delete the video details from database
  const deleteVideoDetails = await Video.findByIdAndDelete(video);

  // Validate if video details successfully deleted
  if (!deleteVideoDetails) {
    throw new ApiError(500, "Video details not deleted properly");
  }

  // Delete the videoFile and thumbnail from cloudinary database
  if (video.videoFile) {
    // Extract public ID from old avtar URL
    const publicId = video.videoFile.split("/").pop().split(".")[0];
    await deleteFromCloudinary(publicId);
  }

  if (video.thumbnail) {
    // Extract public ID from old avtar URL
    const publicId = video.thumbnail.split("/").pop().split(".")[0];
    await deleteFromCloudinary(publicId);
  }

  return res
    .status(201)
    .json(new ApiResponse(200, {}, "Video delete successfully"));
});

const togglePublishStatus = asyncHandler(async (req, res) => {
  // Get the vide id from params
  const { videoId } = req.params;

  // Validate if video exists and from database
  if (!(videoId && isValidObjectId(videoId))) {
    throw new ApiError(400, "Invalid video id");
  }

  // Get the video details from the database
  const video = await Video.findById(videoId);

  // Validate if video exists
  if (!video) {
    throw new ApiError(400, "Video not found");
  }

  // Update the details
  const updateToggleStatus = await Video.findByIdAndUpdate(
    videoId,
    {
      $set: {
        isPublished: !video.isPublished,
      },
    },
    { new: true }
  );

  // Validate if update status exists
  if (!updateToggleStatus) {
    throw new ApiError(500, "Update status not found");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, updateToggleStatus, "Update successfully"));
});

export {
  getAllVideos,
  publishAVideo,
  getVideoById,
  updateVideo,
  deleteVideo,
  togglePublishStatus,
};
