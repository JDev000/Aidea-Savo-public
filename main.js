const express = require("express");
const { readFileSync, createReadStream, createWriteStream } = require("fs");
const login = require("facebook-chat-api");
const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const dotenv = require("dotenv");
const google = require('googlethis');
const path = require('path');

const app = express();
const port = 3000;
const prefix = "aidea";

dotenv.config();

const mySecret = process.env.API_KEY;
const genAI = new GoogleGenerativeAI(mySecret);

const generationConfig = {
  stopSequences: ["red"],
  maxOutputTokens: 4000,
  temperature: 1,
  topP: 0.1,
  topK: 16,
};

const model = genAI.getGenerativeModel({
  model: "gemini-pro",
  generationConfig,
});

app.use("/", (req, res) => {
  res.send("Server is running...");
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on PORT ${port}`);
});

const downloadImage = async (url, filepath) => {
  const writer = createWriteStream(filepath);

  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream'
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
};

const sendMessageWithImage = (api, threadID, filepath) => {
  const msg = {
    body: "",
    attachment: createReadStream(filepath)
  };

  api.sendMessage(msg, threadID);
};

const searchImages = async (query, api, threadID) => {
  try {
    const images = await google.image(query, { safe: false });
    if (images.length > 0) {
      const imageUrl = images[0].url;
      const filepath = path.join('./img', 'downloaded_image.jpg');
      await downloadImage(imageUrl, filepath);
      console.log(`Image downloaded at ${filepath}`);

      sendMessageWithImage(api, threadID, filepath);
    }
  } catch (error) {
    console.error(error);
  }
};

const loginPath = {
  appState: JSON.parse(readFileSync(__dirname + "/appstate.json", "utf-8")),
};

login(loginPath, (err, api) => {
  if (err) return console.error(err);
  

  api.listenMqtt(async (error, event) => {
    if (error) return console.error(error);

    api.setMessageReaction(":like:", event.messageID, (err) => {
        if (err) return console.error(err);
    }, true);


    if (event && event.body && event.body === "pogi") {
      const msg = {
        body: "Domnard 'Pogi' Sunga",
        attachment: createReadStream(__dirname + '/pogi.jpg')
      };

      api.sendMessage(msg, event.threadID, event.messageID);
    }

    if (event && event.body && event.body.startsWith(prefix)) {
      const userRequest = event.body.substring(prefix.length).trim();

      try {
        const result = await model.generateContent(userRequest);
        const response = await result.response;
        const text = response.text();

        api.sendMessage(text, event.threadID, event.messageID);

      } catch (generateError) {
        console.error("Error generating response:", generateError);
      }
    }

    if (event && event.body && event.body.startsWith("img")) {
      const query = event.body.substring("img".length).trim();
      searchImages(query, api, event.threadID);
    }
  });
});
