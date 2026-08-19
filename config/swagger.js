const swaggerJSDoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Task Management API",
      version: "1.1.0",
      description:
        "RESTful Task Management API with JWT authentication, role-based access control (admin/user), input validation, rate limiting, and pagination.",
    },
    servers: [
      { url: "http://localhost:3000", description: "Local development" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Token returned by /auth/register or /auth/login",
        },
      },
      schemas: {
        User: {
          type: "object",
          properties: {
            _id: { type: "string", example: "65f1b2c3d4e5f6a7b8c9d0e1" },
            username: { type: "string", example: "alice" },
            email: { type: "string", example: "alice@example.com" },
            emailVerified: { type: "boolean" },
            role: { type: "string", enum: ["admin", "user"] },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Task: {
          type: "object",
          properties: {
            _id: { type: "string", example: "65f1b2c3d4e5f6a7b8c9d0e2" },
            title: { type: "string", example: "Write audit report" },
            description: { type: "string", example: "Document all findings" },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "completed"],
            },
            priority: { type: "string", enum: ["low", "medium", "high"] },
            dueDate: { type: "string", format: "date-time", nullable: true },
            tags: { type: "array", items: { type: "string" } },
            recurrence: {
              type: "string",
              enum: ["daily", "weekly", "monthly"],
              nullable: true,
            },
            user: { type: "string", example: "65f1b2c3d4e5f6a7b8c9d0e1" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        TaskList: {
          type: "object",
          properties: {
            tasks: {
              type: "array",
              items: { $ref: "#/components/schemas/Task" },
            },
            total: { type: "integer", example: 12 },
            page: { type: "integer", example: 1 },
            limit: { type: "integer", example: 10 },
            totalPages: { type: "integer", example: 2 },
          },
        },
        AuthResponse: {
          type: "object",
          properties: {
            accessToken: {
              type: "string",
              description: "JWT access token (15m)",
            },
            refreshToken: {
              type: "string",
              description: "Opaque refresh token (7d, rotated on use)",
            },
            tokenType: { type: "string", example: "Bearer" },
            expiresIn: {
              type: "integer",
              description: "Access token lifetime in seconds",
            },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: { type: "string", example: "Task not found" },
          },
        },
      },
    },
  },
  apis: ["./controllers/*.js"],
};

module.exports = swaggerJSDoc(options);
