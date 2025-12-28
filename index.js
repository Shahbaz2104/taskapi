const http = require("http");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  const { method, url } = req;

  if (method === "GET" && url === "/health") {
    res.writeHead(200, {
      "Content-type": "application/json",
    });
    res.end(
      JSON.stringify({
        status: "OK",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  res.writeHead(400, {
    "Content-type": "application/json",
  });
  res.end(
    JSON.stringify({
      error: "Route not found",
    })
  );
});


server.listen(PORT,()=>{
    console.log(`Server is running on ${PORT}`)
})
    