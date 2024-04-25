import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { uploadOnCloudinary } from "../utils/cloudinary";
import { Video } from "../models/video.model";
import { ApiResponse } from "../utils/ApiResponse";
import mongoose from "mongoose";
import { deleteFromCloudinary } from "../utils/deleteImageAfterUpdate";

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

  // Validate it
  if (!videoId) {
    throw new ApiError(400, "Invalid video id");
  }

  // Check if video id exists or not in the database
  if (!mongoose.isValidObjectId(videoId)) {
    throw new ApiError(400, "Video id not verified");
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

  // Validate it
  if (!videoId) {
    throw new ApiError(400, "Invalid video id");
  }

  // Check if video id exists or not in the database
  if (!mongoose.isValidObjectId(videoId)) {
    throw new ApiError(400, "Video id not verified");
  }

  // Get video details to update
  const { title, description } = req.body;

  // Validate it
  if (!(title && description)) {
    throw new ApiError(400, "All fields are required");
  }

  // Find the thumbnail path from multer and validate it
  const thumbnailLocalPath = req.files?.path;

  if (!thumbnailLocalPath) {
    throw new ApiError(400, "File path missing");
  }

  // Upload thumbnail on cloudinary and validate it
  const thumbnail = await uploadOnCloudinary(thumbnailLocalPath);

  if (!thumbnail.url) {
    throw new ApiError(400, "Thumbnail URL missing");
  }

  // Retrieve the old video details from database
  const video = await Video.findById(videoId).select(
    "title description thumbnail"
  );

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
  if (video.thumbnail) {
    // Extract public ID from old avtar URL
    const publicId = video.thumbnail.split("/").pop().split(".")[0];
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

export { publishAVideo, getVideoById, updateVideo };
