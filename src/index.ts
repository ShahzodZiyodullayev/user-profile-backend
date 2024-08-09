import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import cors from "cors";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import fs, { readdir, unlink } from "fs/promises";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(
  cors({
    origin: "https://user-profile-henna.vercel.app", // Ruxsat berilgan domen
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
  }),
);

// __dirname ni ESM rejimida aniqlash
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.diskStorage({
  destination: function (_req, _file, callback) {
    callback(null, "./uploads");
  },
  filename: function (_req, file, callback) {
    const filename = file.originalname;
    callback(null, filename);
  },
});

const upload = multer({
  dest: "uploads/",
  storage: storage,
});

const JWT_ACCESS_SECRET_KEY = "your-access-token-key";
const JWT_REFRESH_SECRET_KEY = "your-refresh-token-key";

const usersFilePath = "./src/users.json";

// Utility functions
const readUsersFromFile = async (): Promise<any[]> => {
  const data = await fs.readFile(usersFilePath, { encoding: "utf-8" });
  return JSON.parse(data);
};

const writeUsersToFile = async (users: any[]): Promise<void> => {
  await fs.writeFile(usersFilePath, JSON.stringify(users, null, 2), {
    encoding: "utf-8",
  });
};

app.post("/api/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const users = readUsersFromFile();

  // Find user in "database"
  const user = (await users).find(
    (u) => u.email === email && u.password === password,
  );

  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  // Generate tokens
  const accessToken = jwt.sign({ userId: user.userId }, JWT_ACCESS_SECRET_KEY, {
    expiresIn: "1h",
  });
  const refreshToken = jwt.sign(
    { userId: user.userId },
    JWT_REFRESH_SECRET_KEY,
    {
      expiresIn: "1h",
    },
  );

  res.json({
    data: {
      userId: user.userId,
      accessToken,
      refreshToken,
    },
    status: 200,
  });
});

app.post("/api/register", async (req: Request, res: Response) => {
  const { email, password, firstName, lastName } = req.body;
  const users = readUsersFromFile();

  // Check if the user already exists
  if ((await users).find((u) => u.email === email)) {
    return res.status(409).json({ message: "User already exists" });
  }

  // Create a new user
  const newUser = {
    userId: uuid(),
    email,
    password, // Note: In production, you should hash the password!
    firstName,
    lastName,
  };

  // Save the new user to the "database"
  (await users).push(newUser);
  writeUsersToFile(await users);

  res
    .status(201)
    .json({ message: "User registered successfully", userId: newUser.userId });
});

app.get("/api/users", async (req: Request, res: Response) => {
  const { userId } = req.query;

  const users = readUsersFromFile();

  // Find user in "database"
  const user = (await users).find((u) => u.userId === userId);

  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  res.json({
    firstName: user.firstName,
    lastName: user.lastName,
    street: user.street,
    country: user.country,
    city: user.city,
    avatar: user.avatar,
    bio: user.bio,
  });
});

const deleteOld = async (_req: any, _res: any, next: () => void) => {
  try {
    const dirName = __dirname.split("\\");

    dirName.splice(dirName.length - 1, 1);

    const uploadsDir = path.join(dirName.join("\\"), "uploads");
    const files = await readdir(uploadsDir);

    const deletePromises = files.map(async (file) => {
      const filePath = path.join(uploadsDir, file);

      // Fayl kengaytmasini tekshirish (jpg, jpeg, png)
      if (/\.(jpg|jpeg|png)$/.test(file)) {
        await unlink(filePath);
        console.log(`Fayl o‘chirildi: ${filePath}`);
      }
    });

    await Promise.all(deletePromises);
    console.log("Barcha rasm fayllari o‘chirildi.");
  } catch (error) {
    console.error("Xatolik yuz berdi:", error);
  }

  next();
};

app.put(
  "/api/update-user",
  deleteOld,
  upload.any(),
  async (req: Request, res: Response) => {
    const { userId, firstName, lastName, street, country, city, bio } =
      req.body;

    const files: any = req.files;
    const avaName = `./src/api/uploads/${files[0].originalname}`;

    const users = await readUsersFromFile();

    // Find user in "database"
    const userIndex = users.findIndex((u) => u.userId === userId);

    if (userIndex === -1) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update user information
    const updatedUser = {
      firstName: firstName || users[userIndex].firstName,
      lastName: lastName || users[userIndex].lastName,
      street: street || users[userIndex].street,
      country: country || users[userIndex].country,
      city: city || users[userIndex].city,
      avatar: avaName || users[userIndex].avatar,
      bio: bio || users[userIndex].bio,
    };

    // Replace old user data with updated data
    users[userIndex] = { ...updatedUser, ...users[userIndex] };

    // Save the updated user to the "database"
    await writeUsersToFile(users);

    res
      .status(200)
      .json({ message: "User updated successfully", data: updatedUser });
  },
);

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
