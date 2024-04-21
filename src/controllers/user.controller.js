import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import { deleteFromCloudinary } from "../utils/deleteImageAfterUpdate.js";

const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating access and refresh tokens"
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  // get user details from frontend
  const { fullName, username, email, password } = req.body;

  // validate user details - not empty
  if (
    [fullName, username, email, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All fields must be required");
  } else if (!email.includes("@")) {
    throw new ApiError(400, "Invalid email address");
  }

  // check if user already exist - username and email
  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existedUser) {
    throw new ApiError(409, "User already exists");
  }

  // check for images and avtar
  const avtarLocalPath = req.files?.avtar[0]?.path;

  let coverImageLocalPath;

  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }

  if (!avtarLocalPath) {
    throw new ApiError(400, "Avtar must be required");
  }

  // upload them to cloudinary
  const avtar = await uploadOnCloudinary(avtarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!avtar) {
    throw new ApiError(400, "Avtar must be required");
  }

  // create user object - create entry in db
  const user = await User.create({
    fullName,
    username: username.toLowerCase(),
    email,
    password,
    avtar: avtar.url,
    coverImage: coverImage?.url || "",
  });

  // remove password, refresh token field from response
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  // check user creation
  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering user");
  }

  // return response
  return res.status(201).json(new ApiResponse(200, createdUser, "Success"));
});

const loginUser = asyncHandler(async (req, res) => {
  // get user details from req.body
  const { username, email, password } = req.body;

  // check username or email
  if (!username && !email) {
    throw new ApiError(404, "username or email required");
  }

  // find user is registered or not
  const user = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // check password
  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid User Credentials");
  }

  // generate access & refresh token
  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  // send to user by cookies
  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(201)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged in successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  // Find the user id and undefined the user token
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: { refreshToken: undefined },
    },
    { new: true }
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(201)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logout successfully"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  // get the token from frontend using cookies
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  // validate if have incomingRefreshToken or not
  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized request");
  }

  try {
    // verify token in decoded form
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    // find the user by using decodedToken id
    const user = await User.findById(decodedToken._id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    // validate the incomingRefreshToken and user saved refresh token
    if (incomingRefreshToken !== user.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    // generate refresh token
    const { accessToken, newRefreshToken } =
      await generateAccessAndRefreshTokens(user._id);

    // send to user by cookies
    const options = {
      httpOnly: true,
      secure: true,
    };

    return res
      .status(201)
      .cookie("accessToken", accessToken, options)
      .cookie("newRefreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken: newRefreshToken },
          "Access token refreshed"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  // Get old password from body
  const { oldPassword, newPassword } = req.body;

  // Validate old password
  const user = await User.findById(req.user?._id);
  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordCorrect) {
    throw new ApiError(400, "Invalid password");
  }

  // Update old password
  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(201)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(201)
    .json(new ApiResponse(200, req.user, "Current user fetched successfully"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  // Get the user data to update
  const { fullName, email } = req.body;

  // Validate it
  if (!fullName || !email) {
    throw new ApiError(400, "All fields are required");
  }
  // Get user from id and update new data
  const user = await User.findByIdAndUpdate(
    req.user?._id,
    { $set: { fullName, email } },
    { new: true }
  ).select("-password");

  return res.status(201).json(200, user, "Account updated successfully");
});

const updateUserAvtar = asyncHandler(async (req, res) => {
  // Get the user avtar
  const avtarLocalPath = req.file?.path;

  // Validate it
  if (!avtarLocalPath) {
    throw new ApiError(400, "Avtar not found");
  }

  // Upload it on cloudinary
  const avtar = await uploadOnCloudinary(avtarLocalPath);

  if (!avtar.url) {
    throw new ApiError(400, "Invalid avtar");
  }

  // Retrive the old avtar image from the user document
  const user = await User.findById(req.user?.id).select("avtar");

  // Update avtar on database
  const updateUser = await User.findByIdAndUpdate(
    req.user?._id,
    { $set: { avtar: avtar.url } },
    { new: true }
  ).select("-password");

  // Delete old avtar from Cloudinary
  if (user.avtar) {
    // Extract public ID from old avtar URL
    const publicId = user.avtar.split("/").pop().split(".")[0];
    await deleteFromCloudinary(publicId);
  }

  return res
    .status(201)
    .json(200, { user: updateUser }, "Avtar updated successfully");
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  // Get the user cover image
  const coverImageLocalPath = req.file?.path;

  // Validate it
  if (!coverImageLocalPath) {
    throw new ApiError(400, "CoverImage not found");
  }

  // Upload it on cloudinary
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!coverImage.url) {
    throw new ApiError(400, "Invalid cover image");
  }

  // Retrive the cover image from the user document
  const user = await User.findById(req.user?.id).select("coverImage");

  // Update cover image on database
  const updateUser = await User.findByIdAndUpdate(
    req.user?._id,
    { $set: { coverImage: coverImage.url } },
    { new: true }
  ).select("-password");

  // Delete the old cover image from cloudinary
  if (user.coverImage) {
    const publicId = user.coverImage.split("/").pop().split(".")[0];
    await deleteFromCloudinary(publicId);
  }

  return res
    .status(201)
    .json(200, { user: updateUser }, "Cover image updated successfully");
});

const getUserChannelProfile = asyncHandler(async (req, res) => {
  // Get the username from request by user
  const { username } = req.params;

  // Validate it
  if (!username?.trim()) {
    throw new ApiError(400, "Username is missing");
  }

  // Find the username from database by using mongodb_aggregation pipeline
  const channel = await User.aggregate([
    // Stage-1: match the user
    {
      $match: {
        username: username?.toLowerCase(),
      },
    },
    // Stage-2: find how many subscribers of that user
    {
      $lookup: {
        from: "subscription",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers",
      },
    },
    // Stage-3: find how many channel the user will subscribedTo
    {
      $lookup: {
        from: "subscription",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo",
      },
    },
    // Stage-4: add the two subscribers and subscribedTo fields to the userSchema with counted format
    {
      $addFields: {
        subscribersCount: {
          $size: "$subscribers",
        },
        channelsSubscribedToCount: {
          $size: "$subscribedTo",
        },
        isSubscribed: {
          $cond: {
            if: { $in: [req.user?._id, "$subscribers.subscriber"] },
            then: true,
            else: false,
          },
        },
      },
    },
    // Stage-5: response to user neccessary details
    {
      $project: {
        fullName: 1,
        username: 1,
        subscribersCount: 1,
        channelsSubscribedToCount: 1,
        avtar: 1,
        coverImage: 1,
        email: 1,
      },
    },
  ]);

  if (!channel?.length) {
    throw new ApiError(400, "Channel does not exists");
  }

  return res
    .status(201)
    .json(
      new ApiResponse(200, channel[0], "User channel fetched successfully")
    );
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvtar,
  updateUserCoverImage,
  getUserChannelProfile,
};
