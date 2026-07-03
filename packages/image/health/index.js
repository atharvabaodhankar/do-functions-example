const { send } = require("../lib/response");

async function main() {
  return send(200, {
    status: "healthy",
    timestamp: new Date().toISOString(),
    runtime: "nodejs:22",
    service: "serverless-image-optimizer"
  });
}

exports.main = main;
