const axios = require("axios");
const sharp = require("sharp");
const { send } = require("../lib/response");

async function main(args) {
  try {
    const { url } = args;

    if (!url) {
      return send(400, { success: false, error: "Missing 'url' parameter" });
    }

    const response = await axios.get(url, { responseType: "arraybuffer" });
    const buffer = Buffer.from(response.data);

    const metadata = await sharp(buffer).metadata();

    return send(200, {
      success: true,
      metadata: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        size: buffer.length
      }
    });
  } catch (error) {
    return send(500, { success: false, error: error.message || String(error) });
  }
}

exports.main = main;
