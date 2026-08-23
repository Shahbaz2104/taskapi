// Zod-based request validation for newer endpoints. Existing routes keep
// express-validator (middleware/validate.js); new surfaces prefer zod for
// composable schemas. Errors follow the project's `{ error }` shape using
// the first failing issue, e.g. "body.ids.0: Invalid input".

const SOURCES = {
  body: (req) => req.body,
  query: (req) => req.query,
  params: (req) => req.params,
};

const zodValidate =
  (schema, source = "body") =>
  (req, res, next) => {
    const result = schema.safeParse(SOURCES[source](req));
    if (!result.success) {
      const issue = result.error.issues[0];
      const label = [source, ...issue.path].filter(Boolean).join(".");
      return res.status(400).json({ error: `${label}: ${issue.message}` });
    }
    if (source === "body") req.body = result.data;
    next();
  };

module.exports = { zodValidate };
