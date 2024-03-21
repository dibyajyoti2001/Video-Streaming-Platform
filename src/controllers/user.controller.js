import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../model/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const registerUser = asyncHandler(async (req, res) => {
  // get user details from frontend
  const { fullName, username, email, password } = req.body;
  console.log("User details: ", fullName, username, email, password);

  // validate user details - not empty
  if (
    [fullName, username, email, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All fields must be required");
  } else if (!email.includes("@")) {
    throw new ApiError(400, "Invalid email address");
  }

  // check if user already exist - username and email
  const existedUser = User.findOne({
    $or: [{ username }, { email }],
  });

  console.log("Existing user: ", existedUser);

  if (existedUser) {
    throw new ApiError(409, "User already exists");
  }

  // check for images and avtar
  const avtarLocalPath = req.files?.avtar[0]?.path;
  const coverImageLocalPath = req.files?.coverImage[0]?.path;

  console.log("Avtar: ", avtarLocalPath);
  console.log("CoverImage: ", coverImageLocalPath);

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
  // remove password, refresh token field from response
  const user = await User.create({
    fullName,
    username: username.toLowerCase(),
    email,
    password,
    avtar: avtar.url,
    coverImage: coverImage?.url || "",
  });

  console.log("User created: ", user);

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  console.log("After user created: ", createdUser);

  // check user creation
  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering user");
  }

  // return response
  return res.status(201).json(new ApiResponse(200, createdUser, "Success"));
});

export { registerUser };
