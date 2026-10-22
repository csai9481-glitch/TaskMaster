jest.mock("../src/utils/prisma", () => ({}));

const request = require("supertest");
const app = require("../src/app");

describe("TaskMaster API", () => {
  test("GET / returns API information", async () => {
    const response = await request(app).get("/");

    expect(response.status).toBe(200);
    expect(response.body.name).toBe("TaskMaster API");
  });

  test("GET /health returns healthy status", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });

  test("unknown routes return 404", async () => {
    const response = await request(app).get("/route-that-does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Route not found.");
  });

  test("attachment listing requires authentication", async () => {
    const response = await request(app).get(
      "/api/tasks/024bfd9e-45ed-484d-97f0-c133a9bff7b3/attachments"
    );

    expect(response.status).toBe(401);
  });

  test("attachment upload requires authentication", async () => {
    const response = await request(app)
      .post("/api/tasks/024bfd9e-45ed-484d-97f0-c133a9bff7b3/attachments");

    expect(response.status).toBe(401);
  });

  test("attachment download requires authentication", async () => {
    const response = await request(app).get(
      "/api/attachments/15e8eddf-2ac1-4e41-a302-4c4bfc49eba5/download"
    );

    expect(response.status).toBe(401);
  });
});