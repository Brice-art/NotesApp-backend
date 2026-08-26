process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";

const request = require("supertest");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = require("../server");
const User = require("../models/User");

jest.mock("../models/User", () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
}));

describe("Auth routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = "test-secret";
  });

  test("POST /auth/signup creates a user and returns token", async () => {
    const mockUser = {
      _id: "user-123",
      name: "Jane Doe",
      email: "jane@example.com",
      password: "hashed-password",
    };

    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue(mockUser);

    const res = await request(app).post("/auth/signup").send({
      name: "Jane Doe",
      email: "jane@example.com",
      password: "secret123",
    });

    expect(res.statusCode).toBe(201);
    expect(User.findOne).toHaveBeenCalledWith({ email: "jane@example.com" });
    expect(User.create).toHaveBeenCalled();
    expect(res.body).toHaveProperty("token");
    expect(res.body.user.email).toBe("jane@example.com");
  });

  test("POST /auth/signup rejects duplicate email", async () => {
    User.findOne.mockResolvedValue({ email: "jane@example.com" });

    const res = await request(app).post("/auth/signup").send({
      name: "Jane Doe",
      email: "jane@example.com",
      password: "secret123",
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("User already exists");
  });

  test("POST /auth/login returns token for valid credentials", async () => {
    const password = "secret123";
    const hashed = await bcrypt.hash(password, 10);

    User.findOne.mockResolvedValue({
      _id: "user-123",
      name: "Jane Doe",
      email: "jane@example.com",
      password: hashed,
    });

    const res = await request(app).post("/auth/login").send({
      email: "jane@example.com",
      password,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body.user.email).toBe("jane@example.com");
  });

  test("POST /auth/login rejects invalid password", async () => {
    User.findOne.mockResolvedValue({
      _id: "user-123",
      email: "jane@example.com",
      password: await bcrypt.hash("correct-password", 10),
    });

    const res = await request(app).post("/auth/login").send({
      email: "jane@example.com",
      password: "wrong-password",
    });

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });

  test("GET /auth/me returns the authenticated user", async () => {
    const token = jwt.sign({ userId: "user-123" }, "test-secret", {
      expiresIn: "7d",
    });

    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: "user-123",
        name: "Jane Doe",
        email: "jane@example.com",
      }),
    });

    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.user.email).toBe("jane@example.com");
  });

  test("GET /auth/me rejects missing token", async () => {
    const res = await request(app).get("/auth/me");

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe("Authentication required");
  });
});
