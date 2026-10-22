process.env.JWT_SECRET = "test-secret-for-logout-tests";

jest.mock("../src/utils/prisma", () => ({
  user: {
    findUnique: jest.fn()
  },
  revokedToken: {
    findUnique: jest.fn(),
    create: jest.fn()
  }
}));

const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const prisma = require("../src/utils/prisma");

const mockUser = {
  id: "test-user-123",
  name: "Test User",
  email: "test@example.com",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

const mockRevoked = new Set();

function createTestToken() {
  return jwt.sign(
    { sub: mockUser.id },
    process.env.JWT_SECRET,
    {
      jwtid: "test-token-id",
      expiresIn: "2h",
      issuer: "taskmaster-api",
      audience: "taskmaster-client"
    }
  );
}

describe("Secure logout", () => {
  let token;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRevoked.clear();

    token = createTestToken();

    prisma.user.findUnique.mockResolvedValue(mockUser);

    prisma.revokedToken.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(
        mockRevoked.has(where.jti) ? { jti: where.jti } : null
      )
    );

    prisma.revokedToken.create.mockImplementation(({ data }) => {
      mockRevoked.add(data.jti);
      return Promise.resolve(data);
    });
  });

  test("logout revokes the token and prevents it being reused", async () => {
    const logoutResponse = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${token}`);

    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.body.message).toBe("Logout successful.");
    expect(prisma.revokedToken.create).toHaveBeenCalledWith({
      data: {
        jti: "test-token-id",
        expiresAt: expect.any(Date)
      }
    });

    const meResponse = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(meResponse.status).toBe(401);
    expect(meResponse.body.error).toMatch(/revoked/i);
  });

  test("logout without a token returns 401", async () => {
    const response = await request(app).post("/api/auth/logout");

    expect(response.status).toBe(401);
    expect(prisma.revokedToken.create).not.toHaveBeenCalled();
  });

  test("an active valid token can access the current-user endpoint", async () => {
    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.user.id).toBe(mockUser.id);
  });
});
