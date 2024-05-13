import mongoose, { isValidObjectId } from "mongoose";
import { Playlist } from "../models/playlist.model.js";
import { Video } from "../models/video.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const createPlaylist = asyncHandler(async (req, res) => {
  // Get the data from the user, So that user can create a playlist
  const { name, description } = req.body;

  // Validate it
  if (!(name && description)) {
    throw new ApiError(400, "Invalid details");
  }

  // Create entry to the db
  const newPlaylist = await Playlist.create({
    name,
    description,
    owner: req.user?._id,
  });

  if (!newPlaylist) {
    throw new ApiError(500, "Playlist not found");
  }

  return res.status(201).json(new ApiResponse(200, newPlaylist, "Success"));
});

const getUserPlaylists = asyncHandler(async (req, res) => {
  // Get the user id to find user playlists
  const { userId } = req.params;

  // Validate it
  if (!(userId && isValidObjectId(userId))) {
    throw new ApiError(400, "Invalid user");
  }

  // Get the user playlists using aggregation pipeline
  const playlists = await Playlist.aggregate([
    // Stage-1: match the user by its id
    {
      $match: {
        owner: new mongoose.Types.ObjectId(userId),
      },
    },
    // Stage-2: join the video schema with playlist schema to show the videos playlist
    {
      $lookup: {
        from: "videos",
        localField: "videos",
        foreignField: "_id",
        as: "videos",
      },
    },
    // Stage-3: add the fields to the playlist schema
    {
      $addFields: {
        totalVideos: {
          $size: "$videos",
        },
        totalViews: {
          $sum: "$videos.views",
        },
      },
    },
    // Stage-4: project necessary details to user
    {
      $project: {
        name: 1,
        description: 1,
        totalVideos: 1,
        totalViews: 1,
        updatedAt: 1,
      },
    },
  ]);

  if (!playlists) {
    throw new ApiError(500, "Error while fetching playlists");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, playlists, "Playlist fetched successfully"));
});

const getPlaylistById = asyncHandler(async (req, res) => {
  // Get the particular playlist by its id
  const { playlistId } = req.params;

  // Validate it
  if (!playlistId) {
    throw new ApiError(400, "Invalid playlist");
  }

  // Find the playlist by its id using db query
  const playlist = await Playlist.findById(playlistId);

  if (!playlist) {
    throw new ApiError(400, "Playlist not found");
  }

  // Get the particular playlist when user search using aggregation pipeline
  const playlistVideos = await Playlist.aggregate([
    // Stage-1: find the playlist by matching with its id
    {
      $match: {
        _id: new mongoose.Types.ObjectId(playlistId),
      },
    },
    // Stage-2: join the video schema with the playlist to see the videos list
    {
      $lookup: {
        from: "videos",
        localField: "videos",
        foreignField: "_id",
        as: "videos",
      },
    },
    // Stage-3: again match videos is available or not
    {
      $match: {
        "videos.isPublished": true,
      },
    },
    // Stage-4: join user schema with the playlist to see the which user playlists
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
      },
    },
    // Stage-5: add the fields to the playlist
    {
      $addFields: {
        totalVideos: {
          $size: "$videos",
        },
        totalViews: {
          $sum: "$videos.views",
        },
        owner: {
          $first: "$owner",
        },
      },
    },
    // Stage-6: project neccessary details to the user
    {
      $project: {
        name: 1,
        description: 1,
        createdAt: 1,
        updatedAt: 1,
        totalVideos: 1,
        totalViews: 1,
        videos: {
          _id: 1,
          "video.url": 1,
          "thumbnail.url": 1,
          title: 1,
          description: 1,
          createdAt: 1,
          duration: 1,
          views: 1,
        },
        owner: {
          username: 1,
          fullName: 1,
          "avatar.url": 1,
        },
      },
    },
  ]);

  if (!playlistVideos) {
    throw new ApiError(500, "Error while fetching playlist");
  }

  return res
    .status(201)
    .json(
      new ApiResponse(
        200,
        playlistVideos,
        "Fetched video playlist successfully"
      )
    );
});

const addVideoToPlaylist = asyncHandler(async (req, res) => {
  // Get the video & playlist id to be added to the playlist
  const { playlistId, videoId } = req.params;

  // Validate it
  if (
    !(playlistId && videoId) ||
    !(isValidObjectId(playlistId) && isValidObjectId(videoId))
  ) {
    throw new ApiError(400, "Invalid video and playlist");
  }

  // Get the old video and playlist
  const video = await Video.findById(videoId);
  const playlist = await Playlist.findById(playlistId);

  if (!video) {
    throw new ApiError(400, "Video not found");
  }
  if (!playlist) {
    throw new ApiError(400, "Playlist not found");
  }

  if (
    (playlist.owner?.toString() && video.owner.toString()) !==
    req.user?._id.toString()
  ) {
    throw new ApiError(400, "only owner can add video to their playlist");
  }

  // Add the video to the playlist
  const addVideoToPlaylist = await Playlist.findByIdAndUpdate(
    playlistId,
    {
      $addToSet: {
        videos: videoId,
      },
    },
    { new: true }
  );

  if (!addVideoToPlaylist) {
    throw new ApiError(500, "Error while adding the video to the playlist");
  }

  return res
    .status(201)
    .json(
      new ApiResponse(
        200,
        addVideoToPlaylist,
        "Adding video to the playlist Successfully"
      )
    );
});

const removeVideoFromPlaylist = asyncHandler(async (req, res) => {
  // Get the video & playlist id to be added to the playlist
  const { playlistId, videoId } = req.params;

  // Validate it
  if (
    !(playlistId && videoId) ||
    !(isValidObjectId(playlistId) && isValidObjectId(videoId))
  ) {
    throw new ApiError(400, "Invalid video and playlist");
  }

  // Get the old video and playlist
  const video = await Video.findById(videoId);
  const playlist = await Playlist.findById(playlistId);

  if (!video) {
    throw new ApiError(400, "Video not found");
  }
  if (!playlist) {
    throw new ApiError(400, "Playlist not found");
  }

  if (
    (playlist.owner?.toString() && video.owner.toString()) !==
    req.user?._id.toString()
  ) {
    throw new ApiError(400, "only owner can add video to their playlist");
  }

  // Remove the video from the playlist
  const removeFromPlaylist = await Playlist.findByIdAndDelete(
    playlistId,
    {
      $pull: {
        videos: videoId,
      },
    },
    { new: true }
  );

  return res
    .status(201)
    .json(new ApiResponse(200, {}, "Delete video from playlist successfully"));
});

const updatePlaylist = asyncHandler(async (req, res) => {
  // Get the playlist id to update the playlist
  const { playlistId } = req.params;
  const { name, description } = req.body;

  // Validate it
  if (!(playlistId && isValidObjectId(playlistId))) {
    throw new ApiError(400, "Invalid playlist");
  }

  if (!(name && description)) {
    throw new ApiError(400, "Invalid playlist name and description");
  }

  // Get the old playlist
  const playlist = await Playlist.findById(playlistId);

  if (!playlist) {
    throw new ApiError(400, "Playlist not found");
  }

  if (playlist.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(400, "You are not authorized to delete the playlist");
  }

  // Update the playlist
  const updatedPlaylist = await Playlist.findByIdAndUpdate(
    playlistId,
    {
      $set: {
        name,
        description,
      },
    },
    { new: true }
  );

  if (!updatedPlaylist) {
    throw new ApiError(400, "Error while updating playlist");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, updatedPlaylist, "Updated successfully"));
});

const deletePlaylist = asyncHandler(async (req, res) => {
  // Get the playlist id to be delete
  const { playlistId } = req.params;

  // Validate it
  if (!(playlistId && isValidObjectId(playlistId))) {
    throw new ApiError(400, "Invalid playlist");
  }

  // Get the old playlist
  const playlist = await Playlist.findById(playlistId);

  if (!playlist) {
    throw new ApiError(400, "Playlist not found");
  }

  if (playlist.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(400, "You are not authorized to delete the playlist");
  }

  // Delete the playlist
  const deletedPlaylist = await Playlist.findByIdAndDelete(playlistId);

  if (!deletedPlaylist) {
    throw new ApiError(400, "Error while deleting playlist");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, {}, "Delete playlist successfully"));
});

export {
  createPlaylist,
  getUserPlaylists,
  getPlaylistById,
  addVideoToPlaylist,
  removeVideoFromPlaylist,
  updatePlaylist,
  deletePlaylist,
};
